import asyncio
import logging
import os
import re
import secrets
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import FastAPI, File, Form, Header, Request, UploadFile
from fastapi.responses import JSONResponse


POCKETBASE_URL = os.getenv("POCKETBASE_URL", "https://a.ithe.cn").rstrip("/")
POCKETBASE_COLLECTION = os.getenv("POCKETBASE_COLLECTION", "memos")
MIDDLEWARE_TOKEN = os.getenv("MEMOS_SYNC_TOKEN", "")
POCKETBASE_TOKEN = os.getenv("POCKETBASE_TOKEN", "")
POCKETBASE_EMAIL = os.getenv("POCKETBASE_EMAIL", "")
POCKETBASE_PASSWORD = os.getenv("POCKETBASE_PASSWORD", "")
POCKETBASE_TIMEOUT_SECONDS = float(os.getenv("POCKETBASE_TIMEOUT_SECONDS", "300"))
MAX_UPLOAD_BYTES = int(os.getenv("MEMOS_MAX_UPLOAD_MB", "300")) * 1024 * 1024
MAX_MEDIA_FILES = int(os.getenv("MEMOS_MAX_MEDIA_FILES", "9"))

DEFAULT_CATEGORY = "碎语"
VALID_CATEGORIES = {item.strip() for item in os.getenv("MEMOS_CATEGORIES", "风景,碎语,吐槽,分享").split(",") if item.strip()}
VALID_CATEGORIES.add(DEFAULT_CATEGORY)
DEFAULT_LOCATION = "未标注"
POCKETBASE_TOKEN_CACHE: str | None = None
IMAGE_EXTENSIONS = {".avif", ".gif", ".heic", ".heif", ".jpeg", ".jpg", ".png", ".webp"}
VIDEO_EXTENSIONS = {".m4v", ".mov", ".mp4", ".webm"}

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("memos-sync")

app = FastAPI(title="Memos Sync Middleware", version="0.1.0")


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
class SubmitResult:
    record: dict[str, Any]
    media_received: int
    poster_received: bool
    media_received_files: list[dict[str, Any]]
    poster_received_file: dict[str, Any] | None


@dataclass
class UploadReadResult:
    fields: list[tuple[str, tuple[str, bytes, str]]]
    files: list[dict[str, Any]]


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

    return ParsedMemo(
        record_id=record_id,
        category=category,
        location=location,
        text=body,
        status=status,
        is_delete=is_delete,
        is_hidden=is_hidden,
    )


async def get_pocketbase_token(client: httpx.AsyncClient) -> str:
    global POCKETBASE_TOKEN_CACHE

    if POCKETBASE_TOKEN:
        return POCKETBASE_TOKEN
    if POCKETBASE_TOKEN_CACHE:
        return POCKETBASE_TOKEN_CACHE

    if not POCKETBASE_EMAIL or not POCKETBASE_PASSWORD:
        raise AppError("pocketbase_auth_not_configured", 500)

    payload = {"identity": POCKETBASE_EMAIL, "password": POCKETBASE_PASSWORD}
    auth_paths = [
        "/api/collections/_superusers/auth-with-password",
        "/api/admins/auth-with-password",
    ]

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


