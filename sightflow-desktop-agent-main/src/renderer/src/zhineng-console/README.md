# Zhineng Console GUI

这个子模块保存智-能社交辅助系统的项目专用控制台和桌面悬浮图标组件。

## 当前定位

- 复用当前桌面端 Electron + React GUI、窗口管理和 `engine:start` / `engine:stop` IPC。
- `?window=zhineng-console` 渲染完整操作者控制台，用于展示信息接收、目标设置、分析过程、回复逻辑、语言分析、存储结构和安全后置。
- `?window=zhineng-dock` 渲染桌面悬浮动态图标；Electron 主进程会尝试将它吸附到微信窗口，找不到微信时回落到屏幕右下角。
- 不新增真实发送能力。界面里的确认只允许进入受控发送材料准备，真实发送仍由既有 `desktop:send:*` 门禁、目标绑定和操作者确认控制。

## 主要界面块

- 系统控制：启动、停止、运行模式选择。
- 目标与人物分类：允许操作者添加或覆盖人物分类；分类会自适应映射目标跟进策略、优先级、节奏、下一步动作和安全闸门。
- 桌面动态图标：显示当前跟进类型、吸附状态、人物分类和目标；可切换分类，也可展开完整控制台。
- 分析过程与理由：展示读取、意图、图谱、专家、草稿、安全后置的链路。
- 回复逻辑检查框：展示第一人称代用户回复和第三人称讲解两种 MVP 视角。
- 目标用户语言分析框：展示语气、关系阶段、敏感边界和目标判断依据。
- 存储与读取结构：列出当前长期存储和运行审计路径，以及长期范式风险。

## 文件

- `ZhinengConsole.tsx`：React 控制台和悬浮图标组件。
- `zhineng-console.css`：控制台和悬浮图标样式。
- `GOAL.md`：本 GUI 子模块的总目标、边界和验收点。

## 验证

优先运行：

```powershell
cd sightflow-desktop-agent-main
npm.cmd run typecheck
```

完整项目变更后还需要回到 `D:\zhineng` 运行：

```powershell
npm.cmd run gui:report
npm.cmd run process-tree:validate
```
