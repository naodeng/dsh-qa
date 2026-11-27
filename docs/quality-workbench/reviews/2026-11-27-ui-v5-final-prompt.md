# v5 最后一轮修改 Prompt

> 用法：先把「总 Prompt」粘给设计工具；如果工具有上下文/字数限制，按「逐页补丁」逐页改。  
> 目标：只修 v5 的收口项，不重设计、不新增后端字段。

---

## 一、总 Prompt（可直接粘贴）

```text
你是 dsh-qa（本地 QA 工作台）的 UI 设计师。请在现有 v5 稿上做最后一轮修改，不要重新设计信息架构，不要新增后端字段或业务功能。保留现有 4 个一级导航、6 列看板、项目工作区 6 个分区、深色/浅色 token、工程蓝主色和现有组件。

只修下面 8 组问题：

1) 视口高度
- 首页容器 `lg:h-[1024px]` 改成 `lg:h-screen`，`min-h-[1024px]` 改成 `min-h-screen`。
- 右侧 DSH 对话栏固定视口高度，消息区独立滚动，输入区固定在栏底。
- 补 1440×900、1440×768 两张图，确认输入框首屏可见。
- 移动端首页的「DSH 对话」按钮直接打开全屏 sheet，不允许只 scrollIntoView。

2) 英文
- 给所有页面补完整 i18n 文案：导航、按钮、表头、表单标签、状态、空态、错误、确认弹窗、Tooltip。
- 提供首页、看板、工作区、日历、Skills、移动端、关键弹窗的英文截图。
- 英文按 30–40% 文本膨胀检查 390px；不要只切换 `lang` 属性。

3) 设置信息
- `兼容 DSH` 不要写 v0.7.x（v0.7.x 是 dsh-qa 版本）；写当前 app-info.dshVersion（如 dsh-v0.2.0-rc.2，README 已验证 v0.2.2-rc.1）。
- 官网改成 `https://inaodeng.com/zh-cn/dsh-qa/`，不要写 dsh.dev。
- 代码仓库改成 `https://github.com/naodeng/dsh-qa`。
- Homepage 用真实链接，不要 `#`。

4) 对话
- 右栏补完整「技能与命令」浏览：技能/命令 tab + 搜索，数据来自 state.dsh.skills / state.dsh.commands，不要只放 2 条 slash。
- 补「调整辅助策略」入口。
- 补会话恢复 4 态：会话缺失 / 未绑定 / 需要新对话 / 会话列表不可用。
- 模型下拉用真实 DSH 模型列表，不要占位。
- 保留模型选择、项目雷达、新对话、展开、附件、停止。

5) Skills
- 只使用真实目录技能；不要 regression-testing、exploratory-testing、ui-automation 这类不存在项。
- 顶部「加载中 / 加载失败 / 空结果」是设计验收控件，最终稿移除，或明确标注「设计验收用」。
- 空 / 加载 / 失败状态由 API 状态驱动，不要靠手动按钮。
- 详情 modal 接真实 siteUrl 和描述；数量动态。

6) 首页
- 补跨项目「行动台」drawer：列出全部 action queue，按风险排序，每条动作跳到对应项目/分区。
- 「在办项目」快速预览要么复用看板 10 tab drawer，要么改名「摘要」。
- 项目表补最近活动时间，支撑「按最近活动排序」。

7) 看板
- 卡片补：报告数、待审批门禁、AI 进行中、最近活动。
- 保留 6 列、拖拽、抽屉 10 tab、移动端 6 阶段。

8) 收口
- 假 ID 改成真实前缀：failure_*、regression_*；decisions 不要造 ID。
- 移动端证据卡拆开「结果 / 级别」，不要显示 `passed · block`。
- modal 补 focus trap。
- 交付前去掉 data-stitch-vh、预览模态弹窗、状态预览等原型/设计工具控件。
- 字体和 CDN 在交接说明里写清本地化方案（系统字体或本地 woff2；图标用 inline SVG）。

