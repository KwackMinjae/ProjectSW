from fastapi import (
    APIRouter,
    UploadFile,
    File,
    Form,
    HTTPException,
    status,
    Query,
)
from fastapi.responses import StreamingResponse
from typing import Optional
import base64
import httpx
import asyncio
from urllib.parse import unquote

from app.settings import settings
from app.services.hairfusion_client import (
    save_bytes_to_file,
    create_meshy_image_to_3d,
    get_meshy_task,
    extract_glb_url,
    debug_ailab_hairstyle_pro,
)

router = APIRouter(prefix="/fusion", tags=["fusion"])

# ────────────────────────────────
# 0. Pro 테스트 엔드포인트
# ────────────────────────────────
@router.post("/ailab-pro-test")
async def ailab_pro_test(
    file: UploadFile = File(...),
    hair_style: str = Form(...),
    color: Optional[str] = Form(None),
    image_size: Optional[int] = Form(1),
):
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "이미지 파일이 비어 있습니다.")

    try:
        return await debug_ailab_hairstyle_pro(
            raw, hair_style=hair_style, color=color, image_size=image_size
        )
    except Exception as e:
        raise HTTPException(502, f"AILab Pro 테스트 중 오류: {e}")


# ────────────────────────────────
# 공통 유틸
# ────────────────────────────────

def _is_url(value: str) -> bool:
    return value.startswith("http://") or value.startswith("https://") or value.startswith("data:")


def _file_to_data_uri(path: str, mime: str = "image/png") -> str:
    with open(path, "rb") as f:
        b = f.read()
    return f"data:{mime};base64," + base64.b64encode(b).decode()


def _bytes_to_data_uri(data: bytes, mime: str = "image/jpeg") -> str:
    return f"data:{mime};base64," + base64.b64encode(data).decode()


# ────────────────────────────────
# Pro 2D 합성 함수
# ────────────────────────────────

async def _call_ailab_hairstyle_pro_and_save(
    image_bytes: bytes,
    hair_style: str,
    color: Optional[str],
    image_size: int,
) -> str:
    if not settings.ailab_api_key:
        raise RuntimeError("AILAB_API_KEY가 설정되어 있지 않습니다.")

    base_url = getattr(settings, "ailab_base_url", "https://www.ailabapi.com")
    create_url = f"{base_url}/api/portrait/effects/hairstyle-editor-pro"
    query_url = f"{base_url}/api/common/query-async-task-result"

    headers = {"ailabapi-api-key": settings.ailab_api_key}

    files = {
        "task_type": (None, "async"),
        "hair_style": (None, hair_style),
        "image": ("upload.jpg", image_bytes, "image/jpeg"),
    }
    if color:
        files["color"] = (None, color)
    if image_size:
        files["image_size"] = (None, str(image_size))

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(create_url, headers=headers, files=files)
        if resp.status_code != 200:
            raise RuntimeError(f"Pro API 오류: {resp.status_code} {resp.text}")

        data = resp.json()
        task_id = data.get("task_id")
        if not task_id:
            raise RuntimeError(f"task_id 없음: {data}")

        for _ in range(20):
            q = await client.get(query_url, headers=headers, params={"task_id": task_id})
            if q.status_code != 200:
                raise RuntimeError(f"Async 조회 실패: {q.status_code}")

            jd = q.json()
            status_code = jd.get("task_status")

            if status_code == 2:
                image_url = jd.get("data", {}).get("images", [None])[0]
                if not image_url:
                    raise RuntimeError(f"Pro 결과 image_url 없음: {jd}")

                img = await client.get(image_url)
                fused_path = save_bytes_to_file(
                    settings.media_root, "fused", img.content, ".png"
                )
                return fused_path

            await asyncio.sleep(3)

        raise RuntimeError("Pro async timeout")


# ────────────────────────────────
# 2. 2D 합성 (Pro 전용)
# ────────────────────────────────

@router.post("/hair")
async def hair_fusion_pro(
    file: UploadFile = File(...),
    hair_style: str = Form(...),
    color: Optional[str] = Form(None),
    image_size: Optional[int] = Form(1),
):
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "이미지 파일이 비어 있습니다.")

    source_path = save_bytes_to_file(settings.media_root, "source", raw, ".jpg")

    try:
        fused_path = await _call_ailab_hairstyle_pro_and_save(
            raw, hair_style, color, image_size
        )
    except Exception as e:
        raise HTTPException(502, f"Pro 2D 합성 실패: {e}")

    return {
        "status": "ok",
        "source_image_url": source_path,
        "fused_image_url": fused_path,
        "used_image_source": "fused",
    }


# ────────────────────────────────
# 3. Meshy 작업 생성 / 조회
# ────────────────────────────────

@router.post("/meshify")
async def meshify_create(image_url: str = Form(...)):
    try:
        task_id = await create_meshy_image_to_3d(image_url)
        return {"status": "task_created", "task_id": task_id}
    except Exception as e:
        raise HTTPException(502, f"Meshy 작업 생성 오류: {e}")


@router.get("/meshify/{task_id}")
async def meshify_result(task_id: str):
    try:
        task_data = await get_meshy_task(task_id)

        # 🔹 status 값을 전부 소문자로 변환해서 프론트에 전달
        status_value = (task_data.get("status") or "").lower()
        glb_url = extract_glb_url(task_data)

        return {
            "status": status_value,   # <-- 'succeeded', 'in_progress', 'failed' 형태
            "task": task_data,
            "glb_url": glb_url,
        }
    except Exception as e:
        raise HTTPException(502, f"Meshy 조회 오류: {e}")


# ────────────────────────────────
# 4. GLB 프록시
# ────────────────────────────────

@router.get("/mesh-view")
async def mesh_view(glb_url: str = Query(...)):
    decoded = unquote(glb_url)
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(decoded)

        media_type = resp.headers.get("content-type", "model/gltf-binary")
        return StreamingResponse(iter([resp.content]), media_type=media_type)

    except Exception as e:
        raise HTTPException(502, f"GLB 프록시 오류: {e}")


# ────────────────────────────────
# 5. 전체 파이프라인 (Pro)
# ────────────────────────────────

@router.post("/full")
async def full_pipeline_pro(
    file: UploadFile = File(...),
    hair_style: str = Form(...),
    color: Optional[str] = Form(None),
    image_size: Optional[int] = Form(1),
):
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "이미지 파일이 비어 있습니다.")

    source_path = save_bytes_to_file(settings.media_root, "source", raw, ".jpg")

    try:
        fused_path = await _call_ailab_hairstyle_pro_and_save(
            raw, hair_style, color, image_size
        )
    except Exception as e:
        raise HTTPException(502, f"Pro 2D 합성 실패: {e}")

    if _is_url(fused_path):
        meshy_input = fused_path
    else:
        meshy_input = _file_to_data_uri(fused_path)

    try:
        task_id = await create_meshy_image_to_3d(meshy_input)
    except Exception as e:
        raise HTTPException(502, f"Meshy 생성 오류: {e}")

    return {
        "status": "task_created",
        "task_id": task_id,
        "source_image_url": source_path,
        "fused_image_url": fused_path,
    }
