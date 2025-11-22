import base64
import os
import uuid
from typing import Optional

import httpx

from app.settings import settings


class AILabError(Exception):
    pass


class MeshyError(Exception):
    pass


# ---------- 공통: 로컬 파일 저장 유틸 ----------

def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def save_bytes_to_file(root: str, prefix: str, data: bytes, ext: str) -> str:
    ensure_dir(root)
    name = f"{prefix}_{uuid.uuid4().hex}{ext}"
    path = os.path.join(root, name)
    with open(path, "wb") as f:
        f.write(data)
    return path


# ---------- AILab: 일반 헤어스타일 합성 ----------

async def try_ailab_hairstyle(image_bytes: bytes, hair_type: Optional[int] = None) -> Optional[str]:
    """
    구(舊) hairstyle-editor (일반 버전)용 헬퍼.
    지금은 Pro만 쓰더라도, 혹시 모를 호환용으로 그대로 둠.
    """
    if not settings.ailab_api_key:
        return None

    url = f"{settings.ailab_base_url}/api/portrait/effects/hairstyle-editor"
    headers = {
        "ailabapi-api-key": settings.ailab_api_key,
    }
    data = {}
    if hair_type is not None:
        data["hair_type"] = str(hair_type)

    files = {
        "image_target": ("input.jpg", image_bytes, "image/jpeg"),
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, headers=headers, data=data, files=files)
        resp.raise_for_status()
        body = resp.json()

        if body.get("error_code") != 0:
            return None

        data_field = body.get("data") or {}

        # base64 이미지
        b64_img = data_field.get("image")
        if isinstance(b64_img, str) and b64_img:
            try:
                img_bytes = base64.b64decode(b64_img)
                return save_bytes_to_file(settings.outputs_root, "ailab_hair", img_bytes, ".png")
            except Exception:
                return None

        # URL 이미지
        url_img = data_field.get("url")
        if isinstance(url_img, str) and url_img:
            return url_img

        return None
    except Exception:
        return None


# ---------- AILab Pro: Debug 함수 ----------

async def debug_ailab_hairstyle_pro(
    image_bytes: bytes,
    hair_style: str,
    color: Optional[str] = None,
    image_size: Optional[int] = 1,
) -> dict:
    """
    AILab Hairstyle Changer PRO 디버그 함수.
    요청/응답 전체를 그대로 확인하기 위한 용도.
    """
    if not settings.ailab_api_key:
        raise AILabError("AILAB_API_KEY가 설정되어 있지 않습니다.")

    base_url = getattr(settings, "ailab_base_url", "https://www.ailabapi.com")
    create_url = f"{base_url}/api/portrait/effects/hairstyle-editor-pro"

    headers = {
        "ailabapi-api-key": settings.ailab_api_key,
    }

    files = {
        "task_type": (None, "async"),
        "hair_style": (None, hair_style),
        "image": ("input.jpg", image_bytes, "image/jpeg"),
    }

    if color:
        files["color"] = (None, color)
    if image_size:
        files["image_size"] = (None, str(image_size))

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(create_url, headers=headers, files=files)

    try:
        body = resp.json()
    except Exception:
        body = resp.text

    return {
        "request_url": create_url,
        "status_code": resp.status_code,
        "response": body,
    }


# ---------- Meshy: Image → 3D ----------

async def create_meshy_image_to_3d(image_url: str) -> str:
    """
    Meshy Image-to-3D Task 생성.
    성공 시 task_id(문자열)를 정확히 추출해서 반환.
    """
    if not settings.meshy_api_key:
        raise MeshyError("MESHY_API_KEY 가 설정되어 있지 않습니다 (.env 확인).")

    endpoint = f"{settings.meshy_base_url}/openapi/v1/image-to-3d"
    headers = {
        "Authorization": f"Bearer {settings.meshy_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "image_url": image_url,
        "should_remesh": True,
        "should_texture": True,
        "enable_pbr": True,
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(endpoint, headers=headers, json=payload)

    # 응답 디버그용 로그
    try:
        data = resp.json()
    except Exception:
        data = {"raw_text": resp.text}

    print("[MESHY create] status:", resp.status_code, "resp:", data)

    if resp.status_code >= 400:
        raise MeshyError(f"Meshy 요청 실패: {resp.status_code} {resp.text}")

    # 응답 구조에 따라 task_id 추출
    # 예시1: {"code":0, "result":"xxxxxxxx"}
    # 예시2: {"code":0, "result":{"task_id":"xxxxxxxx", ...}}
    raw_result = data.get("result") if isinstance(data, dict) else None

    task_id: Optional[str] = None

    if isinstance(raw_result, str):
        task_id = raw_result
    elif isinstance(raw_result, dict):
        task_id = (
            raw_result.get("task_id")
            or raw_result.get("id")
            or raw_result.get("taskId")
        )

    # 혹시 result 없이 바로 task_id 가 최상단에 있는 경우
    if not task_id and isinstance(data, dict):
        task_id = (
            data.get("task_id")
            or data.get("id")
            or data.get("taskId")
        )

    if not isinstance(task_id, str) or not task_id.strip():
        raise MeshyError(f"Meshy 응답에서 task_id 를 찾지 못했습니다: {data}")

    return task_id.strip()


async def get_meshy_task(task_id: str) -> dict:
    """
    Meshy Task 상태를 '한 번만' 조회.
    - 성공: task 객체(dict) 반환
    - 실패: MeshyError 발생
    """
    if not settings.meshy_api_key:
        raise MeshyError("MESHY_API_KEY 가 설정되어 있지 않습니다.")

    endpoint = f"{settings.meshy_base_url}/openapi/v1/image-to-3d/{task_id}"
    headers = {
        "Authorization": f"Bearer {settings.meshy_api_key}",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(endpoint, headers=headers)

    try:
        data = resp.json()
    except Exception:
        data = {"raw_text": resp.text}

    print("[MESHY get] task_id:", task_id, "status:", resp.status_code, "resp:", data)

    if resp.status_code >= 400:
        raise MeshyError(f"Meshy 조회 실패: {resp.status_code} {resp.text}")

    return data


def extract_glb_url(task_data: dict) -> Optional[str]:
    """
    Meshy Task 응답에서 GLB URL만 추출.
    """
    model_urls = task_data.get("model_urls") or {}
    return model_urls.get("glb")
