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
- 传了 `media`：覆盖原 `media`。
- 没有传 `poster`：不修改原 `poster`。
- 传了 `poster`：覆盖原 `poster`。

第一版不做追加、不做单文件删除、不做自动抽帧。

## 环境变量

```bash
export MEMOS_SYNC_TOKEN="your-ios-token"
export POCKETBASE_URL="https://a.ithe.cn"
export POCKETBASE_COLLECTION="memos"
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
```

返回：

```json
{
  "ok": true,
  "action": "created",
  "id": "abc123",
  "category": "风景",
  "location": "郑州",
  "status": "published"
}
```
