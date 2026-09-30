# DeepSeek Harness Discussion #8340 对 dsh-qa 升级排查的参考

> 评估日期：2026-09-30
> 上游目标：`dsh-v0.2.0-rc.2` 及其 macOS 官方客户端
> 参考讨论：[Discussion #8340](https://github.com/deepseek-ai/deepseek-harness/discussions/8340)
> 证据边界：讨论是第三方迁移复盘，不替代 Harness 源码、Release 或真实宿主验证；本记录只把其中可被当前仓库证据支持的部分作为排查参考。

本文中的 desktop profile、磁盘安装包和运行进程状态来自本次用户本地环境观察，不能仅凭仓库 checkout 复现。

## 结论

Discussion #8340 最值得复用的不是某一条 API 修改，而是排查顺序：先确认实际运行的副本、依赖版本、profile lockfile 和已加载进程，再判断是否为 Harness 升级破坏。它与当前 dsh-qa 现场的 lockfile、磁盘包和数据 schema 错位高度吻合。

当前没有证据表明 dsh-qa 需要因为 0.2 的核心插件契约改写源码。当前故障首先应按 profile/runtime 不一致和重复 Git URL 安装误判处理。

## 讨论内容与当前仓库的映射

| Discussion #8340 的提醒 | dsh-qa 当前证据 | 判断 |
| --- | --- | --- |
| 版本门禁可能在启动期跳过插件 | `package.json` 没有 `peerDependencies`；dsh-qa 本身没有声明 DSH peer 上界 | 没有发现 dsh-qa 自身命中该问题；仍需真实宿主检查 bundle 依赖是否 pending |
| `settingsScope` 被删除并替换为新设置契约 | 当前仓库没有 `settingsScope` 或 `configForms` 调用 | 无直接命中 |
| Session v4 要求生产者拥有 `source.kind` | [`lib/index.js`](../../lib/index.js) 已把旧 `kind: plugin` 归一化为 `plugin:<owner>`，并有对应单元测试 | 已有兼容处理；仍需正常对话轮验证 |
| `link:` 本地插件可能变成悬空软链 | 当前 desktop profile 的 `node_modules/dsh-qa` 不是软链；用户使用的是 Git URL | 不是当前截图的首要原因；若改用本地 link 仍需单独检查 |
| 激活成功但 patch 条目没有提供下游所需服务 | 当前 bundle 的 patch 条目 id 位于 [`cordis.patch.yml`](../../cordis.patch.yml)、[`preset/qa/cordis.patch.yml`](../../preset/qa/cordis.patch.yml) 和 [`preset/quality-control/cordis.patch.yml`](../../preset/quality-control/cordis.patch.yml) | 当前没有 pending 证据；保留为 Host Smoke 检查项 |
| 同机多个副本、旧依赖和旧进程互相遮蔽 | desktop lockfile 仍解析 dsh-qa `0.6.0/schema 4`，数据已是 `schema 5`，磁盘目录却是 `0.7.1/schema 5` | 与当前“数据库版本过新”最吻合 |

## 对当前两个症状的帮助

### `数据库版本过新`

dsh-qa 当前 `CURRENT_SCHEMA_VERSION` 是 5，启动时会读取 `~/.dsh/dsh-qa/data.json`；若旧宿主代码只支持 schema 4，就会在服务启动阶段拒绝数据。应先统一 profile lockfile、`node_modules` 和已运行进程，不应删除或降级用户数据。

### `ambiguous-install`

Discussion #8340 强调“实际副本和依赖版本必须一起核对”。这正适用于截图中的 Git URL 重试：`pnpm add` 返回 `Already up to date`，没有 dependency diff，插件管理器无法从差异中识别新包。应先卸载已安装的 dsh-qa，再用 `dsh-qa` 包名或明确版本重新安装，并重启 DSH。

## 建议保留的验证顺序

1. 完全退出并重新启动官方 macOS 客户端，确认旧插件进程已卸载。
2. 在 Plugins 页面卸载 dsh-qa；只移除包，不删除 `~/.dsh/dsh-qa/data.json`。
3. 安装已发布的 `dsh-qa` 包名，或安装明确 tag/commit 的 Git 版本；不要重复 Retry 同一个未变化的 Git URL。
4. 检查 desktop profile 的 lockfile、安装目录版本和数据 schema 是否一致。
5. 先验证插件加载和正常对话，再验证 Workbench、`qa` preset、`quality-control` preset 以及刷新/重启恢复。

## 参考来源

- [Discussion #8340 主文](https://github.com/deepseek-ai/deepseek-harness/discussions/8340)
- [Discussion #8340 关于 0.1.7 → 0.2 的补充评论](https://github.com/deepseek-ai/deepseek-harness/discussions/8340#discussioncomment-18669455)
- [Harness `dsh-v0.2.0-rc.2` Release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2)
- [dsh-qa 当前迁移实现](../../server/migrations.js)
- [dsh-qa 当前宿主入口与数据目录](../../lib/index.js)
