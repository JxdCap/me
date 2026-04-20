# 数据模型与 PocketBase 映射

当前阶段只接入一张 `memos` 表。Hero、技能标签和主页固定信息仍保留前端静态内容，等后续再进入系统表。

## 1. `memos`

个人动态记录。它是首页 `StillAlive` 和 `ZineReader` 的唯一远端数据源。

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `text` | Text | 是 | 正文内容，快捷指令里的主文本 |
| `category` | Select | 是 | 分类，固定为 `风景 / 碎语 / 吐槽 / 分享` |
| `media` | File (multiple) | 否 | 图片或视频附件，建议最多 9 个，第一版可先限制 1 个视频 |
| `poster` | File (single) | 否 | 视频封面图，默认服务这条 memo 里的第一个视频 |
| `location` | Text | 否 | 位置文本，直接存快捷指令传入的值 |
| `status` | Select | 是 | `published` / `hidden` |
| `created` | Auto | 自动 | PocketBase 自动创建时间，直接作为发布时间 |
| `updated` | Auto | 自动 | PocketBase 自动更新时间 |

### 排序规则

```text
status = "published"
order by created desc
```

## 2. 当前前端映射

PocketBase 记录进入 UI 前，先在 `web/src/lib/memos.ts` 中适配为前端 memo 结构：

- `id`
- `category`
- `text`
- `location`
- `time`
- `media`

其中：

- `time` 由 `created` 在前端格式化得到；
- `category` 在前端会经过受控枚举归一化；未知值自动回退到 `碎语`；
- `media` 通过 PocketBase 文件 URL 生成，前端根据文件扩展名归一化为 `image` 或 `video`，并区分：
  - `cardSrc`：首页卡片缩略图，当前使用 `228x304`
  - `readerSrc`：阅读器显示图，当前使用 `800x600f`
  - `fullSrc`：原图，供媒体查看模式使用
- `poster` 用于视频封面：
  - 首页卡片使用 `poster` 的 `228x304` 缩略图；
  - Reader 原位视频使用 `poster` 的 `800x600f` 缩略图；
  - 媒体查看模式优先使用 `poster` 原图；
  - 当前只按 memo 级别处理，默认服务这条 memo 中的第一个视频。
- 视频不在首页自动播放；首页只显示视频入口感，阅读器中可原位播放，媒体查看模式中可沉浸播放。
- 媒体 `alt` 和 `tone` 目前使用前端 fallback，不在表中单独建字段。

## 3. 当前适配层职责

`web/src/lib/memos.ts` 现在承担三件事：

- `fetchPublishedMemos()`：从 PocketBase 读取 `published` memos，并在失败时回退到本地静态数据；
- `orderMemosForReader(activeMemoId, memos)`：根据当前打开的 memo 生成阅读器顺序；
- 时间、分类和媒体来源归一化：把 PocketBase 原始字段适配成首页、阅读器和媒体查看模式可直接消费的结构。

`HomePage` 只负责持有 memo 状态并传给 `StillAlive` / `ZineReader`，不直接处理 PocketBase 字段。

iOS 快捷指令里的分类建议使用固定菜单选择，不建议手动输入，避免出现空格、标点或别名导致筛选失准。

## 4. 本地状态

前端保留少量界面偏好状态：

| Key | 说明 |
| :--- | :--- |
| `me-theme` | 用户显式选择的主题模式。缺省时表示 `system`，跟随系统外观 |

本地状态不承载内容数据。

## 5. 后续再扩的部分

当前阶段暂不引入：

- `site_meta`
- `skills`
- `site_settings`
- 媒体元数据子表

等真实使用一段时间后，再根据实际发布习惯决定是否拆分系统表和媒体元数据表。
