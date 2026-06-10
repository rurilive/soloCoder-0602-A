import os
import struct
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse

from app.auth import get_current_user
from app.models import User

router = APIRouter(prefix="/api/upload", tags=["upload"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
ALLOWED_EXTENSIONS = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}
MAX_SIZE = 5 * 1024 * 1024

SIGNATURES = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"GIF87a": "image/gif",
    b"GIF89a": "image/gif",
}


def detect_mime_type(data: bytes) -> str | None:
    for sig, mime in SIGNATURES.items():
        if data.startswith(sig):
            return mime
    if len(data) >= 12:
        riff = data[:4]
        ftype = data[8:12]
        if riff == b"RIFF" and ftype == b"WEBP":
            return "image/webp"
    return None


def get_mime_from_extension(filename: str) -> str | None:
    ext = os.path.splitext(filename)[1].lower()
    return ALLOWED_EXTENSIONS.get(ext)


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    _current_user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="无效的文件名")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件扩展名，仅允许 {', '.join(sorted(ALLOWED_EXTENSIONS.keys()))}",
        )

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的MIME类型，仅允许 {', '.join(sorted(ALLOWED_TYPES))}",
        )

    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="文件内容为空")

    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="图片大小不能超过5MB")

    head = contents[:32]
    detected_mime = detect_mime_type(head)
    if detected_mime is None:
        raise HTTPException(status_code=400, detail="无法识别的图片内容，请上传有效的图片文件")

    declared_mime = get_mime_from_extension(file.filename)
    if declared_mime != detected_mime:
        raise HTTPException(
            status_code=400,
            detail=f"文件扩展名与实际内容类型不匹配：扩展名声明为 {declared_mime}，实际内容为 {detected_mime}",
        )

    if file.content_type != detected_mime:
        raise HTTPException(
            status_code=400,
            detail=f"MIME声明与实际内容类型不匹配：请求声明为 {file.content_type}，实际内容为 {detected_mime}",
        )

    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(contents)

    return JSONResponse(content={"url": f"/uploads/{filename}", "filename": filename})
