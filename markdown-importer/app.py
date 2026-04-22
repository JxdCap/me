import asyncio
import io
import logging
import mimetypes
import os
import posixpath
import re
import secrets
from urllib.parse import unquote
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any

import httpx
from fastapi import FastAPI, File, Form, Header, Request, UploadFile
from fastapi.responses import JSONResponse


POCKETBASE_URL = os.getenv("POCKETBASE_URL", "http://127.0.0.1:8090").rstrip("/")
POCKETBASE_COLLECTION = os.getenv("POCKETBASE_COLLECTION", "memos")
MIDDLEWARE_TOKEN = os.getenv("MEMOS_SYNC_TOKEN", "")
POCKETBASE_TOKEN = os.getenv("POCKETBASE_TOKEN", "")
POCKETBASE_EMAIL = os.getenv("POCKETBASE_EMAIL", "")
POCKETBASE_PASSWORD = os.getenv("POCKETBASE_PASSWORD", "")
POCKETBASE_TIMEOUT_SECONDS = float(os.getenv("POCKETBASE_TIMEOUT_SECONDS", "300"))
MAX_UPLOAD_BYTES = int(os.getenv("MEMOS_MAX_UPLOAD_MB", "300")) * 1024 * 1024
MAX_ARCHIVE_BYTES = int(os.getenv("MEMOS_MAX_ARCHIVE_MB", "300")) * 1024 * 1024
MAX_MEDIA_FILES = int(os.getenv("MEMOS_MAX_MEDIA_FILES", "9"))

DEFAULT_CATEGORY = "碎语"
VALID_CATEGORIES = {item.strip() for item in os.getenv("MEMOS_CATEGORIES", "风景,碎语,吐槽,分享").split(",") if item.strip()}
VALID_CATEGORIES.add(DEFAULT_CATEGORY)
DEFAULT_LOCATION = "未标注"
POCKETBASE_TOKEN_CACHE: str | None = None
IMAGE_EXTENSIONS = {".avif", ".gif", ".heic", ".heif", ".jpeg", ".jpg", ".png", ".webp"}
VIDEO_EXTENSIONS = {".m4v", ".mov", ".mp4", ".webm"}

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("memos-import")

app = FastAPI(title="Memos Markdown Importer", version="0.1.0")


class AppError(Exception):
    def __init__(self, error: str, status_code: int = 400, request_id: str | None = None, **extra: Any) -> None:
        self.error = error
        self.status_code = status_code
        self.request_id = request_id
        self.extra = extra


@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    log_event("error", exc.request_id, error=exc.error, status_code=exc.status_code, **exc.extra)
    return fail(exc.error, exc.status_code, request_id=exc.request_id, **exc.extra)


@dataclass
class ParsedMemo:
    record_id: str | None
    category: str
    location: str
    text: str
    status: str
    is_delete: bool
    is_hidden: bool


@dataclass
class ArchiveMedia:
    filename: str
    data: bytes
    content_type: str
    size: int
    kind: str


@dataclass
class ArchivePayload:
    markdown_name: str
    markdown_text: str
    media: list[ArchiveMedia]


def media_count_by_kind(media: list[ArchiveMedia], kind: str) -> int:
    return sum(1 for item in media if item.kind == kind)


def fail(error: str, status_code: int = 400, **extra: Any) -> JSONResponse:
    return JSONResponse({"ok": False, "error": error, **extra}, status_code=status_code)


def new_request_id() -> str:
    return secrets.token_hex(4)


def log_event(event: str, request_id: str | None, **fields: Any) -> None:
    pairs = [f"event={event}"]
    if request_id:
        pairs.append(f"request_id={request_id}")
    for key, value in fields.items():
        if value is None:
            continue
        pairs.append(f"{key}={value}")
    logger.info(" ".join(pairs))


def require_token(form_token: str | None, authorization: str | None, request_id: str | None = None) -> None:
    if not MIDDLEWARE_TOKEN:
        raise AppError("server_token_not_configured", 500, request_id=request_id)

    bearer = ""
    if authorization and authorization.lower().startswith("bearer "):
        bearer = authorization[7:].strip()

    if form_token != MIDDLEWARE_TOKEN and bearer != MIDDLEWARE_TOKEN:
        raise AppError("unauthorized", 401, request_id=request_id)


