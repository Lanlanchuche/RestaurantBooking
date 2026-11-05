import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

# Cấu hình logging để các log của ứng dụng (bao gồm mock email khi chưa có
# SMTP và lỗi gửi email) hiển thị ra console thay vì bị ẩn ở mức WARNING.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logging.getLogger("backend").setLevel(logging.INFO)

from backend.database import engine, Base
from backend.routers import auth_router, customer_router, restaurant_router, websocket_router
from backend.services.email_service import email_service

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi tạo DB tables khi app startup
    Base.metadata.create_all(bind=engine)
    yield
    # Đợi các email đang gửi dở hoàn tất rồi dừng thread pool.
    email_service.shutdown()

app = FastAPI(title="TableReserve API", lifespan=lifespan)

# Cấu hình CORS (Cho phép Frontend kết nối)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gắn các router API
app.include_router(auth_router.router)
app.include_router(customer_router.router)
app.include_router(restaurant_router.router)
app.include_router(websocket_router.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to TableReserve API"}
