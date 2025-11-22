from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from pathlib import Path

from app.routers import fusion as fusion_router
from app.routes import uploads as uploads_router
from app.settings import settings


# 프로젝트 루트 (app 폴더의 한 단계 위)
BASE_DIR = Path(__file__).resolve().parent.parent

# 네가 만든 프론트엔드 폴더 이름: "hair frontend"
FRONTEND_DIR = BASE_DIR / "hair frontend"

# uploads / outputs 폴더
UPLOADS_DIR = BASE_DIR / "uploads"
OUTPUTS_DIR = BASE_DIR / "outputs"


def create_app() -> FastAPI:
    app = FastAPI(
        title="HairFusion Service",
        version="0.1.0",
    )

    # -------------------------
    # CORS 설정
    # -------------------------
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # 개발 단계: 전체 허용
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # -------------------------
    # 1) 프론트엔드 정적 파일 mount
    # -------------------------
    app.mount(
        "/frontend",
        StaticFiles(directory=str(FRONTEND_DIR), html=True),
        name="frontend",
    )

    # -------------------------
    # 2) uploads / outputs 정적 파일 mount
    #     → ★ 이게 있어야 2D/3D 이미지가 브라우저에서 보임
    # -------------------------
    app.mount(
        "/uploads",
        StaticFiles(directory=str(UPLOADS_DIR)),
        name="uploads",
    )

    app.mount(
        "/outputs",
        StaticFiles(directory=str(OUTPUTS_DIR)),
        name="outputs",
    )

    # -------------------------
    # 3) 루트("/")로 들어오면 index.html 로 리다이렉트
    # -------------------------
    @app.get("/", include_in_schema=False)
    async def root():
        return RedirectResponse(url="/frontend/index.html")

    # -------------------------
    # 4) 기존 API 라우터들 (/fusion/* 등)
    # -------------------------
    app.include_router(fusion_router.router)
    app.include_router(uploads_router.router)

    # -------------------------
    # 5) 헬스 체크
    # -------------------------
    @app.get("/health")
    async def health_check():
        return {
            "status": "ok",
            "meshy_configured": bool(settings.meshy_api_key),
            "ailab_configured": bool(settings.ailab_api_key),
        }

    return app


app = create_app()
