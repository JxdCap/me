# Memos Sync Middleware

这是给 iPhone 备忘录 + 快捷指令使用的轻量中间件。它负责解析备忘录里的指令，并通过 PocketBase HTTP API 写入 `memos` 表。

## 目标

快捷指令只需要提交：

- `content`：备忘录全文
- `media`：可选，多文件
- `poster`：可选，单图
- `token`：中间件鉴权 token

复杂逻辑放在中间件：

- 创建 / 更新
- 隐藏 / 软删除
- 分类和位置解析
- media / poster 上传到 PocketBase

## 指令

支持的备忘录指令：

```text
@id:record_id
@cate:风景
@category:碎语
@cat:吐槽
@location:郑州
@loc:郑州
@hide
@hidden
@del
@delete
```

规则：

- 没有 `@id`：创建新 memo。
- 有 `@id`：更新已有 memo；如果找不到则返回 `not_found`。
- `@hide` / `@hidden`：`status = hidden`。
- `@del` / `@delete`：`status = deleted`，不做物理删除。
- 未写分类或分类不在 `风景 / 碎语 / 吐槽 / 分享` 中：回退为 `碎语`。
- 未写位置：回退为 `未标注`。
- 指令行不会写入正文。

## 示例

创建：

```text
@cate:风景
@location:郑州

今天看到一段很舒服的云。
```

更新：

```text
@id:iwe4zbklkseal1v
@cate:风景
@location:郑州

今天看到一段很舒服的云，后来又变成了另一种颜色。
```

隐藏：

```text
@id:iwe4zbklkseal1v
@hide

这条先不公开。
```

软删除：

```text
@id:iwe4zbklkseal1v
@del
```

## 媒体规则

- 没有传 `media`：不修改原 `media`。
- 传了 `media`：覆盖原 `media`。`media` 支持 `image/*` 和 `video/*`。
- `media_mode=append`：追加到原 `media`，中间件会转成 PocketBase 的 `media+` 文件字段。
- 没有传 `poster`：不修改原 `poster`。
- 传了 `poster`：覆盖原 `poster`。`poster` 只支持 `image/*`。
- `poster` 不能单独用于没有 `media` 的 memo，否则返回 `poster_without_media`。
- 一条 memo 最多允许一个视频；多个视频会返回 `multiple_videos_not_supported`。
- 一条 memo 最多允许 `MEMOS_MAX_MEDIA_FILES` 个媒体文件，默认 9。

暂不做单文件删除、不做自动抽帧。

视频上传注意：

```text
POCKETBASE_TIMEOUT_SECONDS  中间件请求 PocketBase 的超时时间，默认 300 秒。
MEMOS_MAX_UPLOAD_MB         单个上传文件大小上限，默认 300MB。
MEMOS_MAX_MEDIA_FILES       单条 memo 的 media 文件数量上限，默认 9。
```

PocketBase 后台的 `memos.media` 字段也需要允许视频文件类型，例如 `mp4`、`mov`、`m4v`。

建议限制关系：

```text
nginx client_max_body_size >= MEMOS_MAX_UPLOAD_MB >= PocketBase 文件大小限制
MEMOS_MAX_MEDIA_FILES      <= PocketBase media 最大文件数
```

当前中间件不是视频流式上传，会先把单个文件读入内存再转发给 PocketBase。个人使用和几十 MB 视频没有问题；如果长期上传 100MB 以上视频，再考虑改成临时文件转发。

## 环境变量

```bash
export MEMOS_SYNC_TOKEN="your-ios-token"
export POCKETBASE_URL="https://a.ithe.cn"
export POCKETBASE_COLLECTION="memos"
export MEMOS_CATEGORIES="风景,碎语,吐槽,分享"
export POCKETBASE_TIMEOUT_SECONDS="300"
export MEMOS_MAX_UPLOAD_MB="300"
export MEMOS_MAX_MEDIA_FILES="9"
```

PocketBase 鉴权二选一。

使用固定 PocketBase token：

```bash
export POCKETBASE_TOKEN="your-pocketbase-token"
```

或者让中间件用账号密码换 token：

