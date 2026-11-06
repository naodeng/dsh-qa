# DSH QA Workbench：对话附件上传设计

> 状态：Reviewed and approved for implementation
>
> 交付状态：交互原型已获用户确认；设计已按 DSH `dsh-v0.2.0-rc.2` 官方附件契约复核。

## 1. 目标

让 DSH 测试对话中的「+」按钮可以选择、检查、移除并发送本地附件。附件由
DSH 原生暂存和会话处理；QA 工作台不把附件复制进项目目录，也不另建一份附件存储。

## 2. 用户流程

1. 点击「+」打开本机文件选择器，可多选附件；已选文件名、类型和大小显示在输入框上方。
2. 用户可逐个移除附件。选择和移除阶段不上传文件。
3. 发送时先验证限制，再将附件交给当前 DSH 会话，最后与文本一起提交。
4. 上传或发送失败时保留文本和附件草稿；有可复用的 DSH receipt 时优先复用，失效则提示并允许重试。
5. 普通消息及其可恢复的会话历史以附件 chip 显示名称和类型；成功命令在当前页面显示附件 chip，不把附件正文展开到聊天气泡里。

## 3. DSH 传输方式

- 普通文件通过 DSH 原生 `session/uploadFileBinary` 上传，获得 DSH `receiptId` 后在
  `session/prompt` 的 content 中引用。仅在 DSH 嵌入模式启用；浏览器不直接上传到独立
  工作台服务器。该裸 HTTP 路由使用 `application/octet-stream` 请求体，返回值不是 DSH
  RPC envelope。
- 图片按 DSH 会话契约作为图片 content block 发送，携带文件名、媒体类型和内容；遵循
  DSH 的图片尺寸、像素和会话数量限制。支持 PNG、JPEG、WebP、GIF；其他文件类型作为普通文件。
- slash 命令只在 DSH 命令声明支持附件输入时传递 `submittedAttachments`；不支持时
  阻止本次提交并保留草稿，提示用户改用普通消息或移除附件。
- DSH `command/run` / `command/done` 持久事件不含附件引用。因此命令附件会显示在本次
  页面提交结果中，但刷新后只能恢复命令行和命令结果；不把附件名额外写入浏览器存储或
  工作台数据来伪装成 DSH 历史。普通 `user/message` 中的附件仍可从 DSH 持久历史恢复。
- 若宿主没有提供原生上传能力，显示明确错误并保留草稿；不静默降级为项目文件写入。

参考：DSH 官方 `dsh-v0.2.0-rc.2` [附件子系统说明](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/docs/subsystems/attachment.md)、
[session controller](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/api/session-controller/README.md)
和 [命令附件契约](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/interaction/commands/README.md)。

## 4. 限制与失败处理（建议值，待确认）

- 每条消息最多 10 个文件；单文件最多 20 MiB；总计最多 50 MiB。
- 图片还须满足 DSH 原生限制；任一超限都在上传前拒绝，不截断、不部分发送。
- 文件暂存在当前页面内存中，不写入 QA 项目、浏览器持久存储或工作台 JSON 数据。
- 文件只在用户点发送后交给 DSH。用户移除附件或清空草稿时，不产生 DSH 上传记录。
- DSH 收到文件后按宿主自身策略保存；工作台不承诺删除 DSH 已接收的文件。
- 普通文件 receipt 绑定到上传时的会话和宿主进程；宿主重启后失效。DSH 接受消息并写入
  对应会话事件后 receipt 会被消费。上传或提交失败时保留草稿；只有确认 receipt 仍属于
  当前会话且未被消费时才复用，否则重新上传。页面刷新会清除本地草稿，宿主中已上传但未
  引用的文件可能成为未引用记录。
- DSH 历史中的普通文件以 `file.attachment`（名称、字节数和不透明附件 ID）记录；图片以
  持久化图片引用记录。工作台据此恢复名称、类型和大小，不依赖本地文件路径。

## 5. 范围边界

包含：多选、附件 chip、移除、格式/大小校验、发送状态、失败重试、普通消息和受支持命令的
附件传递，以及从普通 DSH `user/message` 事件恢复附件名称供历史展示。

不包含：拖放、剪贴板粘贴、工作台服务端/项目目录留存、附件内容预览或编辑、工作台独立
附件管理，以及超出 DSH 本身能力的 OCR/文档转换。

## 6. 验收标准

- 「+」可以打开系统文件选择器并选择多个文件；每项都能移除，限制提示可理解。
- 选择或移除文件不会触发上传；发送时才调用 DSH 原生附件流程。
- 普通消息与声明支持附件的 DSH 命令收到正确附件；不支持附件的命令不会误发。
- 上传、提交或会话连接失败时，用户仍能看到原文本和附件，并能重试。
- 普通消息与重载后的 DSH 历史均能显示附件名称/类型；成功命令当次显示附件 chip，重载后按 DSH 的持久命令事件仅显示命令行和结果；附件内容不会被错误地当作文本展示。
- 不产生 QA 项目数据文件、工作台 JSON 或本机文件副本；独立模式说明当前不可用原因。

## 7. 实施前兼容性检查

已对照仓库声明版本 `dsh-v0.2.0-rc.2` 的官方附件和命令文档，确认裸上传路径、图片
content block、命令 `input.attachments` 声明、receipt 绑定及普通消息历史附件引用形状。
命令生命周期源码确认 `command/run` 只记录命令名、参数和来源，不包含附件引用，所以命令
附件不具备 DSH 原生历史恢复能力。实现阶段仍需
以本机真实宿主运行 Host Smoke；若本机宿主不可用，明确标记 `NOT_RUN`，不把模拟测试称作
真实宿主验证。
