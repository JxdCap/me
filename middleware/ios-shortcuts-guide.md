# iOS 快捷指令发布 Memos 指南

这份文档用于把 iPhone 备忘录、快捷指令、中间件和 PocketBase 串起来。

当前中间件接口：

```text
POST https://a.ithe.cn/api/memos/sync
Content-Type: multipart/form-data
```

表单字段：

```text
token    必填，中间件鉴权 token
content  必填，备忘录全文
media    可选，多文件，图片或视频
poster   可选，单图，视频封面
media_mode 可选，replace 或 append，默认 replace
```

## 一、发布流程

日常发布方式：

1. 在 iPhone 备忘录里写状态内容。
2. 通过分享菜单运行快捷指令。
3. 快捷指令把备忘录全文作为 `content` 发给中间件。
4. 中间件解析备忘录里的指令。
5. 中间件写入 PocketBase 的 `memos` 表。
6. 主页读取真实 `memos` 数据展示。

## 二、备忘录写法

最简单发布：

```text
今天测试一下从备忘录发布状态。
```

默认值：

```text
category = 碎语
location = 未标注
status = published
```

带分类和位置：

```text
@cate:风景
@location:郑州

今天看到一段很舒服的云。
```

支持分类：

```text
风景
碎语
吐槽
分享
```

更新某条：

```text
@id:yo8nhr16kemuuwy
@cate:碎语
@location:郑州

这是一条被我修改后的内容。
```

隐藏某条：

```text
@id:yo8nhr16kemuuwy
@hide

这条先不公开。
```

软删除某条：

```text
@id:yo8nhr16kemuuwy
@del
```

`@del` 不会物理删除 PocketBase 记录，只会改成：

```text
status = deleted
```

## 三、纯文本快捷指令

建议先做一个稳定的纯文本版，名称：

```text
发布 Memos
```

快捷指令设置：

```text
在共享表单中显示：打开
输入类型：文本
```

动作顺序如下。

### 1. 获取快捷指令输入

添加动作：

```text
获取快捷指令输入
```

这个输入就是从备忘录分享过来的正文。

### 2. 获取 URL 内容

添加动作：

```text
获取 URL 内容
```

URL：

```text
https://a.ithe.cn/api/memos/sync
```

设置：

```text
方法：POST
请求体：表单
```

表单字段：

```text
token
```

值：

```text
JxdCapMemos
```

再添加字段：

```text
content
```

值选择：

```text
快捷指令输入
```

最终结构：

```text
token   JxdCapMemos
content 快捷指令输入
```

### 3. 显示结果

添加动作：

```text
显示结果
```

内容选择：

```text
获取 URL 内容 的结果
```

成功返回示例：

```json
{
  "ok": true,
  "request_id": "a1b2c3d4",
  "action": "created",
  "id": "0afrkupw33h99r2",
  "category": "碎语",
  "location": "郑州",
  "status": "published"
}
```

返回里的 `id` 很重要，后续更新、隐藏、删除都需要它。

`request_id` 用于排查服务器日志。服务器上可以用：

```bash
journalctl -u memos-sync -n 100 --no-pager
```

查找同一个 `request_id`。

## 四、媒体快捷指令

纯文本版跑稳之后，再做第二个快捷指令：

```text
发布 Memos 媒体
```

建议先做 v1，只传：

```text
token
content
media
```

先不加 `poster`，避免「取消选择封面」导致快捷指令流程中断。

快捷指令设置：

```text
在共享表单中显示：打开
输入类型：文本、图像、媒体、文件
```

### 1. 获取正文

添加动作：

```text
获取快捷指令输入
```

如果从备忘录分享不稳定，可以加：

```text
询问输入
```

提示：

```text
粘贴或确认备忘录正文
```

默认值填：

```text
快捷指令输入
```

后续统一用这个正文变量。

### 2. 选择媒体

添加动作：

```text
选择照片
```

设置：

```text
包含：图像和视频
选择多个：打开
```

变量命名：

```text
媒体
```

### 3. 获取 URL 内容

添加动作：

```text
获取 URL 内容
```

URL：

```text
https://a.ithe.cn/api/memos/sync
```

设置：

```text
方法：POST
请求体：表单
```

表单字段：

