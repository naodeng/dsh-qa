# 研发质量控制模式

这是一个覆盖研发全流程的 DSH profile bundle。它保留完整编码、文件、技能、计划、协作和浏览能力，并通过角色协议提供 BA、PM、Product、QA、Developer、Tech Lead、Automation、UX、Security、DevOps/SRE、Data 和 Release 视角。

## 常规安装

正常使用 `dsh-qa` 时，直接安装或更新 `dsh-qa` 即可。主 bundle 会同时声明 `qa` 和 `quality-control` 两个 preset；重启 DSH 后即可使用，无需单独执行本目录的安装命令。

如果之前单独安装过 `dsh-qa-quality-control`，请先从对应 DSH profile 移除或禁用它，再更新 `dsh-qa`，避免同一个 preset 被声明两次。

## 独立 bundle 安装（高级用法）

如果 `dsh-qa` 已通过 DSH 插件安装，独立 Web UI 可直接引用 `web` profile 的已安装包，无需源码目录：

```sh
PROFILE=web
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
npx --yes @deepseek-ai/dsh@0.1.7-rc.1 plugin --profile "$PROFILE" add "link:$DSH_HOME/profiles/$PROFILE/node_modules/dsh-qa/preset/quality-control"
```

官方 Electron 桌面客户端的 `desktop` profile 由客户端独占管理，不能使用 CLI 修改。请在 DSH 主应用的「插件」页点击「添加插件」，将下面命令输出的绝对路径粘贴为本地插件目录，然后安装并启用：

```sh
printf '%s\n' "${DSH_HOME:-$HOME}/profiles/desktop/node_modules/dsh-qa/preset/quality-control"
```

安装完成后按客户端提示重启 DSH。

如果使用源码 checkout，再执行仓库脚本：

```sh
scripts/install-quality-control-preset.sh
# 预览：
scripts/install-quality-control-preset.sh --profile web --dry-run
```

脚本通过 `dsh plugin --profile web add link:.../preset/quality-control` 安装 bundle；Harness 0.1.7+ 随后从当前 profile 提供 preset id `quality-control`，名称为“研发质量控制模式”。

## 使用方式

聚焦某一角色和阶段时，明确写出：

```text
role: QA
stage: test-case-writing
请基于当前项目需求输出风险驱动测试用例，并列出事实、假设、缺口和证据要求。
```

跨角色分析时：

```text
请对当前项目从 BA、Product、Tech Lead、Developer、QA、Security、DevOps/SRE 和 Release 视角，审视从需求到发布的全流程质量风险。
请按角色分别输出意见，再生成一份保留来源、冲突、少数高风险意见和人工决策项的汇总。
```

角色报告必须区分事实、证据、推断、建议和执行状态。计划、静态代码阅读、部署成功或角色一致意见都不能替代真实测试证据；没有执行证据时，质量状态只能是“未执行或证据不足”。最终的需求接受、风险接受、发布、豁免和合规决定仍由授权人工完成。

该 preset 不复制 `awesome-qa-prompt` 或 `awesome-qa-skills` 的完整内容。安装对应 DSH Skill 后，可在会话中使用其阶段 Prompt 和质量 Skill；preset 负责角色组合、边界和全流程质量控制协议。
