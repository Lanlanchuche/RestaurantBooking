"""
dijkstra_service.py

Dịch vụ tính toán khoảng cách đường bộ và tìm các chi nhánh nhà hàng gần nhất.
Sử dụng OSMnx + NetworkX với thuật toán Dijkstra và cơ chế lưu trữ cache đồ thị (.pkl).
Tự động chuyển sang khoảng cách Haversine khi đồ thị không khả dụng.
"""

from __future__ import annotations

import asyncio
import logging
import math
import pickle
from pathlib import Path
from typing import Any, Sequence

import networkx as nx
import osmnx as ox


logger = logging.getLogger(__name__)

# Các hằng số cấu hình cơ bản
MAX_NEARBY_BRANCHES: int = 5
OSM_GRAPH_RADIUS_METERS: int = 10_000
ROAD_NETWORK_TYPE: str = "drive"
CACHE_DIR: Path = Path("backend/cache/osm_graphs")


def _haversine(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """
    Tính khoảng cách đường tròn lớn giữa hai tọa độ GPS theo đơn vị mét.

    Args:
        lat1: Vĩ độ điểm thứ nhất.
        lon1: Kinh độ điểm thứ nhất.
        lat2: Vĩ độ điểm thứ hai.
        lon2: Kinh độ điểm thứ hai.

    Returns:
        Khoảng cách tính theo mét (float).
    """
    earth_radius_m = 6_371_008.8  # Bán kính Trái Đất trung bình (mét)

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    return earth_radius_m * c


def _load_graph(
    lat: float,
    lon: float,
    radius_m: int = OSM_GRAPH_RADIUS_METERS,
) -> nx.MultiDiGraph:
    """
    Tải đồ thị mạng lưới đường bộ từ cache file .pkl hoặc tải trực tiếp qua OSMnx.

    Args:
        lat: Vĩ độ trung tâm.
        lon: Kinh độ trung tâm.
        radius_m: Bán kính tải mạng lưới đường bộ (mét).

    Returns:
        Đồ thị đường bộ dạng NetworkX MultiDiGraph.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # Đặt tên cache file theo tọa độ làm tròn (3 chữ số thập phân ~100m) và bán kính
    cache_filename = f"osm_{round(lat, 3)}_{round(lon, 3)}_{radius_m}m.pkl"
    cache_filepath = CACHE_DIR / cache_filename

    # 1. Kiểm tra cache file .pkl (Chế độ Offline)
    if cache_filepath.exists():
        try:
            with open(cache_filepath, "rb") as f:
                graph = pickle.load(f)
            logger.info("Đã tải thành công OSMnx graph từ cache: %s", cache_filepath)
            return graph
        except Exception as exc:
            logger.warning("Không thể đọc cache file %s: %s. Tiến hành tải mới.", cache_filepath, exc)

    # 2. Tải trực tiếp từ OSMnx nếu chưa có cache
    logger.info("Đang tải mạng lưới đường bộ từ OpenStreetMap xung quanh (%s, %s)...", lat, lon)
    graph = ox.graph_from_point(
        (lat, lon),
        dist=radius_m,
        network_type=ROAD_NETWORK_TYPE,
        simplify=True,
    )

    # 3. Lưu vào cache file .pkl
    try:
        with open(cache_filepath, "wb") as f:
            pickle.dump(graph, f, protocol=pickle.HIGHEST_PROTOCOL)
        logger.info("Đã lưu OSMnx graph vào cache file: %s", cache_filepath)
    except Exception as exc:
        logger.warning("Không thể lưu cache file %s: %s", cache_filepath, exc)

    return graph


def _validate_coordinates(latitude: float, longitude: float) -> None:
    """Kiểm tra tính hợp lệ của tọa độ địa lý (Lat: -90 đến 90, Lon: -180 đến 180)."""
    if not -90.0 <= latitude <= 90.0:
        raise ValueError("Latitude (vĩ độ) phải nằm trong khoảng từ -90 đến 90.")
    if not -180.0 <= longitude <= 180.0:
        raise ValueError("Longitude (kinh độ) phải nằm trong khoảng từ -180 đến 180.")


def _get_branch_attr(branch: Any, attr: str, default: Any = None) -> Any:
    """Hàm bổ trợ lấy thuộc tính từ đối tượng ORM/Pydantic hoặc Dict."""
    if isinstance(branch, dict):
        return branch.get(attr, default)
    return getattr(branch, attr, default)


def _get_active_branches(branches: Sequence[Any]) -> list[Any]:
    """Lọc danh sách các chi nhánh đang hoạt động có tọa độ hợp lệ."""
    active_branches = []
    for branch in branches:
        is_active = _get_branch_attr(branch, "is_active", True)
        if not is_active:
            continue

        try:
            lat = float(_get_branch_attr(branch, "latitude"))
            lon = float(_get_branch_attr(branch, "longitude"))
            _validate_coordinates(lat, lon)
            active_branches.append(branch)
        except (TypeError, ValueError):
            branch_id = _get_branch_attr(branch, "id", "unknown")
            logger.warning("Bỏ qua chi nhánh %s do tọa độ không hợp lệ.", branch_id)

    return active_branches


async def find_nearest_branches(
    customer_lat: float,
    customer_lon: float,
    branches: Sequence[Any],
    limit: int = MAX_NEARBY_BRANCHES,
) -> list[dict[str, Any]]:
    """
    Tìm danh sách các chi nhánh gần nhất theo khoảng cách di chuyển thực tế.

    Sử dụng Dijkstra trên đồ thị OSMnx/NetworkX. Nếu không thể tải đồ thị,
    toàn bộ kết quả sẽ fallback sang Haversine. Nếu chỉ một chi nhánh
    không có node hoặc không có đường đi, chỉ chi nhánh đó fallback.

    Args:
        customer_lat: Vĩ độ của khách hàng.
        customer_lon: Kinh độ của khách hàng.
        branches: Danh sách chi nhánh (Đối tượng Model/Dict).
        limit: Số lượng chi nhánh tối đa cần trả về (Mặc định: 5).

    Returns:
        Danh sách dict chứa đối tượng chi nhánh và khoảng cách distance_m
        tính theo mét, được sắp xếp tăng dần theo khoảng cách.

    Raises:
        ValueError: Nếu limit không nằm trong khoảng từ 1 đến 5.
    """
    _validate_coordinates(customer_lat, customer_lon)

    if not 1 <= limit <= MAX_NEARBY_BRANCHES:
        raise ValueError(
            f"limit phải nằm trong khoảng từ 1 đến {MAX_NEARBY_BRANCHES}."
        )

    active_branches = _get_active_branches(branches)

    if not active_branches:
        return []

    results: list[dict[str, Any]] = []

    try:
        # Tải đồ thị trong thread riêng để không block Event Loop.
        graph = await asyncio.to_thread(
            _load_graph,
            customer_lat,
            customer_lon,
            OSM_GRAPH_RADIUS_METERS,
        )

        # Lỗi tại đây nghĩa là graph không khả dụng -> fallback toàn bộ.
        customer_node = ox.distance.nearest_nodes(
            graph,
            X=customer_lon,
            Y=customer_lat,
        )

    except Exception as exc:
        logger.warning(
            "Không thể tải hoặc xác định node khách hàng từ OSMnx "
            "(%s). Sử dụng Haversine cho toàn bộ chi nhánh.",
            exc,
        )

        for branch in active_branches:
            b_lat = float(_get_branch_attr(branch, "latitude"))
            b_lon = float(_get_branch_attr(branch, "longitude"))
            h_dist = _haversine(
                customer_lat,
                customer_lon,
                b_lat,
                b_lon,
            )
            results.append(
                {
                    "branch": branch,
                    "distance_m": round(h_dist, 1),
                }
            )

        results.sort(key=lambda item: item["distance_m"])
        return results[:limit]

    # Graph đã tải thành công.
    # Lỗi của từng branch chỉ ảnh hưởng đến branch đó.
    for branch in active_branches:
        b_lat = float(_get_branch_attr(branch, "latitude"))
        b_lon = float(_get_branch_attr(branch, "longitude"))

        try:
            branch_node = ox.distance.nearest_nodes(
                graph,
                X=b_lon,
                Y=b_lat,
            )

            # Chạy thuật toán Dijkstra theo yêu cầu Dev 2.
            distance_m = nx.shortest_path_length(
                graph,
                source=customer_node,
                target=branch_node,
                weight="length",
                method="dijkstra",
            )

            results.append(
                {
                    "branch": branch,
                    "distance_m": round(float(distance_m), 1),
                }
            )

        except (nx.NetworkXNoPath, nx.NodeNotFound) as exc:
            # Không có đường đi/node -> chỉ branch này fallback Haversine.
            logger.warning(
                "Không tìm được đường Dijkstra cho branch %s (%s). "
                "Fallback Haversine.",
                _get_branch_attr(branch, "id", "unknown"),
                exc,
            )

            h_dist = _haversine(
                customer_lat,
                customer_lon,
                b_lat,
                b_lon,
            )
            results.append(
                {
                    "branch": branch,
                    "distance_m": round(h_dist, 1),
                }
            )

        except Exception as exc:
            # Lỗi bất thường của riêng branch cũng không làm mất Dijkstra
            # của các branch còn lại.
            logger.warning(
                "Lỗi xử lý Dijkstra cho branch %s (%s). "
                "Fallback Haversine cho branch này.",
                _get_branch_attr(branch, "id", "unknown"),
                exc,
            )

            h_dist = _haversine(
                customer_lat,
                customer_lon,
                b_lat,
                b_lon,
            )
            results.append(
                {
                    "branch": branch,
                    "distance_m": round(h_dist, 1),
                }
            )

    # Sắp xếp danh sách kết quả tăng dần theo distance_m.
    results.sort(key=lambda item: item["distance_m"])

    return results[:limit]
