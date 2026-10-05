# 移动端适配规范（Mobile Adaptation Spec）

> 适用范围：toexcel-review（StatementToExcel）全站 —— Astro 静态页 + React 转换器。
> 目标：任何页面在 320px–430px 宽度下**不出现页面级横向滚动**，核心操作（选文件 → 预览 → 下载）单手可完成。
> 校验：`node scripts/check-mobile.mjs`（见文末）必须全绿。

## 1. 断点

| 断点 | 含义 |
|---|---|
| ≤720px | 手机：主导航收进汉堡菜单，按钮/表单按触控尺寸 |
| ≤900px | 小屏：语言切换器换行 |
| 默认（>720px） | 桌面：完整导航 |

不引入更多断点。流式排版（`clamp()`）承担 720px–1120px 之间的过渡，不靠断点硬切。

## 2. 溢出铁律（最高优先级）

1. **页面级横向滚动是 bug**：`document.documentElement.scrollWidth` 必须 `<= innerWidth`（320/360/390 三档）。
2. 兜底：`html, body { overflow-x: clip; }` —— 用 `clip` 不用 `hidden`，`clip` 不创建滚动容器，不影响 `position: sticky`。
3. 表格/代码块允许**局部横滑**，但必须包在带 `.table-wrap`（或等效 `overflow:auto`）的容器里，且容器本身不超出视口。表格横滑时加 `overscroll-behavior-x: contain`，防止滑动链带到页面。
4. 新组件上线前跑一遍 `scripts/check-mobile.mjs`。

### 常见溢出元凶（按规范写法）

| 元凶 | 规范写法 |
|---|---|
| `grid-template-columns: repeat(auto-fit, minmax(300px, 1fr))` 在小屏把轨道撑出容器 | `minmax(min(300px, 100%), 1fr)` —— min 永远写 `min(Xpx, 100%)` |
| flex 子项被内容撑开（如下拉框的最长 option） | 子项 `min-width: 0`；`.field > .select/.input` 设 `width: 100%` |
| `.btn` 的 `white-space: nowrap` + 长文案 | 按钮文案保持短；容器用 `flex-wrap: wrap` |
| 长 URL / 长单词（博客正文、德语复合词） | `.prose` 内 `overflow-wrap: break-word` |
| 图片 | 全局 `img { max-width: 100%; height: auto; }` |
| AdSense 响应式广告 | 保留 `data-full-width-responsive="true"`；`.ad-slot` 加 `max-width: 100%`（**不**用 `overflow: hidden` 裁广告，违反 AdSense 政策） |

## 3. 表单与触控

- **iOS 防缩放**：移动端（≤720px）`.input` / `.select` 字号不得小于 16px，否则 iOS Safari 聚焦时会自动放大页面。
- **触控目标**：主要按钮在手机上最小 44px 高（`.btn` 在 ≤720px 时 `min-height: 44px`）；汉堡菜单按钮 44×44px。
- 下拉框默认 `max-width: 100%`，放在 flex 容器里时父级 `.field` 给 `flex: 1 1 10rem; min-width: 0`，不允许被最长 option 撑出视口（2026-10-06 实测 bug：360px 下"Numbers and dates"下拉框被 `.converter` 的 `overflow: hidden` 裁掉）。
- `label` 与控件用 `.field` 纵向包裹，间距 0.3rem；错误/提示文字用 `.field__hint`。

## 4. 排版

- 正文 17px / 1.65 行高全端统一，不在手机上缩小正文（可读性优先）。
- 标题用 `clamp()` 流式缩放，手机上 h1 不超过 2rem。
- `text-wrap: balance` 只用于短标题，不用于正文段落。

## 5. 导航（手机）

- ≤720px 时 `.site-nav` 收进汉堡菜单（`<details>` 实现，无 JS 也能用，与"无 JS 可切换语言"的原则一致）。
- 语言切换器保留在 header 内，允许换行；当前语言 `aria-current="page"` 高亮不变。

## 6. 转换器（React 部分）移动端要点

- 状态机（idle / busy / password / ready / error）每个状态都要在 360px 下单独验收，不只测 idle。
- `.converter` 本身 `overflow: hidden`（圆角裁剪），所以**内部元素溢出会被静默裁掉而不是撑出页面** —— 这是最隐蔽的一类 bug，验收时要逐个检查内部块（`converter__head` / `download-bar` / `privacy-strip`）的 `getBoundingClientRect()` 是否越界。
- 预览表：列多是正常的，横滑在 `.table-wrap` 内解决；`thead th` 保持 `white-space: nowrap`，数字列右对齐 tabular-nums 不变。
- 下载栏：三个 `.field`（格式/日期/语言）+ 按钮组，手机上允许换行堆叠，按钮组 `margin-left: auto` 在换行后自动顶到行首（已验证行为符合预期）。

## 7. 验收清单（每次改动 UI 后）

- [ ] `node scripts/check-mobile.mjs` 在 320/360/390 下全绿（含转换器 ready 状态，用 fixture PDF 驱动）
- [ ] 真机（或设备模式）走一遍：选文件 → 等待 → 预览横滑 → 换预设 → 下载
- [ ] iOS Safari 聚焦一次密码框/下拉框，确认页面不自动缩放
- [ ] 广告位在 AdSense 生效后复查一次（本地无真实广告，测不到）

## 附：check-mobile.mjs 原理

用 Playwright + 本地 Chromium（`/opt/meta-chromium/chrome`，`--no-sandbox`）拦截请求、直接从 `dist/` 供文件（绕过该 Chromium 的 Local Network Access 限制），在 320/360/390 三档视口下：

1. 静态页：逐页断言 `document.documentElement.scrollWidth <= innerWidth`，并列出越界元素（排除合法的横滑容器和 `.visually-hidden`）。
2. 转换器 ready 态：用 `fixtures/pdf/chase-like.pdf` 经 `setInputFiles` 真实驱动到预览态，再断言 `.converter` 内部各块不越界。
