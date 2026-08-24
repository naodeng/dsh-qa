# 研发质量控制模式

这是一个覆盖研发全流程的 DSH 用户 preset。它保留完整编码、文件、技能、计划、协作和浏览能力，并通过角色协议提供 BA、PM、Product、QA、Developer、Tech Lead、Automation、UX、Security、DevOps/SRE、Data 和 Release 视角。

## 安装

```sh
scripts/install-quality-control-preset.sh
# 预览：
scripts/install-quality-control-preset.sh --dry-run
```

安装后，DSH preset id 为 `quality-control`，名称为“研发质量控制模式”。

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