```text
token   JxdCapMemos
content 正文
media   媒体
```

`media` 表单字段类型如果可以选择，选：

```text
文件
```

但变量本身不要选「文件」。点进变量属性时：

```text
图片变量：照片媒体
视频变量：媒体
```

也就是说：

```text
表单字段类型：文件
图片变量类型：照片媒体
视频变量类型：媒体
```

如果 iOS 提示 `media` 是多个项目，允许它作为多个文件上传。

## 五、图片测试

备忘录内容：

```text
@cate:风景
@location:郑州

这是一条带图片的中间件测试。
```

运行：

```text
发布 Memos 媒体
```

选择 1 到 3 张图。

成功返回示例：

```json
{
  "ok": true,
  "action": "created",
  "id": "xxxx",
  "category": "风景",
  "location": "郑州",
  "status": "published",
  "content": {
    "kind": "memo",
    "markdown": false
  },
  "media_mode": "replace",
  "media": {
    "received": 1,
    "saved": 1,
    "files": [
      "img_0001_xxx.png"
    ]
  },
  "poster": {
    "received": false,
    "saved": false,
    "file": ""
  }
}
```

PocketBase 里应看到：

```text
media = 图片文件
poster = 空
```

## 六、多图上传

iOS 快捷指令里「选择照片」虽然可以多选，但直接把多张照片变量绑定到一个 `media` 字段时，实际可能只上传第一张。

因此推荐用追加模式。

中间件支持：

```text
media_mode = replace
media_mode = append
```

规则：

```text
不传 media_mode：默认 replace
media_mode=replace：上传 media 时覆盖旧 media
media_mode=append：上传 media 时追加到旧 media 后面
```

快捷指令只需要传 `media_mode=append`。中间件会把它转换成 PocketBase 的 `media+` 文件字段，不需要在快捷指令里写 `media+`。

`media_mode=append` 必须配合 `@id` 使用。也就是说，它只能用于更新已有 memo，不能用于创建新 memo。

多图发布流程：

```text
1. 先提交正文，不传 media，创建 memo。
2. 从返回结果里取 id。
3. 对选择的照片执行「重复每一项」。
4. 每次只上传当前这一张照片。
5. 表单里带 media_mode=append。
```

每次追加上传的表单结构：

```text
token      JxdCapMemos
content    @id:刚才返回的id
           原正文
media_mode append
media      当前照片文件
```

多图追加时，`media` 表单字段类型仍然选：

```text
文件
```

当前照片变量本身选：

```text
照片媒体
```

追加成功后返回里的 `media.saved` 应该逐步增加。

例如第二张追加成功后：

```json
{
  "ok": true,
  "action": "updated",
  "id": "xxxx",
  "media_mode": "append",
  "media": {
    "received": 1,
    "saved": 2,
    "files": [
      "img_0001_xxx.png",
      "img_0002_xxx.png"
    ]
  }
}
```

## 七、视频测试

备忘录内容：

```text
@cate:分享
@location:郑州

这是一条带视频的中间件测试。
```

运行媒体版，选择一个视频。

PocketBase 里应看到：

```text
media = 视频文件
poster = 空
```

没有 `poster` 时，前端会显示默认视频预览；视频仍然可以播放。

一条 memo 最多放一个视频。可以是：

```text
一个视频
一个视频 + 多张图片
```

不建议也不支持：

```text
多个视频
```

如果上传多个视频，接口会返回：

```json
{
  "ok": false,
  "error": "multiple_videos_not_supported"
}
```

一条 memo 的媒体数量上限由服务器 `MEMOS_MAX_MEDIA_FILES` 控制，当前建议是 9。超过会返回：

```json
{
  "ok": false,
  "error": "too_many_media_files",
  "max": 9
}
```

快捷指令里选择视频时：

```text
选择照片
包含：视频
选择多个：关闭
```

`获取 URL 内容` 表单：

```text
token   JxdCapMemos
content 正文
media   视频
```

`media` 表单字段类型选择：

```text
文件
```

视频变量本身选择：

```text
媒体
```

不要把视频变量本身改成「文件」，否则中间件可能收到：

```json
"media": {
  "received": 0
}
```

成功返回里重点看：

