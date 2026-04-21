import os
import re
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse


POCKETBASE_URL = os.getenv("POCKETBASE_URL", "https://a.ithe.cn").rstrip("/")
POCKETBASE_COLLECTION = os.getenv("POCKETBASE_COLLECTION", "memos")
MIDDLEWARE_TOKEN = os.getenv("MEMOS_SYNC_TOKEN", "")
POCKETBASE_TOKEN = os.getenv("POCKETBASE_TOKEN", "")
POCKETBASE_EMAIL = os.getenv("POCKETBASE_EMAIL", "")
POCKETBASE_PASSWORD = os.getenv("POCKETBASE_PASSWORD", "")

VALID_CATEGORIES = {"风景", "碎语", "吐槽", "分享"}
DEFAULT_CATEGORY = "碎语"
DEFAULT_LOCATION = "未标注"

app = FastAPI(title="Memos Sync Middleware", version="0.1.0")


@dataclass
class ParsedMemo:
    record_id: str | None
    category: str
    location: str
    text: str
    status: str
    is_delete: bool
    is_hidden: bool


def fail(error: str, status_code: int = 400, **extra: Any) -> JSONResponse:
    return JSONResponse({"ok": False, "error": error, **extra}, status_code=status_code)


def require_token(form_token: str | None, authorization: str | None) -> None:
    if not MIDDLEWARE_TOKEN:
        raise HTTPException(status_code=500, detail="server_token_not_configured")

    bearer = ""
    if authorization and authorization.lower().startswith("bearer "):
        bearer = authorization[7:].strip()

    if form_token != MIDDLEWARE_TOKEN and bearer != MIDDLEWARE_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")


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
    if POCKETBASE_TOKEN:
        return POCKETBASE_TOKEN

    if not POCKETBASE_EMAIL or not POCKETBASE_PASSWORD:
        raise HTTPException(status_code=500, detail="pocketbase_auth_not_configured")

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
                return token
        last_error = response.text

    raise HTTPException(status_code=502, detail=last_error)


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
    if delete_fields or upload_fields:
        return await client.request(
            method,
            url,
            headers=headers,
            data=list(data.items()) + (delete_fields or []),
            files=upload_fields or None,
        )

    return await client.request(method, url, headers=headers, data=data)


async def get_record(client: httpx.AsyncClient, token: str, record_id: str) -> dict[str, Any] | None:
    response = await client.get(
        f"{POCKETBASE_URL}/api/collections/{POCKETBASE_COLLECTION}/records/{record_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    if response.status_code == 404:
        return None
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=response.text)
    return response.json()


async def submit_record(
    client: httpx.AsyncClient,
    token: str,
    parsed: ParsedMemo,
    existing: dict[str, Any] | None,
    media_files: list[UploadFile] | None,
    poster_file: UploadFile | None,
) -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {token}"}
    data: dict[str, str] = {
        "text": parsed.text,
        "category": parsed.category,
        "location": parsed.location,
        "status": parsed.status,
    }

    media_uploads = await read_uploads(media_files, "media")
    poster_uploads = await read_upload(poster_file, "poster")
    delete_fields: list[tuple[str, str]] = []

    if existing and media_uploads:
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
        raise HTTPException(status_code=502, detail=response.text)
    return response.json()


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/api/memos/sync")
async def sync_memo(
    content: str = Form(...),
    token: str | None = Form(None),
    media: list[UploadFile] | None = File(None),
    poster: UploadFile | None = File(None),
    authorization: str | None = Header(None),
) -> JSONResponse:
    require_token(token, authorization)
    parsed = parse_content(content)

    if parsed.is_delete and not parsed.record_id:
        return fail("missing_id_for_delete")
    if not parsed.is_delete and not parsed.text:
        return fail("empty_text")

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
                raise HTTPException(status_code=502, detail=response.text)
            return JSONResponse({"ok": True, "action": "deleted", "id": parsed.record_id, "status": "deleted"})

        record = await submit_record(client, pb_token, parsed, existing, media, poster)
        action = "updated" if existing else "created"
        if parsed.is_hidden:
            action = "hidden" if existing else "created"

        return JSONResponse(
            {
                "ok": True,
                "action": action,
                "id": record.get("id"),
                "category": record.get("category"),
                "location": record.get("location"),
                "status": record.get("status"),
            }
        )
