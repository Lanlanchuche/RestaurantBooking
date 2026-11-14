import logging
import os

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

logger = logging.getLogger(__name__)

# Lấy DATABASE_URL từ biến môi trường (Render), nếu không có thì dùng SQLite local
DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./tablereserve.db")

# Xử lý đặc thù cho Render: PostgreSQL URL đôi khi bắt đầu bằng 'postgres://' 
# thay vì 'postgresql://' mà SQLAlchemy yêu cầu.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Kiểm tra xem đang dùng SQLite hay PostgreSQL để cấu hình connect_args phù hợp
if DATABASE_URL.startswith("sqlite"):
    # SQLite yêu cầu check_same_thread=False để FastAPI xử lý đa luồng
    engine: Engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    # PostgreSQL trên Render
    engine: Engine = create_engine(DATABASE_URL)


# Chỉ áp dụng PRAGMA WAL và foreign_keys khi chạy SQLite local
if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _configure_sqlite_connection(dbapi_connection, connection_record) -> None:
        """
        Thiết lập PRAGMA cho SQLite:
        - journal_mode=WAL: hạn chế lỗi khóa database khi đọc/ghi đồng thời.
        - foreign_keys=ON: kích hoạt ràng buộc khóa ngoại cho SQLite.
        """
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA foreign_keys=ON;")
        except Exception as exc:
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