```json
{
  "media": {
    "received": 1,
    "saved": 1,
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

如果返回：

```json
{
  "ok": false,
  "error": "unsupported_file_type"
}
```

说明快捷指令传来的不是 `image/*` 或 `video/*`。

如果返回：

```json
{
  "ok": false,
  "error": "file_too_large"
}
```

说明视频超过了服务器 `MEMOS_MAX_UPLOAD_MB` 限制。

## 八、poster 封面版

当图片和视频上传都稳定后，再加 `poster`。

第三个快捷指令可以命名为：

```text
发布 Memos 视频封面
```

### 新发视频并带封面

动作结构：

```text
1. 获取快捷指令输入
2. 选择照片：视频
3. 选择照片：封面图
4. 获取 URL 内容
5. 显示结果
```

选择视频：

```text
选择照片
包含：视频
选择多个：关闭
```

视频变量本身选择：

```text
媒体
```

选择封面图：

```text
选择照片
包含：图像
选择多个：关闭
```

封面变量本身选择：

```text
照片媒体
```

`获取 URL 内容`：

```text
URL：https://a.ithe.cn/api/memos/sync
方法：POST
请求体：表单
```

表单字段：

```text
token   JxdCapMemos
content 正文
media   视频
poster  封面图
```

表单字段类型：

```text
media   文件
poster  文件
```

也就是说：

```text
media 表单字段类型：文件，视频变量本身：媒体
poster 表单字段类型：文件，封面变量本身：照片媒体
```

成功返回里重点看：

```json
{
  "media": {
    "received": 1,
    "saved": 1
  },
  "poster": {
    "received": true,
    "saved": true,
    "file": "cover_xxx.png",
    "received_file": {
      "filename": "IMG_0002.PNG",
      "content_type": "image/png",
      "size": 123456
    }
  }
}
```

### 给已有视频补封面

如果视频已经发布，只想补一个封面：

```text
content  @id:已有memo_id
poster   封面图
```

表单字段：

```text
token   JxdCapMemos
content @id:已有memo_id
poster  封面图
```

`poster` 表单字段类型仍然选：

```text
文件
```

封面变量本身选：

```text
照片媒体
```

中间件会保留原正文、分类、位置、状态，只更新 `poster`。

如果这条 memo 没有任何 `media`，单独传 `poster` 会返回：

```json
{
  "ok": false,
  "error": "poster_without_media"
}
```

如果只发图片，不需要传 `poster`。

## 九、更新带媒体的 memo

如果要更新某条，并替换图片，使用默认 `replace`：

```text
@id:0afrkupw33h99r2
@cate:风景
@location:郑州

这条更新了图片。
```

然后运行媒体版并选择新图片。

中间件会：

```text
保留 id
更新 text/category/location/status
覆盖 media
```

如果只运行纯文本版，不传 `media`：

```text
原 media 不变
```

这个规则很重要，日常修改文字不会误删图片。

如果只是追加图片，表单里加：

```text
media_mode append
```

## 十、排错

### unauthorized

返回：

```json
{
  "detail": "unauthorized"
}
```

说明 token 没传对。

检查：

```text
请求体必须是表单
字段名必须是 token
值不能带引号
值要和 /etc/memos-sync.env 里的 MEMOS_SYNC_TOKEN 一致
```

正确：

```text
token = JxdCapMemos
```

如果放 Header，必须是：

```text
Authorization: Bearer JxdCapMemos
```

不是：

```text
token: JxdCapMemos
```

### Method Not Allowed

访问：

```text
GET https://a.ithe.cn/api/memos/sync
```

返回：

```json
{
  "detail": "Method Not Allowed"
}
```

这是正常的，因为接口只支持 `POST`。这也说明 nginx 已经把请求转发到了中间件。

### Internal Server Error

查看服务器日志：

```bash
journalctl -u memos-sync -n 80 --no-pager
```

常见原因：

```text
PocketBase 账号密码配置错误
PocketBase 字段校验失败
中间件 app.py 不是最新版本
```

## 十一、当前推荐节奏

先按顺序完成：

```text
1. 纯文本发布
2. 文本更新
3. 隐藏
4. 软删除
5. 图片上传
6. 视频上传
7. poster 封面
```

不要一开始就把所有动作堆到一个快捷指令里。先把核心链路跑稳，再逐步合并。
