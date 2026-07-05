# 进入实现前确认清单 v1

状态：等待用户确认。

## 需要确认的方向

1. 文档归口
   - 是否确认 `subject-status-dialogue-module/` 作为后续主体状态对话框模块的统一需求文件夹。

2. 小模型接入
   - 是否确认先实现 adapter 结构，支持线上 OpenAI-compatible 和本地模型两条路径。
   - 是否先沿用现有第三方模型配置，再补充本地模型配置入口。

3. 语音输出
   - 是否确认先保留浏览器 SpeechSynthesis 作为 fallback。
   - 是否确认语音输入 STT 和语音输出 TTS 都以插件形式存在。
   - 是否确认第一阶段先做接口和 fallback，再选择具体 TTS/STT 工具。
   - 是否从 `whisper.cpp + Kokoro`、`FunASR + Kokoro`、`FunASR + CosyVoice` 中选一组作为第一阶段目标。

4. 状态读取
   - 是否确认采用 `module_status_card.v1 -> status_snapshot.v1` 的只读状态读取方式。
   - 是否确认其他模块只需生成状态卡，不被当前对话框直接读取内部运行链路。

5. 自我意识图谱
   - 是否确认先预留 `self_awareness_profile` 输入端口。
   - 在自我意识图谱未完成前，是否允许使用本地默认主体配置保持“我”的表达。

6. 需求传递
   - 是否确认当前阶段只负责状态检查和巡逻。
   - 是否确认未来允许把用户或第三方需求封装为 `requirement_packet.v1` 并传递给世界模型。
   - 是否确认需求传递必须经过世界模型审查，不由对话框直接执行。

7. 主体身份回答规则
   - 是否确认采用 `identity-response-rules.v1.md` 作为第一人称表达标准。
   - 是否确认语音输出只朗读短 `voice_line`，不朗读完整内部上下文。

8. 3D 粒子映射
   - 是否确认把模型层、语音层、状态读取层、自我意识桥接层加入 `status-dialogue-system` 星云。
   - 是否确认加入 STT、TTS、需求包、世界模型入口和巡逻官角色星点。
   - 是否确认只更新独立 3D 视觉映射，不接入真实人际关系系统。

9. 实现顺序
   - 建议第一阶段只做结构能力：配置、adapter、状态卡读取草案、UI 展示和 3D 映射。
   - 第二阶段再接入具体 TTS 工具。
   - 第三阶段再接入 STT/TTS 具体工具和自我意识图谱。
   - 第四阶段再接入世界模型需求传递。

## 推荐第一阶段实现范围

- 新增模块配置结构：remote/local model、voice profile、status snapshot path。
- 抽象 `StatusDialogueModelAdapter`。
- 抽象 `StatusDialogueVoiceAdapter`，先接浏览器 fallback。
- 抽象 `StatusDialogueSpeechInputAdapter`，先保留文字输入 fallback。
- 增加 `module_status_card.v1` 示例和只读聚合器。
- UI 显示：模型来源、语音工具来源、状态卡新鲜度、缺失状态。
- 3D 星云新增端口和边界星点。

## 暂缓实现

- 真实语音克隆训练。
- 情绪 TTS 完整接入。
- 真实自我意识图谱推理。
- 真实世界模型需求传递。
- 对外动作执行。
- 人际关系图谱真实数据接入。
