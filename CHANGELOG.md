# Symposium Planner — 更新日志

## 背景

Duke Nicholas School Spring Symposium 2026 的在线日程规划工具，部署在 GitHub Pages：  
https://zl396.github.io/symposium-planner/

用户反馈：选了 session 后页面 reload 所有选择全部丢失，需要从头再翻一遍，体验很差。

---

## 更新内容

### 1. 修复：页面刷新丢失 schedule（PR #1 — 已合并）

**问题根因：** `mySchedule` 使用 `new Set()` 存储在内存中，没有任何持久化机制。页面一刷新，所有数据全部丢失。

**解决方案：** 通过 `localStorage` 持久化以下状态：
- 用户选中的 session（`mySchedule`）
- 所有 filter 的值（日期、时间、地点、项目、导师、关键词）
- 当前视图（All Sessions / My Schedule）
- 滚动位置（用户刷新后回到原来浏览的位置）

每次 `render()` 后自动保存，页面加载时自动恢复。对 `localStorage` 数据损坏做了容错处理（graceful fallback 到空状态）。

**关键改动：** `index.html` — 新增 `loadState()` / `saveState()` 函数，`init()` 中恢复 filter 值和视图状态。

### 2. 新功能：导出到 Outlook / Google Calendar（PR #1 — 已合并）

新增 "Export to Outlook / Calendar" 按钮，生成标准 `.ics` 文件，可直接导入：
- Microsoft Outlook
- Google Calendar
- Apple Calendar

每个 session 生成一个日历事件，包含：
- 标题、地点、日期时间（America/New_York 时区）
- Presenters、Advisor、Abstract 链接、Zoom 链接
- 25 分钟时长
- 唯一 UID（防止重复导入）

支持导出当前视图（My Schedule 或筛选后的 All Sessions）。

### 3. 新功能：My Schedule 可视化时间线（PR #2 — 待合并）

在 "My Schedule" 视图顶部新增可视化时间线：
- **按天分组**显示，每天一个独立的时间线面板
- **时间轴**在左侧，按 30 分钟刻度标注
- **地点列**并排显示，同一时间不同教室的 session 一目了然
- **颜色编码**按 program 区分（DEL 紫色、EE 蓝色、CaMS 深蓝等），带图例
- **冲突标记**：时间冲突的 session 显示橙色边框
- **悬停操作**：鼠标悬停可直接 Remove、查看 Abstract、加入 Zoom
- **响应式设计**：适配移动端和打印
- 下方仍保留原有的卡片列表作为详细信息视图

---

## 关于时间冲突

有用户建议"应该允许同一时间段添加多个 session，再让用户决定删哪个"。实际上这个功能**原本就已支持**：
- 添加按钮没有冲突检查限制
- `getConflicts()` 自动检测时间冲突
- 冲突的 session 以橙色边框 + 警告文字标识
- 新的时间线视图让冲突更加直观可见

---

## 测试

使用 Playwright 编写了 72 个自动化测试，覆盖以下场景：

| # | 场景 | 测试数 | 说明 |
|---|------|--------|------|
| 1 | 首次加载 | 4 | 空状态、默认视图 |
| 2 | 添加 & 刷新 | 5 | schedule 持久化 |
| 3 | Filter 持久化 | 6 | 日期/地点筛选跨刷新保持 |
| 4 | 关键词持久化 | 3 | 搜索词跨刷新保持 |
| 5 | 视图切换持久化 | 4 | My Schedule 视图跨刷新保持 |
| 6 | 删除 session | 3 | 删除操作跨刷新保持 |
| 7 | 冲突检测 | 3 | 冲突标记跨刷新保持 |
| 8 | 清除 filter | 3 | 清除操作跨刷新保持 |
| 9 | 压力测试 | 3 | 127 个 session 全部添加 + 刷新 |
| 10 | 数据损坏恢复 | 3 | localStorage 损坏时优雅降级 |
| 11 | 滚动位置 | 2 | 刷新后恢复滚动位置 |
| 12 | CSV 导出 | 3 | 导出文件内容正确 |
| 13 | ICS 导出 | 13 | .ics 格式、时区、事件内容 |
| 14 | ICS 筛选导出 | 2 | 按筛选条件导出 |
| 15 | 时间线基础 | 6 | 时间线显示/隐藏、天数、块数 |
| 16 | 时间线冲突 | 2 | 冲突标记在时间线上显示 |
| 17 | 时间线删除 | 2 | 通过时间线悬停删除 session |
| 18 | 时间线持久化 | 3 | 时间线跨刷新保持 |
| 19 | 多天时间线 | 2 | 多天日程按时间排序 |

运行方式：
```bash
node run_tests.js
```

---

## 文件结构

```
symposium-planner/
├── index.html              # 主应用（HTML + CSS + JS 单文件）
├── run_tests.js            # Playwright 自动化测试（72 tests）
├── test_persistence.html   # 浏览器内测试页面（iframe 方式）
└── CHANGELOG.md            # 本文档
```

---

## 已知限制

- 持久化依赖 `localStorage`，隐私模式下关闭浏览器后数据可能丢失
- 旧版本（更新前）没有持久化机制，更新后无法恢复之前仅在内存中的选择
- Session 时长固定为 25 分钟（ICS 导出和时间线显示）
