# GUI 总目标

把桌面端信息接收能力改造成智-能社交辅助系统的操作者审查入口，并提供可吸附微信窗口的桌面悬浮动态图标。

## 必须满足

- 启动和停止系统必须能在完整 GUI 中完成。
- 桌面悬浮图标必须能通过 Electron 独立窗口渲染，并尝试吸附到微信窗口；无法找到微信时必须安全回落到屏幕角落。
- 悬浮图标必须保留原控制台入口，点击后能展开完整 `zhineng-console` 控制台。
- GUI 必须允许添加或覆盖人物分类、目标设置和回复视角。
- 目标人物分类必须能自适应映射目标跟进策略，包括目标类型、优先级、节奏、下一步动作、语气和安全闸门。
- 真实发送不得因 GUI 确认而直接发生；发送前必须展示分析过程和理由，并等待操作者确认。
- 恋爱、亲密或其他敏感目标必须采用安全后置：先展示理论预测和表达候选，再独立进行存储安全和发送安全检查。
- 必须展示长期存储、读取路径和风险边界，区分业务存储与运行审计。
- 必须同时支持第一人称代用户回复和第三人称帮用户讲解两种 MVP 输出模式。

## 当前边界

- 本模块是 GUI 与操作者审查层，不直接替代 `storage-runtime`、`decision-cluster`、`trigger-engine` 或 `intake-runtime`。
- 本模块默认使用 `zhineng_bridge` 只读接收模式；`auto_reply` 属于兼容受控回复能力，进入真实发送前必须另走受控发送门禁。
- 悬浮图标吸附只负责窗口展示和入口触发，不代表已经完成真实微信发送验收。
- 存储结构展示以当前项目约定为准：真实输入包在 `runtime/user-inputs/**`，长期业务存储在 `data/**`，运行证据在 `runtime/**`。

## 验收点

- `ZhinengConsole` 可以被 Electron 通过 `?window=zhineng-console` 渲染。
- `ZhinengDockIcon` 可以被 Electron 通过 `?window=zhineng-dock` 渲染。
- 主窗口可以打开完整控制台，也可以打开桌面悬浮图标。
- Electron 主进程提供 `zhineng:openDock`、`zhineng:dock:refresh` 和 `zhineng:dock:openConsole` IPC。
- TypeScript 类型检查通过。
- `npm.cmd run gui:report` 能证明 GUI 接线、悬浮图标、微信吸附、自适应跟进和真实发送阻断。
- 流程树能登记新增 GUI 能力和运行入口。
