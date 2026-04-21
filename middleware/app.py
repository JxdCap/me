import asyncio
import os
import re
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

DEFAULT_CATEGORY = "碎语"
VALID_CATEGORIES = {item.strip() for item in os.getenv("MEMOS_CATEGORIES", "风景,碎语,吐槽,分享").split(",") if item.strip()}
VALID_CATEGORIES.add(DEFAULT_CATEGORY)
DEFAULT_LOCATION = "未标注"
POCKETBASE_TOKEN_CACHE: str | None = None

app = FastAPI(title="Memos Sync Middleware", version="0.1.0")


class AppError(Exception):
    def __init__(self, error: str, status_code: int = 400, **extra: Any) -> None:
        self.error = error
        self.status_code = status_code
        self.extra = extra


@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return fail(exc.error, exc.status_code, **exc.extra)


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


def fail(error: str, status_code: int = 400, **extra: Any) -> JSONResponse:
    return JSONResponse({"ok": False, "error": error, **extra}, status_code=status_code)


def require_token(form_token: str | None, authorization: str | None) -> None:
    if not MIDDLEWARE_TOKEN:
        raise AppError("server_token_not_configured", 500)

    bearer = ""
    if authorization and authorization.lower().startswith("bearer "):
        bearer = authorization[7:].strip()

    if form_token != MIDDLEWARE_TOKEN and bearer != MIDDLEWARE_TOKEN:
        raise AppError("unauthorized", 401)


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


async def read_uploads(files: list[UploadFile] | None, field_name: str) -> list[tuple[str, tuple[str, bytes, str]]]:
    result: list[tuple[str, tuple[str, bytes, str]]] = []
    for file in files or []:
        if not file.filename:
            continue
        content = await file.read()
        if not content:
            continue
        result.append((field_name, (file.filename, content, file.content_type or "application/octet-stream")))
    return result


async def read_upload(file: UploadFile | None, field_name: str) -> list[tuple[str, tuple[str, bytes, str]]]:
    return await read_uploads([file] if file else None, field_name)


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
    with httpx.Client(timeout=60) as client:
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
) -> SubmitResult:
    headers = {"Authorization": f"Bearer {token}"}
    media_field_name = "media+" if media_mode == "append" else "media"
    media_uploads = await read_uploads(media_files, media_field_name)
    poster_uploads = await read_upload(poster_file, "poster")
    is_media_only_update = bool(existing) and not parsed.text and bool(media_uploads or poster_uploads)

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

    response = await send_pocketbase_write(
        client,
        "PATCH" if existing else "POST",
        url,
        headers,
        data,
        delete_fields,
        upload_fields,
    )

    if response.status_code >= 400:
        raise AppError("pocketbase_write_failed", 502, detail=response.text, pocketbase_status=response.status_code)

    return SubmitResult(
        record=response.json(),
        media_received=len(media_uploads),
        poster_received=bool(poster_uploads),
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
    require_token(token, authorization)
    if media_mode not in {"replace", "append"}:
        return fail("invalid_media_mode")

    parsed = parse_content(content)
    has_upload = bool(media) or poster is not None

    if parsed.is_delete and not parsed.record_id:
        return fail("missing_id_for_delete")
    if media_mode == "append" and not parsed.record_id:
        return fail("missing_id_for_append")
    if not parsed.is_delete and not parsed.text and not has_upload:
        return fail("empty_text")
    if not parsed.is_delete and not parsed.text and has_upload and not parsed.record_id:
        return fail("missing_id_for_media_only")

    async with httpx.AsyncClient(timeout=60) as client:
        pb_token = await get_pocketbase_token(client)
        existing = None

        if parsed.record_id:
            existing = await get_record(client, pb_token, parsed.record_id)
            if not existing:
                return fail("not_found", 404, id=parsed.record_id)

        if parsed.is_delete:
            response = await client.patch(
                f"{POCKETBASE_URL}/api/collections/{POCKETBASE_COLLECTION}/records/{parsed.record_id}",
                headers={"Authorization": f"Bearer {pb_token}"},
                data={"status": "deleted"},
            )
            if response.status_code >= 400:
                raise AppError("pocketbase_delete_failed", 502, detail=response.text, pocketbase_status=response.status_code)
            return JSONResponse({"ok": True, "action": "deleted", "id": parsed.record_id, "status": "deleted"})

        submit_result = await submit_record(client, pb_token, parsed, existing, media, poster, media_mode)
        record = submit_result.record
        action = "updated" if existing else "created"
        if parsed.is_hidden:
            action = "hidden" if existing else "created"

        saved_media = file_names(record.get("media"))
        saved_poster = file_name(record.get("poster"))

        return JSONResponse(
            {
                "ok": True,
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
                },
                "poster": {
                    "received": submit_result.poster_received,
                    "saved": bool(saved_poster),
                    "file": saved_poster,
                },
            }
        )
