"""
database.py

Cấu hình kết nối cơ sở dữ liệu SQLite cho toàn bộ ứng dụng TableReserve.
Bật WAL (Write-Ahead Logging) mode để cho phép đọc/ghi đồng thời tốt hơn,
tránh lỗi "database is locked" khi nhiều request truy cập cùng lúc
(ví dụ: nhiều khách hàng đặt bàn ở cùng một chi nhánh cùng lúc).
"""

import logging
import os

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

logger = logging.getLogger(__name__)

# Cho phép override qua biến môi trường khi deploy, mặc định dùng file SQLite
# nằm cùng cấp với backend/.
DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./tablereserve.db")

# SQLite mặc định chỉ cho phép 1 thread sử dụng 1 connection. FastAPI có thể
# xử lý các request trên nhiều thread khác nhau nên phải tắt kiểm tra này.
engine: Engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _configure_sqlite_connection(dbapi_connection, connection_record) -> None:
    """
    Thiết lập PRAGMA cần thiết mỗi khi một connection SQLite mới được mở.

    - journal_mode=WAL: cho phép một transaction ghi chạy đồng thời với
      nhiều transaction đọc, thay vì khóa toàn bộ file .db như chế độ
      rollback journal mặc định.
    - foreign_keys=ON: SQLite không tự bật ràng buộc khóa ngoại theo mặc
      định, nếu không bật thì các `ondelete="CASCADE"` khai báo trong
      models.py sẽ bị bỏ qua khi xóa dữ liệu.
    """
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA foreign_keys=ON;")
    except Exception as exc:
        # Không nuốt lỗi âm thầm — log lại để dev biết PRAGMA nào thất bại,
        # nhưng không raise vì đây không phải lỗi nghiêm trọng tới mức
        # phải chặn ứng dụng khởi động.
        logger.warning("Không thể thiết lập PRAGMA cho SQLite: %s", exc)
    finally:
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Session:
    """
    FastAPI dependency cung cấp một DB session dùng riêng cho mỗi request.

    Yields:
        Session: SQLAlchemy session, luôn được đóng lại ở khối `finally`
        dù request xử lý thành công hay phát sinh lỗi.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