def parse_content(raw: str) -> ParsedMemo:
    text = raw.replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")

    record_id: str | None = None
    category = DEFAULT_CATEGORY
    location = DEFAULT_LOCATION
    is_hidden = False
    is_delete = False
    body_lines: list[str] = []

    for line in lines:
        stripped = line.strip()
        match = re.match(r"^@([^:：\s]+)(?:[:：\s]\s*(.*))?$", stripped)

        if not match:
            body_lines.append(line)
            continue

        key = match.group(1).strip().lower()
        value = (match.group(2) or "").strip()

        if key == "id":
            record_id = value or None
        elif key in {"cate", "category", "cat"}:
            category = value if value in VALID_CATEGORIES else DEFAULT_CATEGORY
        elif key in {"location", "loc"}:
            location = value or DEFAULT_LOCATION
        elif key in {"hide", "hidden"}:
            is_hidden = True
        elif key in {"del", "delete"}:
            is_delete = True
        else:
            body_lines.append(line)

    body = "\n".join(body_lines).strip()
    status = "deleted" if is_delete else "hidden" if is_hidden else "published"

    return ParsedMemo(record_id, category, location, body, status, is_delete, is_hidden)


def strip_markdown_attachment_images(markdown: str) -> str:
    image_ref = r"!\[[^\]]*\]\((?:\.?/)?attachments/[^)\s]+(?:\s+\"[^\"]*\")?\)"
    text = re.sub(rf"^[ \t]*{image_ref}[ \t]*\n?", "", markdown, flags=re.MULTILINE | re.IGNORECASE)
    text = re.sub(image_ref, "", text, flags=re.IGNORECASE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def markdown_image_refs(markdown: str) -> list[str]:
    refs: list[str] = []
    for match in re.finditer(r"!\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)", markdown):
        ref = match.group(1).strip()
        if ref.startswith("<") and ref.endswith(">"):
            ref = ref[1:-1].strip()
        if ref:
            refs.append(unquote(ref))
    return refs


def archive_ref_path(markdown_parent: PurePosixPath, ref: str) -> str | None:
    if "://" in ref or ref.startswith("#") or ref.startswith("/"):
        return None
    try:
        return clean_zip_name(posixpath.join(str(markdown_parent), ref))
    except AppError:
        return None


def order_attachment_paths(markdown_text: str, markdown_parent: PurePosixPath, attachment_paths: list[str]) -> list[str]:
    remaining = set(attachment_paths)
    ordered: list[str] = []

    for ref in markdown_image_refs(markdown_text):
        path = archive_ref_path(markdown_parent, ref)
        if path and path in remaining:
            ordered.append(path)
            remaining.remove(path)

    ordered.extend(path for path in attachment_paths if path in remaining)
    return ordered


def clean_zip_name(name: str) -> str:
    normalized = posixpath.normpath(name.replace("\\", "/"))
    if normalized.startswith("../") or normalized == ".." or normalized.startswith("/"):
        raise AppError("unsafe_archive_path", path=name)
    return normalized


def should_ignore_zip_entry(path: str) -> bool:
    parts = PurePosixPath(path).parts
    return any(part == "__MACOSX" or part.startswith(".") for part in parts)


def upload_kind(filename: str, content_type: str) -> str:
    extension = os.path.splitext(filename.lower())[1]
    if content_type.startswith("video/") or extension in VIDEO_EXTENSIONS:
        return "video"
    if content_type.startswith("image/") or extension in IMAGE_EXTENSIONS:
        return "image"
    return "unknown"


def is_allowed_media(filename: str, content_type: str) -> bool:
    kind = upload_kind(filename, content_type)
    return kind in {"image", "video"}


def guess_content_type(filename: str) -> str:
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or "application/octet-stream"


def read_archive(archive_bytes: bytes, request_id: str) -> ArchivePayload:
    if len(archive_bytes) > MAX_ARCHIVE_BYTES:
        raise AppError("archive_too_large", 413, request_id=request_id, max_mb=MAX_ARCHIVE_BYTES // 1024 // 1024)

    try:
        zf = zipfile.ZipFile(io.BytesIO(archive_bytes))
    except zipfile.BadZipFile as exc:
        raise AppError("invalid_archive", request_id=request_id) from exc

    with zf:
        files = [info for info in zf.infolist() if not info.is_dir()]
        safe_entries: dict[str, zipfile.ZipInfo] = {}
        for info in files:
            path = clean_zip_name(info.filename)
            if should_ignore_zip_entry(path):
                continue
            safe_entries[path] = info

        markdown_files = [path for path in safe_entries if path.lower().endswith(".md")]
        if not markdown_files:
            raise AppError("markdown_not_found", request_id=request_id)
        if len(markdown_files) > 1:
            raise AppError("multiple_markdown_files", request_id=request_id, files=markdown_files)

        markdown_name = markdown_files[0]
        markdown_parent = PurePosixPath(markdown_name).parent
        markdown_text = zf.read(safe_entries[markdown_name]).decode("utf-8-sig", errors="replace")

        attachment_paths = sorted(
            path
            for path in safe_entries
            if PurePosixPath(path).parent.parent == markdown_parent and PurePosixPath(path).parent.name.lower() == "attachments"
        )
        attachment_paths = order_attachment_paths(markdown_text, markdown_parent, attachment_paths)

        media: list[ArchiveMedia] = []
        for path in attachment_paths:
            filename = PurePosixPath(path).name
            data = zf.read(safe_entries[path])
            if not data:
                continue
            if len(data) > MAX_UPLOAD_BYTES:
                raise AppError("file_too_large", 413, request_id=request_id, filename=filename, max_mb=MAX_UPLOAD_BYTES // 1024 // 1024)
            content_type = guess_content_type(filename)
            if not is_allowed_media(filename, content_type):
                raise AppError("unsupported_file_type", request_id=request_id, filename=filename, content_type=content_type)
            media.append(ArchiveMedia(filename, data, content_type, len(data), upload_kind(filename, content_type)))

    return ArchivePayload(markdown_name, strip_markdown_attachment_images(markdown_text), media)


async def get_pocketbase_token(client: httpx.AsyncClient) -> str:
    global POCKETBASE_TOKEN_CACHE

    if POCKETBASE_TOKEN:
        return POCKETBASE_TOKEN
    if POCKETBASE_TOKEN_CACHE:
        return POCKETBASE_TOKEN_CACHE

    if not POCKETBASE_EMAIL or not POCKETBASE_PASSWORD:
        raise AppError("pocketbase_auth_not_configured", 500)

    payload = {"identity": POCKETBASE_EMAIL, "password": POCKETBASE_PASSWORD}
    auth_paths = ["/api/collections/_superusers/auth-with-password", "/api/admins/auth-with-password"]

    last_error = "pocketbase_auth_failed"
    for path in auth_paths:
        response = await client.post(f"{POCKETBASE_URL}{path}", json=payload)
        if response.status_code < 400:
            token = response.json().get("token")
            if token:
                POCKETBASE_TOKEN_CACHE = token
                return token
        last_error = response.text

    raise AppError("pocketbase_auth_failed", 502, detail=last_error)


def clear_pocketbase_token_cache() -> None:
    global POCKETBASE_TOKEN_CACHE
    POCKETBASE_TOKEN_CACHE = None


async def refresh_pocketbase_token(client: httpx.AsyncClient) -> str:
    clear_pocketbase_token_cache()
    return await get_pocketbase_token(client)


def file_names(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value] if value else []
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str) and item]
    return []


def delete_existing_files(record: dict[str, Any], field_name: str) -> list[tuple[str, str]]:
    existing = record.get(field_name)
    if not existing:
        return []
    if isinstance(existing, str):
        return [(f"{field_name}-", existing)]
    if isinstance(existing, list):
        return [(f"{field_name}-", item) for item in existing if item]
    return []


def count_videos(media: list[ArchiveMedia]) -> int:
    return sum(1 for item in media if item.kind == "video")


def count_existing_videos(record: dict[str, Any] | None) -> int:
    return sum(1 for filename in file_names(record.get("media") if record else None) if upload_kind(filename, "application/octet-stream") == "video")


def build_upload_fields(media: list[ArchiveMedia]) -> list[tuple[str, tuple[str, bytes, str]]]:
    return [("media", (item.filename, item.data, item.content_type)) for item in media]


def build_multipart_fields(
    data: dict[str, str],
    delete_fields: list[tuple[str, str]],
    upload_fields: list[tuple[str, tuple[str, bytes, str]]],
) -> list[tuple[str, tuple[str | None, str | bytes, str] | tuple[str, bytes, str]]]:
    fields: list[tuple[str, tuple[str | None, str | bytes, str] | tuple[str, bytes, str]]] = [
        (key, (None, value, "text/plain; charset=utf-8")) for key, value in data.items()
    ]
    fields.extend((key, (None, value, "text/plain; charset=utf-8")) for key, value in delete_fields)
    fields.extend(upload_fields)
    return fields


async def send_pocketbase_write(
    client: httpx.AsyncClient,
    token: str,
    method: str,
    url: str,
    data: dict[str, str],
    delete_fields: list[tuple[str, str]] | None = None,
    upload_fields: list[tuple[str, tuple[str, bytes, str]]] | None = None,
) -> httpx.Response:
    response = await send_pocketbase_write_once(client, token, method, url, data, delete_fields, upload_fields)
    if POCKETBASE_TOKEN or response.status_code not in {401, 403}:
        return response

    refreshed_token = await refresh_pocketbase_token(client)
    return await send_pocketbase_write_once(client, refreshed_token, method, url, data, delete_fields, upload_fields)


async def send_pocketbase_write_once(
    client: httpx.AsyncClient,
    token: str,
    method: str,
    url: str,
    data: dict[str, str],
    delete_fields: list[tuple[str, str]] | None = None,
    upload_fields: list[tuple[str, tuple[str, bytes, str]]] | None = None,
) -> httpx.Response:
    headers = {"Authorization": f"Bearer {token}"}
    if upload_fields:
        multipart_fields = build_multipart_fields(data, delete_fields or [], upload_fields)
        return await asyncio.to_thread(send_pocketbase_write_sync, method, url, headers, multipart_fields)

    return await client.request(method, url, headers=headers, data=data)


def send_pocketbase_write_sync(
    method: str,
    url: str,
    headers: dict[str, str],
    multipart_fields: list[tuple[str, tuple[str | None, str | bytes, str] | tuple[str, bytes, str]]],
) -> httpx.Response:
    with httpx.Client(timeout=POCKETBASE_TIMEOUT_SECONDS) as client:
        return client.request(method, url, headers=headers, files=multipart_fields)


async def get_record(client: httpx.AsyncClient, token: str, record_id: str) -> dict[str, Any] | None:
    response = await client.get(
        f"{POCKETBASE_URL}/api/collections/{POCKETBASE_COLLECTION}/records/{record_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    if not POCKETBASE_TOKEN and response.status_code in {401, 403}:
        refreshed_token = await refresh_pocketbase_token(client)
        response = await client.get(
            f"{POCKETBASE_URL}/api/collections/{POCKETBASE_COLLECTION}/records/{record_id}",
            headers={"Authorization": f"Bearer {refreshed_token}"},
        )
    if response.status_code == 404:
        return None
    if response.status_code >= 400:
        raise AppError("pocketbase_get_failed", 502, detail=response.text, pocketbase_status=response.status_code)
    return response.json()


async def submit_import(
    client: httpx.AsyncClient,
    token: str,
    parsed: ParsedMemo,
    existing: dict[str, Any] | None,
    payload: ArchivePayload,
    request_id: str,
) -> dict[str, Any]:
    has_media = bool(payload.media)
    is_partial_update = bool(existing) and not parsed.text and (has_media or parsed.is_hidden)
    data = {
        "text": str(existing.get("text") or "") if is_partial_update and existing else parsed.text,
        "category": str(existing.get("category") or parsed.category) if is_partial_update and existing else parsed.category,
        "location": str(existing.get("location") or parsed.location) if is_partial_update and existing else parsed.location,
        "status": str(existing.get("status") or parsed.status) if is_partial_update and existing and not parsed.is_hidden else parsed.status,
    }

    existing_video_count = 0 if has_media else count_existing_videos(existing)
    if existing_video_count + count_videos(payload.media) > 1:
        raise AppError("multiple_videos_not_supported", 400, request_id=request_id)
    if has_media and len(payload.media) > MAX_MEDIA_FILES:
        raise AppError("too_many_media_files", 400, request_id=request_id, max=MAX_MEDIA_FILES, received=len(payload.media), next=len(payload.media))

    delete_fields = delete_existing_files(existing, "media") if existing and has_media else []
    upload_fields = build_upload_fields(payload.media) if has_media else []
    url = (
        f"{POCKETBASE_URL}/api/collections/{POCKETBASE_COLLECTION}/records/{parsed.record_id}"
        if existing
        else f"{POCKETBASE_URL}/api/collections/{POCKETBASE_COLLECTION}/records"
    )

    response = await send_pocketbase_write(
        client,
        token,
        "PATCH" if existing else "POST",
        url,
        data,
        delete_fields,
        upload_fields,
    )
    if response.status_code >= 400:
        raise AppError("pocketbase_write_failed", 502, request_id=request_id, detail=response.text, pocketbase_status=response.status_code)
    return response.json()


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/api/memos/import")
async def import_memo(
    token: str | None = Form(None),
    archive: UploadFile = File(...),
    authorization: str | None = Header(None),
) -> JSONResponse:
    request_id = new_request_id()
    require_token(token, authorization, request_id)

    if not archive.filename or not archive.filename.lower().endswith(".zip"):
        return fail("archive_must_be_zip", request_id=request_id)

    archive_bytes = await archive.read()
    payload = read_archive(archive_bytes, request_id)
    parsed = parse_content(payload.markdown_text)

    if parsed.is_delete and not parsed.record_id:
        log_event("error", request_id, error="missing_id_for_delete")
        return fail("missing_id_for_delete", request_id=request_id)
    if not parsed.is_delete and not parsed.text and not parsed.record_id:
        log_event("error", request_id, error="empty_text")
        return fail("empty_text", request_id=request_id)
    if not parsed.is_delete and not parsed.text and parsed.record_id and not payload.media and not parsed.is_hidden:
        log_event("error", request_id, error="empty_text")
        return fail("empty_text", request_id=request_id)

    async with httpx.AsyncClient(timeout=POCKETBASE_TIMEOUT_SECONDS) as client:
        pb_token = await get_pocketbase_token(client)
        existing = None
        if parsed.record_id:
            existing = await get_record(client, pb_token, parsed.record_id)
            if not existing:
                log_event("error", request_id, error="not_found", id=parsed.record_id)
                return fail("not_found", 404, request_id=request_id, id=parsed.record_id)

        if parsed.is_delete:
            response = await send_pocketbase_write(
                client,
                pb_token,
                "PATCH",
                f"{POCKETBASE_URL}/api/collections/{POCKETBASE_COLLECTION}/records/{parsed.record_id}",
                {"status": "deleted"},
            )
            if response.status_code >= 400:
                raise AppError("pocketbase_delete_failed", 502, request_id=request_id, detail=response.text, pocketbase_status=response.status_code)
            log_event("success", request_id, action="deleted", id=parsed.record_id, markdown_found=True)
            return JSONResponse({"ok": True, "request_id": request_id, "action": "deleted", "id": parsed.record_id, "status": "deleted"})

        record = await submit_import(client, pb_token, parsed, existing, payload, request_id)
        action = "updated" if existing else "created"
        if parsed.is_hidden:
            action = "hidden" if existing else "created"

        saved_media = file_names(record.get("media"))
        received_files = [
            {"filename": item.filename, "content_type": item.content_type, "size": item.size, "kind": item.kind}
            for item in payload.media
        ]
        log_event(
            "success",
            request_id,
            action=action,
            id=record.get("id"),
            markdown_found=True,
            attachments=len(payload.media),
            images=media_count_by_kind(payload.media, "image"),
            videos=media_count_by_kind(payload.media, "video"),
            media_saved=len(saved_media),
            text_length=len(parsed.text),
        )
        return JSONResponse(
            {
                "ok": True,
                "request_id": request_id,
                "action": action,
                "id": record.get("id"),
                "category": record.get("category"),
                "location": record.get("location"),
                "status": record.get("status"),
                "archive": {
                    "markdown_found": True,
                    "attachments": len(payload.media),
                    "images": media_count_by_kind(payload.media, "image"),
                    "videos": media_count_by_kind(payload.media, "video"),
                },
                "text": {
                    "length": len(parsed.text),
                    "empty": not bool(parsed.text),
                },
                "media": {
                    "received": len(payload.media),
                    "saved": len(saved_media),
                    "files": saved_media,
                    "received_files": received_files,
                },
            }
        )