```bash
export POCKETBASE_EMAIL="admin@example.com"
export POCKETBASE_PASSWORD="password"
```

## 本地运行

```bash
cd middleware
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8787
```

健康检查：

```bash
curl http://127.0.0.1:8787/health
```

## systemd 部署

建议部署到 `/opt/memos-sync`，让 nginx 反代到本机端口。

```bash
sudo mkdir -p /opt/memos-sync
sudo cp -r app.py requirements.txt deploy /opt/memos-sync/
cd /opt/memos-sync
sudo python3 -m venv .venv
sudo ./.venv/bin/pip install -r requirements.txt
```

创建环境变量文件：

```bash
sudo cp deploy/memos-sync.env.example /etc/memos-sync.env
sudo chmod 600 /etc/memos-sync.env
sudo nano /etc/memos-sync.env
```

安装服务：

```bash
sudo cp deploy/memos-sync.service /etc/systemd/system/memos-sync.service
sudo systemctl daemon-reload
sudo systemctl enable --now memos-sync
sudo systemctl status memos-sync
```

查看日志：

```bash
sudo journalctl -u memos-sync -f
```

如果你的部署目录、运行用户或端口不同，修改 `/etc/systemd/system/memos-sync.service` 里的：

```text
User=www-data
Group=www-data
WorkingDirectory=/opt/memos-sync
ExecStart=/opt/memos-sync/.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8787 --workers 1
```

如果 `systemctl status memos-sync` 出现 `status=203/EXEC`，说明 `ExecStart` 指向的文件不存在或不可执行。优先检查虚拟环境目录是否真的是 `.venv`：

```bash
ls -l /opt/memos-sync/.venv/bin/python
ls -l /opt/memos-sync/.venv/bin/uvicorn
```

如果你的虚拟环境实际叫 `venv`，要么重建为 `.venv`，要么把 service 里的 `.venv` 改成 `venv`。

nginx 可反代到：

```nginx
location /api/memos/ {
    proxy_pass http://127.0.0.1:8787/api/memos/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    client_max_body_size 100m;
}
```

完整示例见：

```text
deploy/nginx-a.ithe.cn.conf
```

## 接口

```text
POST /api/memos/sync
Content-Type: multipart/form-data
```

字段：

```text
token    必填，也可使用 Authorization: Bearer
content  必填，备忘录全文
media    可选，多文件
poster   可选，单文件
media_mode 可选，replace 或 append，默认 replace
```

规则：

```text
media_mode=replace  上传 media 时覆盖旧 media。
media_mode=append   上传 media 时追加到旧 media，必须在 content 里带 @id。
```

返回：

```json
{
  "ok": true,
  "request_id": "a1b2c3d4",
  "action": "created",
  "id": "abc123",
  "category": "风景",
  "location": "郑州",
  "status": "published"
}
```

带媒体时会额外返回本次收到的文件信息：

```json
{
  "media": {
    "received": 1,
    "saved": 3,
    "files": ["video_xxx.mp4"],
    "received_files": [
      {
        "filename": "IMG_0001.MOV",
        "content_type": "video/quicktime",
        "size": 23800123
      }
    ]
  }
}
```

错误返回统一为：

```json
{
  "ok": false,
  "request_id": "a1b2c3d4",
  "error": "pocketbase_write_failed",
  "detail": "...",
  "pocketbase_status": 400
}
```

如果使用 `POCKETBASE_EMAIL` / `POCKETBASE_PASSWORD`，中间件会缓存登录得到的 PocketBase token，避免每次上传图片都重新登录。重启服务会清空缓存并重新登录。

如果 PocketBase 返回 401 或 403，中间件会清空缓存 token、重新登录并重试一次。

日志查看：

```bash
journalctl -u memos-sync -n 100 --no-pager
```

中间件会输出轻量结构化日志，例如：

```text
event=success request_id=a1b2c3d4 action=created id=xxx media_received=1 media_saved=1 poster=True
event=error request_id=a1b2c3d4 error=too_many_media_files max=9 current=8 received=2 next=10
```

`request_id` 会同时出现在接口返回和服务器日志里，方便排查。
