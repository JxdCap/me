# iOS Notes Markdown Publish

这份文档记录 iOS 备忘录导出 Markdown 后，通过独立导入服务发布到 PocketBase `memos` 的最终流程。

## 接口

```text
POST https://a.ithe.cn/api/memos/import
Content-Type: multipart/form-data
```

表单字段：

```text
token    必填，发布密钥
archive  必填，备忘录 Markdown 归档 zip
```

`archive` 的表单类型选择“文件”。

## Zip 结构

iOS 备忘录导出的 Markdown 归档通常是：

```text
某个文件夹/
  某个文件名.md
  Attachments/
    IMG_001.jpeg
    IMG_002.png
    video.mov
```

规则：

- `.md` 文件名不固定，但 zip 内必须且只能有一个 `.md`。
- `Attachments/` 需要和 `.md` 同级，大小写不敏感，`attachments/` 也可以。
- `Attachments/` 里只处理图片和视频。
- 当前最多 9 个媒体文件。
- 当前最多 1 个视频。
- Markdown 正文里的图片引用会被移除，附件统一写入 PocketBase 的 `media` 字段。
- 附件优先按 Markdown 图片引用出现顺序上传，未被引用但位于 `Attachments/` 的媒体会追加在后面。

## Markdown 指令

指令写在 Markdown 正文里，一行一个：

```text
@id:record_id
@cate:风景
@category:碎语
@cat:吐槽
@location:湖北武汉
@loc:湖北武汉
@hide
@hidden
@del
@delete
```

分类目前建议使用：

```text
风景
碎语
吐槽
分享
```

## 发布语义

创建：

```text
@cate:碎语
@location:湖北武汉

这里是正文。
```

更新：

```text
@id:record_id
@cate:分享
@location:郑州

这里是更新后的正文。
```

隐藏：

```text
@id:record_id
@hide
```

软删除：

```text
@id:record_id
@del
```

## 媒体语义

创建时：

- 有 `Attachments/`：创建 memo，并写入全部媒体。
- 无 `Attachments/`：只创建纯文本 memo。

更新时：

- 有 `@id` 且有 `Attachments/`：替换当前 memo 的 `media`。
- 有 `@id` 且无 `Attachments/`：只更新文字、分类、位置、状态，不改原有 `media`。
- 有 `@id` 且只有附件没有正文：允许，用于纯媒体替换。

## 快捷指令流程

1. 从备忘录导出 Markdown。
2. 对导出的文件夹制作归档，得到 zip。
3. 获取 URL 内容：

```text
URL: https://a.ithe.cn/api/memos/import
方法: POST
请求正文: 表单
```

4. 表单字段：

```text
token = 你的发布密钥
archive = 上一步得到的 zip 文件
```

5. `archive` 字段类型选“文件”。
6. 显示返回结果，用于确认 `ok`、`id`、`media.saved`。

## 成功返回

```json
{
  "ok": true,
  "request_id": "f7a2136b",
  "action": "created",
  "id": "record_id",
  "category": "碎语",
  "location": "湖北武汉",
  "status": "published",
  "archive": {
    "markdown_found": true,
    "attachments": 5,
    "images": 4,
    "videos": 1
  },
  "text": {
    "length": 128,
    "empty": false
  },
  "media": {
    "received": 5,
    "saved": 5,
    "files": [
      "img_xxx.jpeg",
      "video_xxx.mov"
    ]
  }
}
```

重点看：

- `ok`: 是否成功。
- `id`: PocketBase 记录 ID，后续更新、隐藏、删除都用它。
- `archive.attachments`: zip 里识别到的附件数量。
- `archive.images`: 图片数量。
- `archive.videos`: 视频数量。
- `text.length`: 最终写入正文长度。
- `media.saved`: PocketBase 实际保存的媒体数量。

## 常见错误

`markdown_not_found`：

zip 内没有 `.md` 文件，或者快捷指令上传的不是完整归档。

`multiple_markdown_files`：

zip 内有多个 `.md` 文件。当前导入器要求一次只导入一条 memo。

`empty_text`：

创建时正文为空。新建 memo 必须有正文。

`missing_id_for_delete`：

使用了 `@del`，但没有写 `@id`。

`unsupported_file_type`：

`Attachments/` 里有不支持的文件类型。

`too_many_media_files`：

附件数量超过 `MEMOS_MAX_MEDIA_FILES`，当前建议最多 9 个。

`too_many_videos`：

一条 memo 里超过 1 个视频。

## 服务部署

代码目录：

```text
/opt/memos-import
```

systemd 服务：

```bash
systemctl status memos-import
systemctl restart memos-import
```

查看日志：

```bash
journalctl -u memos-import -n 120 --no-pager
```

健康检查：

```bash
curl http://127.0.0.1:8788/health
```
