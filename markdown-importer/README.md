# Memos Markdown Importer

这是独立于 `middleware/` 的 Markdown zip 导入服务，不污染现有 `/api/memos/sync`。

接口：

```text
POST /api/memos/import
Content-Type: multipart/form-data
```

字段：

```text
token    必填，也可使用 Authorization: Bearer
archive  必填，zip 文件
```

zip 结构：

```text
note.md
Attachments/
  IMG_001.jpeg
  IMG_002.jpeg
  video.mov
```

也兼容 iOS 制作归档时多包一层目录：

```text
导出文件夹/
  note.md
  Attachments/
    IMG_001.jpeg
```

规则：

- `.md` 文件名不固定，但 zip 内必须且只能有一个 `.md`。
- `Attachments/` 文件夹需要和 `.md` 同级，大小写不敏感，`attachments/` 也可以。
- `Attachments/` 里只处理图片和视频。
- 会忽略 `__MACOSX`、隐藏文件和隐藏目录。
- 禁止 zip 路径穿越。
- 默认 memo 模式下，Markdown 正文里的 `![](Attachments/...)` 图片引用会被移除，附件统一写入 `media`。
- `@note` 富格式模式下，Markdown 图片引用会保留，并改写成 PocketBase 可直接访问的文件 URL。
- 附件优先按 Markdown 图片引用出现顺序上传，未被引用的附件追加在后面。

支持的 Markdown 指令：

```text
@id:record_id
@cate:风景
@category:碎语
@cat:吐槽
@location:武汉
@loc:武汉
@hide
@hidden
@del
@delete
@note
```

同步语义：

```text
无 @id：创建。
有 @id：更新。
@hide：status = hidden。
@del：status = deleted，必须有 @id。
@note：kind = note，正文保留 Markdown，并重写附件图片 URL。
```

创建新 memo 时，Markdown 必须有正文。更新已有 memo 时，允许只有 `@id` 加附件，用于纯媒体更新。

媒体语义：

```text
Attachments 有文件：replace 当前 media。
Attachments 无文件：不修改原 media。
最多 MEMOS_MAX_MEDIA_FILES 个媒体文件，默认 9。
最多 1 个视频。
不处理 poster。
```

内容类型：

```text
无 @note：kind = memo。
有 @note：kind = note。
PocketBase memos 集合需要有 kind 字段，select 单选，选项 memo/note。
```

运行依赖和环境变量与 `middleware/` 保持一致，共用 `/etc/memos-sync.env`。

建议关键环境变量：

```bash
MEMOS_SYNC_TOKEN=your-ios-token
POCKETBASE_URL=http://127.0.0.1:8090
POCKETBASE_PUBLIC_URL=https://a.ithe.cn
POCKETBASE_COLLECTION=memos
MEMOS_CATEGORIES=风景,碎语,吐槽,分享
POCKETBASE_TIMEOUT_SECONDS=300
MEMOS_MAX_UPLOAD_MB=300
MEMOS_MAX_ARCHIVE_MB=300
MEMOS_MAX_MEDIA_FILES=9
POCKETBASE_EMAIL=admin@example.com
POCKETBASE_PASSWORD=password
```

本地运行：

```bash
cd markdown-importer
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8788
```

systemd 部署：

```bash
sudo mkdir -p /opt/memos-import
sudo cp -r app.py requirements.txt deploy /opt/memos-import/
cd /opt/memos-import
sudo python3 -m venv .venv
sudo ./.venv/bin/pip install -r requirements.txt
sudo cp deploy/memos-import.service /etc/systemd/system/memos-import.service
sudo systemctl daemon-reload
sudo systemctl enable --now memos-import
sudo systemctl status memos-import
```

nginx 需要在现有 `location /api/memos/` 前面增加更精确的：

```nginx
location = /api/memos/import {
    proxy_pass http://127.0.0.1:8788/api/memos/import;
    proxy_http_version 1.1;

    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

测试：

```bash
curl -X POST https://a.ithe.cn/api/memos/import \
  -F "token=JxdCapMemos" \
  -F "archive=@note.zip"
```

成功返回：

```json
{
  "ok": true,
  "request_id": "a1b2c3d4",
  "action": "created",
  "id": "xxx",
  "content": {
    "kind": "note",
    "markdown": true,
    "rewritten_images": 3
  },
  "archive": {
    "markdown_found": true,
    "attachments": 3,
    "images": 3,
    "videos": 0
  },
  "text": {
    "length": 128,
    "empty": false
  },
  "media": {
    "received": 3,
    "saved": 3,
    "files": ["img_001_xxx.jpeg"]
  }
}
```