async def read_uploads(
    files: list[UploadFile] | None,
    field_name: str,
    allowed_prefixes: tuple[str, ...],
) -> UploadReadResult:
    result: list[tuple[str, tuple[str, bytes, str]]] = []
    info: list[dict[str, Any]] = []
    for file in files or []:
        if not file.filename:
            continue
        content_type = file.content_type or "application/octet-stream"
        if allowed_prefixes and not is_allowed_upload(file.filename, content_type, allowed_prefixes):
            raise AppError("unsupported_file_type", 400, filename=file.filename, content_type=content_type)
        content = await file.read()
        if not content:
            continue
        size = len(content)
        if size > MAX_UPLOAD_BYTES:
            raise AppError("file_too_large", 413, filename=file.filename, max_mb=MAX_UPLOAD_BYTES // 1024 // 1024)
        result.append((field_name, (file.filename, content, content_type)))
        info.append({"filename": file.filename, "content_type": content_type, "size": size, "kind": upload_kind(file.filename, content_type)})
    return UploadReadResult(result, info)


def is_allowed_upload(filename: str, content_type: str, allowed_prefixes: tuple[str, ...]) -> bool:
    if content_type.startswith(allowed_prefixes):
        return True

    if content_type != "application/octet-stream":
        return False

    extension = os.path.splitext(filename.lower())[1]
    if "image/" in allowed_prefixes and extension in IMAGE_EXTENSIONS:
        return True
    if "video/" in allowed_prefixes and extension in VIDEO_EXTENSIONS:
        return True
    return False


def upload_kind(filename: str, content_type: str) -> str:
    extension = os.path.splitext(filename.lower())[1]
    if content_type.startswith("video/") or extension in VIDEO_EXTENSIONS:
        return "video"
    if content_type.startswith("image/") or extension in IMAGE_EXTENSIONS:
        return "image"
    return "unknown"


async def read_upload(
    file: UploadFile | None,
    field_name: str,
    allowed_prefixes: tuple[str, ...],
) -> UploadReadResult:
    return await read_uploads([file] if file else None, field_name, allowed_prefixes)


def delete_existing_files(record: dict[str, Any], field_name: str) -> list[tuple[str, str]]:
    existing = record.get(field_name)
    if not existing:
        return []
    if isinstance(existing, str):
        return [(f"{field_name}-", existing)]
    if isinstance(existing, list):
        return [(f"{field_name}-", item) for item in existing if item]
    return []


async def send_pocketbase_write(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    headers: dict[str, str],
    data: dict[str, str],
    delete_fields: list[tuple[str, str]] | None = None,
    upload_fields: list[tuple[str, tuple[str, bytes, str]]] | None = None,
) -> httpx.Response:
    if upload_fields:
        multipart_fields = build_multipart_fields(data, delete_fields or [], upload_fields)
        return await asyncio.to_thread(
            send_pocketbase_write_sync,
            method,
            url,
            headers,
            multipart_fields,
        )

    return await client.request(method, url, headers=headers, data=data)


async def send_pocketbase_write_with_retry(
    client: httpx.AsyncClient,
    token: str,
    method: str,
    url: str,
    data: dict[str, str],
    delete_fields: list[tuple[str, str]] | None = None,
    upload_fields: list[tuple[str, tuple[str, bytes, str]]] | None = None,
) -> httpx.Response:
    response = await send_pocketbase_write(
        client,
        method,
        url,
        {"Authorization": f"Bearer {token}"},
        data,
        delete_fields,
        upload_fields,
    )
    if POCKETBASE_TOKEN or response.status_code not in {401, 403}:
        return response

    refreshed_token = await refresh_pocketbase_token(client)
    return await send_pocketbase_write(
        client,
        method,
        url,
        {"Authorization": f"Bearer {refreshed_token}"},
        data,
        delete_fields,
        upload_fields,
    )


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


def send_pocketbase_write_sync(
    method: str,
    url: str,
    headers: dict[str, str],
    multipart_fields: list[tuple[str, tuple[str | None, str | bytes, str] | tuple[str, bytes, str]]],
) -> httpx.Response:
    with httpx.Client(timeout=POCKETBASE_TIMEOUT_SECONDS) as client:
        return client.request(
            method,
            url,
            headers=headers,
            files=multipart_fields,
        )


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


async def submit_record(
    client: httpx.AsyncClient,
    token: str,
    parsed: ParsedMemo,
    existing: dict[str, Any] | None,
    media_files: list[UploadFile] | None,
    poster_file: UploadFile | None,
    media_mode: str,
    request_id: str,
) -> SubmitResult:
    media_field_name = "media+" if media_mode == "append" else "media"
    media_result = await read_uploads(media_files, media_field_name, ("image/", "video/"))
    poster_result = await read_upload(poster_file, "poster", ("image/",))
    media_uploads = media_result.fields
    poster_uploads = poster_result.fields
    media_info = media_result.files
    poster_info = poster_result.files
    is_media_only_update = bool(existing) and not parsed.text and bool(media_uploads or poster_uploads)

    existing_video_count = count_existing_videos(existing) if media_mode == "append" else 0
    received_video_count = count_received_videos(media_info)
    if existing_video_count + received_video_count > 1:
        raise AppError(
            "multiple_videos_not_supported",
            400,
            request_id=request_id,
            existing_videos=existing_video_count,
            received_videos=received_video_count,
        )

    current_media_count, next_media_count = media_count_after_write(existing, len(media_uploads), media_mode)
    if next_media_count > MAX_MEDIA_FILES:
        raise AppError(
            "too_many_media_files",
            400,
            request_id=request_id,
            max=MAX_MEDIA_FILES,
            current=current_media_count,
            received=len(media_uploads),
            next=next_media_count,
        )

    data: dict[str, str] = {
        "text": str(existing.get("text") or "") if is_media_only_update and existing else parsed.text,
        "category": str(existing.get("category") or parsed.category) if is_media_only_update and existing else parsed.category,
        "location": str(existing.get("location") or parsed.location) if is_media_only_update and existing else parsed.location,
        "status": str(existing.get("status") or parsed.status) if is_media_only_update and existing else parsed.status,
    }

    delete_fields: list[tuple[str, str]] = []

    if existing and media_uploads and media_mode == "replace":
        delete_fields.extend(delete_existing_files(existing, "media"))
    if existing and poster_uploads:
        delete_fields.extend(delete_existing_files(existing, "poster"))

    upload_fields = media_uploads + poster_uploads
    url = (
        f"{POCKETBASE_URL}/api/collections/{POCKETBASE_COLLECTION}/records/{parsed.record_id}"
        if existing
        else f"{POCKETBASE_URL}/api/collections/{POCKETBASE_COLLECTION}/records"
    )

    response = await send_pocketbase_write_with_retry(
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

    return SubmitResult(
        record=response.json(),
        media_received=len(media_uploads),
        poster_received=bool(poster_uploads),
        media_received_files=media_info,
        poster_received_file=poster_info[0] if poster_info else None,
    )


def file_names(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value] if value else []
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str) and item]
    return []


