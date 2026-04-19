# 数据模型与 PocketBase 映射

数据模型服务于内容表达，不服务于装饰。字段应稳定、可迁移、可直接驱动前端内容层和功能层。

## 1. `memos`

个人动态记录。它是首页 Still Alive Stack 和 Zine Reader 的核心数据源。

| 字段名 | 类型 | 必填 | 说明 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | ID | 是 | 唯一索引，用于前端定位和生成 entry 标识 | `stillalive-1` |
| `text` | Text | 是 | 正文内容。可以支持轻量 Markdown，但首屏卡片只展示纯文本摘要 | `最近一直在路上...` |
| `location` | Text | 否 | 地点、场景或内容分类 | `杭州` |
| `captured_at` | DateTime | 否 | 内容发生时间。优先用于排序和显示 | `2026-04-18 20:30:00` |
| `time_label` | Text | 否 | 面向界面的相对时间文案 | `24H内` |
| `images` | Files | 否 | 图片资源，建议最多 9 张 | `[img1.jpg, img2.jpg]` |
| `status` | Select | 是 | 发布状态 | `draft`, `published`, `archived` |
| `priority` | Number | 否 | 手动排序权重，数值越高越靠前 | `100` |
| `created` | DateTime | 自动 | PocketBase 创建时间 | `2026-04-18` |
| `updated` | DateTime | 自动 | PocketBase 更新时间 | `2026-04-19` |

### 前端映射

`StillAlive` 使用：

- `id`
- `text`
- `location`
- `time_label`
- `images`

`ZineReader` 使用：

- `id`
- `text`
- `location`
- `captured_at`
- `time_label`
- `images`

### 排序规则

默认排序：

```text
status = "published"
order by priority desc, captured_at desc, created desc
```

如果没有 `captured_at`，使用 `created` 兜底。

## 2. `profile`

个人身份配置。用于驱动首页 Hero 和全局文案。

| 字段名 | 类型 | 必填 | 说明 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| `avatar` | File | 是 | 首页头像或个人图形标识 | `user-logo.png` |
| `display_name` | Text | 是 | 页面身份名称 | `ME` |
| `headline` | Text | 是 | 首页主标题 | `我把做过的界面、写下的话，慢慢放回这里。` |
| `footer_text` | Text | 否 | 底部低优先级文案 | `This is my zine...` |
| `theme_mode` | Select | 否 | 默认主题偏好 | `system`, `light`, `dark` |
| `updated` | DateTime | 自动 | 更新时间 | `2026-04-19` |

### 设计约束

`headline` 是内容层主焦点。不要把功能说明、产品介绍或使用教程写进 headline。

## 3. `skills`

技能标签和说明内容。用于 Hero 下方的轻交互。

| 字段名 | 类型 | 必填 | 说明 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | ID | 是 | 技能唯一标识 | `design` |
| `label` | Text | 是 | 标签短文案 | `做界面` |
| `content` | Text | 是 | 展开后的说明 | `追求像素级完美...` |
| `sort_order` | Number | 是 | 展示顺序 | `10` |
| `is_visible` | Bool | 是 | 是否在首页展示 | `true` |

### 前端映射

Skill tag 是功能控件，`content` 展开后是内容层。两者在视觉上应使用不同材质。

## 4. `site_settings`

站点级配置，适合放低频变化的系统行为。

| 字段名 | 类型 | 说明 | 示例 |
| :--- | :--- | :--- | :--- |
| `default_theme` | Select | 默认主题 | `system` |
| `max_memo_images` | Number | 单条 memo 最大图片数 | `9` |
| `enable_motion` | Bool | 是否默认启用动效 | `true` |
| `enable_dot_field` | Bool | 是否启用轻点阵背景 | `true` |

## 5. 本地状态

前端可以保留少量本地状态：

| Key | 说明 |
| :--- | :--- |
| `me-theme` | 用户选择的主题模式 |

本地状态不能替代内容数据。它只用于记住设备上的界面偏好。

## 6. 图片策略

图片是内容，不是装饰。

上传建议：

- 保留原图用于阅读器。
- 生成中等尺寸图用于卡片和网格。
- 生成极小占位图或主色，用于加载前稳定布局。

前端要求：

- 所有图片区域必须有稳定比例。
- 图片加载前保留空间，避免 layout shift。
- 图片数量超过 1 张时显示数量提示，但提示属于轻量功能层，不应遮挡主体。

## 7. 状态与发布

`status` 用于保护内容流质量。

- `draft`：仅管理端可见。
- `published`：公开展示。
- `archived`：保留数据，但不进入首页堆叠。

首页只读取 `published`。管理端可以读取全部状态。