交付：更新 8 个页面 + 英文版 + 深色版；附一张 900 高度验收图和一份改动清单。不要改现有 IA 和字段。
```

---

## 二、逐页补丁（工具上下文有限时用）

### 首页

```text
只改测试首页：
1. `lg:h-[1024px]` → `lg:h-screen`，对话栏固定高度、消息区滚动、输入区固定；补 900/768 验收图。
2. 补跨项目「行动台」drawer，列出全部 action queue，按风险排序，每条跳到对应项目/分区。
3. 「快速预览」复用看板 10 tab drawer，或改名「摘要」。
4. 项目表补最近活动时间。
5. 英文覆盖：标题、KPI、行动行、项目表、今日日程、AI/动态、对话栏。
不要改看板/工作区。
```

### 看板

```text
只看板页：
1. 卡片补报告数、待审批门禁、AI 进行中、最近活动。
2. 保留 6 列、拖拽、抽屉 10 tab、移动端 6 阶段。
3. 英文覆盖：标题、筛选、列头、卡片字段、空列、拖拽提示、抽屉 tabs。
不要改其他页。
```

### 项目工作区

```text
只改项目工作区：
1. 假 ID：fa_01 → failure_*；reg_order_core → regression_*；dec_01 改成 decisions 的字段展示，不造独立 ID。
2. 移动端证据卡拆「结果 / 级别」，不要显示 `passed · block`。
3. modal 补 focus trap。
4. 英文覆盖：6 tab、需求矩阵、任务子实体、缺陷/风险、证据 checks、审批/报告/证据 modal、检视器。
5. 保留现有 6 分区和所有子实体。
```

### 日历

```text
只改日历页：
1. 保留 42 格月历、7 天周视图、移动议程、删除确认、+N、图例、年/月/日期跳转、30 天。
2. 英文覆盖：标题、图例、工具栏、月/周/日、选中详情、空态、删除确认。
不要改其他页。
```

### 设置

```text
只改设置页：
1. `兼容 DSH` 改成当前 dshVersion（如 dsh-v0.2.0-rc.2 / v0.2.2-rc.1），不要 v0.7.x。
2. 官网改 https://inaodeng.com/zh-cn/dsh-qa/；仓库改 https://github.com/naodeng/dsh-qa；Homepage 用真实链接。
3. 英文覆盖：三个表单、release/clear modal、版本说明。
4. 保留 projectKey 可选、固定 intake、full/manual、reminders、autoExtract、createWorkspace。
```

### Skills

```text
只改 Skills 页：
1. 删除 regression-testing、exploratory-testing、ui-automation 等真实目录不存在的技能。
2. 顶部加载中/加载失败/空结果改为「设计验收用」或移除；状态由 API 驱动。
3. 详情 modal 接真实 siteUrl/描述；数量动态。
4. 英文覆盖：标题、筛选、分类、卡片、分页、空/加载/失败、卸载确认。
```

### 移动端

```text
只改移动端：
1. 首页「在办项目 (3)」保留「打开看板」；行动区保留「查看全部」。
2. DSH 对话打开全屏 sheet，输入区固定。
3. 证据卡拆「结果 / 级别」。
4. 英文覆盖：导航、KPI、行动、项目、日程、对话、看板 6 阶段。
5. 390px 下检查导航/按钮/状态徽标不溢出。
```

### 状态页

```text
只改状态页：
1. 英文覆盖：PASS/WARN/BLOCK、Host adapter、provenance、409/403、无项目/会话、loading/error、toast/confirm。
2. 补实际的 loading skeleton / toast / confirm 视觉示例，不只是文字说明。
3. 保留现有语义，不要新增状态。
```

---

## 三、不要做的事

- 不要新增后端字段、接口或业务功能。
- 不要改 4 个一级导航、6 列看板、项目工作区 6 分区。
- 不要恢复「签字放行 / 一键放行 / Host 4318 / SQLite / risk-point / controlled-local 作为 provider」。
- 不要用 `dsh.dev`、`v0.7.x` 作为 DSH 版本/官网。
- 不要把假技能、假 ID、假路径写进最终稿。

---

## 四、改完后的验收

- [ ] 1440×900 / 1440×768 输入框首屏可见
- [ ] 英文覆盖主要页面、表单、状态、弹窗；390px 无溢出
- [ ] 设置里 DSH 版本/官网/仓库正确
- [ ] 对话有完整技能与命令、策略入口、会话恢复 4 态、真实模型
- [ ] Skills 全部真实技能；状态由 API 驱动；详情真实
- [ ] 首页有跨项目行动台；快速预览是 10 tab 或改名摘要
- [ ] 看板卡片有报告/待审批门禁/AI/最近活动
- [ ] `failure_*` / `regression_*` / decisions 字段正确
- [ ] 移动端证据结果/级别分开
- [ ] modal focus trap；原型控件移除
- [ ] 800/900/768/390 无横向溢出
```
