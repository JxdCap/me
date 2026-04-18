# 数据模型与 PocketBase 映射 (Data Schema)

本项目的字段设计遵循“信息高密度”原则，杜绝无意义的占位符。

## 1. Memos (状态记录)
这是本站的核心动态数据集合。

| 字段名 | 类型 | 说明 | 示例 |
| :--- | :--- | :--- | :--- |
| `id` | ID | 唯一索引，用于生成 ENTRY.ID | `stillalive-1` |
| `text` | Text | 核心长文案，支持简易 Markdown | `最近一直在路上...` |
| `location` | String | 物理坐标或内容分类 | `武汉`, `上海` |
| `images` | Files | 多图存储，最大 9 张 | `[img1.jpg, img2.jpg]` |
| `created` | DateTime | 自动生成的记录时间 | `2026-04-18` |

## 2. Profiles (个人身份)
用于动态配置首页的品牌信息。

| 字段名 | 类型 | 说明 | 示例 |
| :--- | :--- | :--- | :--- |
| `avatar` | File | 个人高清头像 | `user-logo.png` |
| `headline` | String | 首页大字标题 | `我把做过的界面...` |
| `skills` | JSON | 包含 label 和 content 的技能数组 | `[{label: '前端', content: '...'}]` |
| `footer_text` | String | 最底部的装饰性文本 | `*This is my zine...` |

## 3. 系统配置
*   **主题持久化**：使用本地 `localStorage` 同步，键名为 `me-theme`。
*   **图片处理**：前端通过 `ProgressiveImage` 实现占位与模糊淡入，建议后端在上传时自动生成 10px 宽的低保真占位图（Thumbnails）。