def file_name(value: Any) -> str:
    if isinstance(value, str):
        return value
    names = file_names(value)
    return names[0] if names else ""


def has_existing_media(record: dict[str, Any] | None) -> bool:
    if not record:
        return False
    return bool(file_names(record.get("media")))


def count_existing_videos(record: dict[str, Any] | None) -> int:
    return sum(1 for filename in file_names(record.get("media") if record else None) if upload_kind(filename, "application/octet-stream") == "video")


def count_received_videos(files: list[dict[str, Any]]) -> int:
    return sum(1 for file in files if file.get("kind") == "video")


def media_count_after_write(existing: dict[str, Any] | None, received_media_count: int, media_mode: str) -> tuple[int, int]:
    current = len(file_names(existing.get("media"))) if existing else 0
    if media_mode == "append":
        return current, current + received_media_count
    return current, received_media_count


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/api/memos/sync")
async def sync_memo(
    content: str = Form(...),
    token: str | None = Form(None),
    media_mode: str = Form("replace"),
    media: list[UploadFile] | None = File(None),
    poster: UploadFile | None = File(None),
    authorization: str | None = Header(None),
) -> JSONResponse:
    request_id = new_request_id()
    require_token(token, authorization, request_id)
    if media_mode not in {"replace", "append"}:
        log_event("error", request_id, error="invalid_media_mode", media_mode=media_mode)
        return fail("invalid_media_mode", request_id=request_id)

    parsed = parse_content(content)
    has_upload = bool(media) or poster is not None

    if parsed.is_delete and not parsed.record_id:
        log_event("error", request_id, error="missing_id_for_delete")
        return fail("missing_id_for_delete", request_id=request_id)
    if media_mode == "append" and not parsed.record_id:
        log_event("error", request_id, error="missing_id_for_append")
        return fail("missing_id_for_append", request_id=request_id)
    if not parsed.is_delete and not parsed.text and not has_upload:
        log_event("error", request_id, error="empty_text")
        return fail("empty_text", request_id=request_id)
    if not parsed.is_delete and not parsed.text and has_upload and not parsed.record_id:
        log_event("error", request_id, error="missing_id_for_media_only")
        return fail("missing_id_for_media_only", request_id=request_id)

    async with httpx.AsyncClient(timeout=POCKETBASE_TIMEOUT_SECONDS) as client:
        pb_token = await get_pocketbase_token(client)
        existing = None

        if parsed.record_id:
            existing = await get_record(client, pb_token, parsed.record_id)
            if not existing:
                log_event("error", request_id, error="not_found", id=parsed.record_id)
                return fail("not_found", 404, request_id=request_id, id=parsed.record_id)

        if poster is not None and not media and not has_existing_media(existing):
            log_event("error", request_id, error="poster_without_media", id=parsed.record_id)
            return fail("poster_without_media", request_id=request_id)

        if parsed.is_delete:
            response = await send_pocketbase_write_with_retry(
                client,
                pb_token,
                "PATCH",
                f"{POCKETBASE_URL}/api/collections/{POCKETBASE_COLLECTION}/records/{parsed.record_id}",
                {"status": "deleted"},
            )
            if response.status_code >= 400:
                raise AppError("pocketbase_delete_failed", 502, request_id=request_id, detail=response.text, pocketbase_status=response.status_code)
            log_event("success", request_id, action="deleted", id=parsed.record_id, status="deleted")
            return JSONResponse({"ok": True, "request_id": request_id, "action": "deleted", "id": parsed.record_id, "status": "deleted"})

        submit_result = await submit_record(client, pb_token, parsed, existing, media, poster, media_mode, request_id)
        record = submit_result.record
        action = "updated" if existing else "created"
        if parsed.is_hidden:
            action = "hidden" if existing else "created"

        saved_media = file_names(record.get("media"))
        saved_poster = file_name(record.get("poster"))
        log_event(
            "success",
            request_id,
            action=action,
            id=record.get("id"),
            category=record.get("category"),
            location=record.get("location"),
            status=record.get("status"),
            media_mode=media_mode,
            media_received=submit_result.media_received,
            media_saved=len(saved_media),
            poster=bool(saved_poster),
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
                "media_mode": media_mode,
                "media": {
                    "received": submit_result.media_received,
                    "saved": len(saved_media),
                    "files": saved_media,
                    "received_files": submit_result.media_received_files,
                },
                "poster": {
                    "received": submit_result.poster_received,
                    "saved": bool(saved_poster),
                    "file": saved_poster,
                    "received_file": submit_result.poster_received_file,
                },
            }
        )
