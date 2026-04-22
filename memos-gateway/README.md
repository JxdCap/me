# Memos Gateway

`memos-gateway` 是 `middleware/` 和 `markdown-importer/` 的 Go 合并版。它保持现有接口不变，用一个轻量常驻进程承载两个入口：

```text
GET  /health
POST /api/memos/sync
POST /api/memos/import
```

语义：

```text
/api/memos/sync
  轻状态入口，固定写入 kind=memo，markdown=false。

/api/memos/import
  iOS 备忘录 Markdown zip 入口。
  无 @note：kind=memo，清掉 Attachments 图片引用，媒体进入 media。
  有 @note：kind=note，保留 Markdown，Attachments 图片引用改写成 PocketBase 文件 URL。
```

## PocketBase 字段

`memos` 集合至少需要：

```text
text      text
category  text/select
location  text
status    select/text: published, hidden, deleted
kind      select: memo, note，Max select 1，默认 memo
media     file，多文件
poster    file，单文件
```

## 环境变量

参考：

```bash
cp deploy/memos-gateway.env.example /etc/memos-gateway.env
chmod 600 /etc/memos-gateway.env
nano /etc/memos-gateway.env
```

关键项：

```text
MEMOS_GATEWAY_ADDR=127.0.0.1:8787
MEMOS_SYNC_TOKEN=your-ios-token
POCKETBASE_URL=http://127.0.0.1:8090
POCKETBASE_PUBLIC_URL=https://a.ithe.cn
POCKETBASE_EMAIL=...
POCKETBASE_PASSWORD=...
```

`POCKETBASE_URL` 用内网地址写 PocketBase；`POCKETBASE_PUBLIC_URL` 用于 `@note` 里生成公网可访问的 Markdown 图片链接。

## 构建

服务器需要安装 Go。Debian 可以用系统包或官方二进制。进入目录后：

```bash
cd /opt/memos-gateway
go build -trimpath -ldflags "-s -w" -o memos-gateway .
```

本项目只使用 Go 标准库，没有第三方依赖。

## systemd

```bash
cp deploy/memos-gateway.service /etc/systemd/system/memos-gateway.service
systemctl daemon-reload
systemctl enable --now memos-gateway
systemctl status memos-gateway
```

查看日志：

```bash
journalctl -u memos-gateway -n 120 --no-pager
```

健康检查：

```bash
curl http://127.0.0.1:8787/health
```

## nginx

把 `deploy/nginx-memos-gateway-location.conf` 的 `location /api/memos/` 放进 `a.ithe.cn` 的 443 server 块里，优先级要高于 `location /`。

测试：

```bash
nginx -t
systemctl reload nginx
```

## 迁移建议

当前目标架构：

```text
nginx /api/memos/ -> 127.0.0.1:8787 -> memos-gateway
```

旧的 Python 服务：

```text
memos-sync
memos-import
```

确认 Go gateway 的 `/api/memos/sync` 和 `/api/memos/import` 都测试成功后，可以保持停用并禁用：

```bash
systemctl stop memos-sync memos-import
systemctl disable memos-sync memos-import
```

保守迁移：

1. 先让 Go 服务跑在 `127.0.0.1:8789`。
2. nginx 临时加 `/api/memos-go/` 做测试，或者用本机 curl 直连。
3. 测通后改为 `127.0.0.1:8787`，替换原 Python `memos-sync`。
4. 停掉旧服务：

```bash
systemctl stop memos-sync memos-import
systemctl disable memos-sync memos-import
```

直接迁移：

1. 停掉旧服务。
2. 启动 `memos-gateway`。
3. nginx `/api/memos/` 指向 `127.0.0.1:8787`。

## 快速测试

轻 memo：

```bash
curl -X POST https://a.ithe.cn/api/memos/sync \
  -F "token=your-ios-token" \
  -F "content=@cate:碎语

来自 Go gateway 的测试。"
```

Markdown zip：

```bash
curl -X POST https://a.ithe.cn/api/memos/import \
  -F "token=your-ios-token" \
  -F "archive=@note.zip"
```

## 注意

- Go 版已替代旧的 Python `memos-sync` 和 `memos-import`，接口 URL 保持不变。
- 列表字段会稳定返回数组，例如 `media.files: []`、`media.received_files: []`。
- 上传给 PocketBase 时使用 `io.Pipe` 流式写 multipart，避免再复制一份完整请求体；但当前仍会把单个附件读入内存做校验和转发，超大视频仍不建议走 Markdown zip。
- `MEMOS_MAX_UPLOAD_MB` 和 `MEMOS_MAX_ARCHIVE_MB` 建议在 1GB 机器上保持保守，例如 120/160。
