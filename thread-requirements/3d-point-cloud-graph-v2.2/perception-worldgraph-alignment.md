# 感知到世界图谱对齐层补充方案

状态：当前线程需求补充，不是正式项目文档。

适用目标：

- 补齐“传感器不是设备清单”的架构定义。
- 为后续 `Observation Atom`、`Fusion Bundle`、传感器矩阵、冲突处理、统一时空坐标、潜变量和物理概念定义库提供可执行方案。
- 保持当前项目第一阶段 B2B 社交辅助闭环不变，不触发正式实现、不写入运行时、不接入真实设备。

## 核心判断

传感器接入不能设计成“系统支持哪些设备”的列表。真正需要的是一个把现实世界观测对齐到图谱系统的协议层：

传感器原始信号 -> 传感器注册 -> 标定和时空对齐 -> Observation Atom -> Fusion Bundle -> 潜变量和假设 -> 全域事件图谱 -> 世界状态图谱 -> 人际图谱 / 任务图谱 / 学习引擎 / 决策层

这层建议命名为：

`Perception-to-WorldGraph Alignment Layer`

它的职责不是做最终判断，而是把“多源观测如何共同支持或反驳一个世界状态假设”表达清楚。

## 不可变原则

1. 传感器只输出观测，不直接输出社会意义。
2. 观测、假设、事实、策略、行动必须分层。
3. 每条观测必须有来源、时间、空间、单位、置信度、误差和原始证据引用。
4. 多传感器融合优先形成假设，不直接改写人物、关系或行动。
5. 物理事件只能通过事件图谱间接影响人际图谱。
6. 学习引擎只能使用观测、偏差和反馈修正知识或模型，不能绕过决策层。
7. 自我意志模型只能评分候选方案，不能直接控制行动。
8. 高风险、隐私、亲密关系、金钱、法律、医疗、设备控制、实验和新材料相关动作必须人工确认。

## 层级结构

### 0. Sensor Hardware Layer

真实设备或数字来源，例如：

- 麦克风、摄像头、深度相机、LiDAR、红外、毫米波雷达。
- 触觉、压力、温度、湿度、电导、气体、光谱、IMU、RFID。
- 屏幕、聊天记录、日历、文件、网络页面、设备日志。

这一层只产生原始数据或设备事件，不直接进入人际图谱。

### 1. Sensor Adapter Layer

负责把不同来源转换为统一的输入形式：

- 数据格式解码。
- 采样率处理。
- 单位转换。
- 隐私等级标记。
- 原始数据引用。
- 基础质量评估。

输出还不是事实，只是可被登记和对齐的传感器数据。

### 2. Sensor Registry

每个传感器必须先登记能力、边界和风险。

建议结构：

```json
{
  "sensor_id": "pressure_grid_right_hand_001",
  "sensor_family": "tactile",
  "modality": "pressure",
  "platform": "user_right_hand_wearable",
  "observed_properties": [
    "contact_presence",
    "contact_pressure",
    "contact_area",
    "pressure_distribution"
  ],
  "sampling_rate_hz": 200,
  "latency_ms": 8,
  "range": {
    "pressure_kpa": [0, 120]
  },
  "accuracy": {
    "pressure_kpa": 2.5
  },
  "coordinate_frame": "right_hand_frame",
  "privacy_class": "body_contact_sensitive",
  "calibration_status": "valid",
  "failure_modes": [
    "sensor_drift",
    "sweat_affects_capacitance",
    "misalignment",
    "glove_material_interference"
  ],
  "allowed_graph_writes": [
    "physical_event_graph",
    "contact_event_graph"
  ],
  "blocked_graph_writes": [
    "emotion_truth_graph",
    "deception_inference_graph"
  ]
}
```

关键规则：

- 未登记传感器不能产生可写图谱的观测。
- `blocked_graph_writes` 优先级高于 `allowed_graph_writes`。
- 传感器能力只能说明“可观测什么”，不能说明“这意味着什么”。

### 3. Calibration and Time-Space Layer

所有观测必须进入统一时空和单位体系。

建议坐标帧树：

```text
world_frame
  building_frame
    room_301_frame
      camera_001_frame
      lidar_001_frame
      mic_array_001_frame
      thermal_001_frame
      table_001_frame
  user_body_frame
    right_hand_frame
    left_hand_frame
    chest_frame
```

建议登记结构：

```json
{
  "frame_id": "lidar_001_frame",
  "parent_frame": "room_301_frame",
  "transform": {
    "translation_m": [2.1, 0.4, 1.2],
    "rotation_quaternion": [0.0, 0.0, 0.707, 0.707]
  },
  "time_offset_ms": 12,
  "unit_standard": "SI",
  "calibration_status": "valid",
  "calibration_updated_at": "2026-06-20T09:00:00+08:00",
  "known_error": {
    "position_std_m": 0.03,
    "rotation_std_deg": 0.8
  }
}
```

每条观测都必须回答：

- 发生时间：`phenomenon_time`。
- 结果时间：`result_time`。
- 所在坐标系：`coordinate_frame`。
- 单位：优先 SI 单位。
- 误差：标准差、协方差或明确未知。
- 延迟：采样、传输和处理延迟。
- 标定状态：valid、stale、missing、invalid。

### 4. Observation Atom Layer

`Observation Atom` 是所有传感器的最小统一数据单位。它只表达“观察到了什么”，不表达“最终意味着什么”。

建议结构：

```json
{
  "observation_id": "obs_20260620_0001",
  "schema_version": "observation_atom.v1",
  "source": {
    "sensor_id": "mic_array_001",
    "sensor_family": "acoustic",
    "sensor_type": "microphone_array",
    "platform_id": "room_301_sensor_rig",
    "privacy_class": "audio_sensitive"
  },
  "observed": {
    "property": "sound_direction_of_arrival",
    "feature_of_interest_candidate": "unknown_signal_source",
    "result": {
      "value": 42.5,
      "unit": "degree"
    }
  },
  "time": {
    "phenomenon_time": "2026-06-20T15:21:04.230+08:00",
    "result_time": "2026-06-20T15:21:04.250+08:00",
    "latency_ms": 20
  },
  "space": {
    "coordinate_frame": "room_301_frame",
    "position": null,
    "direction_vector": [0.74, 0.67, 0.05]
  },
  "quality": {
    "confidence": 0.78,
    "noise_level": 0.21,
    "covariance": null,
    "known_failure_modes": [
      "reverberation",
      "multiple_speakers"
    ]
  },
  "provenance": {
    "raw_data_ref": "blob://audio_segment_001",
    "algorithm": "audio_doa_v2",
    "model_version": "2026.06.1"
  },
  "interpretation_status": "observation_only",
  "blocked_inferences": [
    "do_not_infer_intent",
    "do_not_infer_emotion"
  ]
}
```

必填字段：

- `observation_id`
- `schema_version`
- `source.sensor_id`
- `observed.property`
- `observed.result`
- `time.phenomenon_time`
- `time.result_time`
- `space.coordinate_frame`
- `quality.confidence`
- `provenance.raw_data_ref`
- `interpretation_status`

允许状态：

- `observation_only`：仅观测。
- `candidate_feature`：可作为特征参与融合。
- `supports_hypothesis`：已被某个假设引用。
- `conflicted`：与其他观测冲突。
- `invalidated`：因质量、标定或证据问题被排除。

### 5. Multi-Modal Fusion Layer

多模态融合层把多个 Observation Atom 组合成同一实体、信源、接触或事件的候选假设。

核心方法：

- 时间门控：是否发生在同一时间窗口。
- 空间门控：位置、方向、轨迹是否一致。
- 身份门控：人脸、声纹、RFID、历史到访等是否支持同一身份。
- 运动一致性：轨迹、速度、姿态是否支持同一事件。
- 物理合理性：距离、遮挡、强度、温度、压力是否符合物理约束。
- 语义一致性：场景、任务、关系、会议上下文是否支持。
- 冲突检查：观测是否互相矛盾。

### 6. Fusion Bundle

`Fusion Bundle` 是多个 Observation Atom 共同支持某个实体或事件假设的融合包。

建议结构：

```json
{
  "fusion_bundle_id": "fusion_handshake_001",
  "schema_version": "fusion_bundle.v1",
  "bundle_type": "event_hypothesis",
  "latent_refs": [
    "latent_entity_user",
    "latent_entity_zhangsan",
    "latent_contact_001",
    "latent_event_004"
  ],
  "hypothesis": {
    "event_type": "handshake",
    "participants": [
      "user",
      "person_zhangsan"
    ],
    "confidence": 0.87,
    "status": "hypothesis"
  },
  "observations": [
    "obs_vision_hand_pose_001",
    "obs_pressure_contact_001",
    "obs_skin_temp_001",
    "obs_local_humidity_001",
    "obs_room_humidity_001",
    "obs_speech_greeting_001"
  ],
  "fusion_methods": [
    "time_gating",
    "spatial_gating",
    "contact_confirmation",
    "contextual_reasoning"
  ],
  "supports": [
    {
      "claim": "physical_contact_occurred",
      "confidence": 0.96
    },
    {
      "claim": "handshake_gesture_occurred",
      "confidence": 0.87
    },
    {
      "claim": "business_greeting_context",
      "confidence": 0.74
    }
  ],
  "refutes": [],
  "conflicts": [],
  "does_not_support": [
    {
      "claim": "person_is_trustworthy",
      "reason": "insufficient_evidence"
    },
    {
      "claim": "person_is_deceptive",
      "reason": "insufficient_evidence"
    }
  ],
  "write_to_graph": [
    "physical_event_graph",
    "social_event_graph",
    "relationship_graph"
  ],
  "graph_write_policy": {
    "relationship_graph": "low_delta_only",
    "requires_human_review": false,
    "blocked_updates": [
      "do_not_infer_deep_trust",
      "do_not_infer_romantic_interest",
      "do_not_infer_hostility"
    ]
  }
}
```

关键规则：

- `Fusion Bundle` 不是已确认事实。
- 它只能成为事件图谱写入候选。
- 写入人际图谱时必须通过 `graph_write_policy`。
- 任何社会意义都必须从物理事件经过场景和关系上下文推导，不能从单一传感器直接推导。

## 五张传感器矩阵

### 1. 传感器-属性矩阵

回答：这个传感器能观察什么物理或数字属性？

建议字段：

- `sensor_family`
- `sensor_type`
- `observed_property`
- `unit`
- `sampling_rate`
- `confidence_baseline`
- `privacy_class`
- `known_failure_modes`
- `atom_result_type`

示例：

| sensor_family | observed_property | unit | atom_result_type | limitation |
| --- | --- | --- | --- | --- |
| acoustic | sound_direction_of_arrival | degree | direction_vector | 回声和多人说话会降低置信度 |
| visual | face_candidate | probability | identity_candidate | 光照、遮挡、角度会影响结果 |
| geometric_ranging | body_track_position | meter | position_3d | 不能单独确认身份 |
| thermal | surface_temperature | celsius | scalar_field | 热源不等于人 |
| tactile | contact_pressure | kPa | pressure_distribution | 手套、汗液、偏移会影响结果 |
| environmental | room_humidity | relative_humidity | scalar | 只能解释背景，不能单独判断心理 |
| digital_context | calendar_event | text/event | context_record | 数字记录可能过期或缺上下文 |

### 2. 传感器-实体矩阵

回答：这个传感器适合支持哪些实体候选？

建议字段：

- `entity_type`
- `primary_sensors`
- `supporting_sensors`
- `identity_strength`
- `localization_strength`
- `common_false_positive`
- `required_confirmation`

示例：

| entity_type | primary_sensors | supporting_sensors | output |
| --- | --- | --- | --- |
| person | RGB, thermal, radar, LiDAR | voiceprint, RFID, Bluetooth | `latent_entity_id` |
| hand | RGB, depth, tactile | temperature, humidity, IMU | `latent_body_part_id` |
| sound_source | microphone_array | lip_sync, LiDAR body track, scene context | `latent_signal_source` |
| moving_object | LiDAR, radar, visual | RFID, IMU | `latent_object_id` |
| environment | temperature, humidity, CO2, light | sound field, pressure | `environment_state` |
| device | RFID, visual, power_log | thermal, vibration, sound | `latent_device_id` |
| material | spectrum, gas, vision, touch | temperature, humidity | `latent_material_id` |

### 3. 传感器-事件矩阵

回答：哪些传感器组合支持哪些事件候选？

建议字段：

- `event_type`
- `necessary_observations`
- `supporting_observations`
- `exclusion_observations`
- `minimum_confidence`
- `target_graph`
- `human_review_required`
- `blocked_inferences`

示例：

| event_type | necessary_observations | supporting_observations | target_graph |
| --- | --- | --- | --- |
| person_entered_room | body_track_crosses_boundary | door_sensor, Bluetooth, footstep_audio | global_event_graph, space_graph |
| person_speaking | voice_activity, signal_source_localized | lip_sync, face_match, body_track | global_event_graph, conversation_graph |
| handshake | hand_contact, two_human_hands, duration_gt_threshold | greeting_speech, body_orientation, shake_cycles | physical_event_graph, social_event_graph |
| object_pickup | hand_track_near_object, object_position_changed | RFID, pressure, IMU | object_graph, task_graph |
| device_anomaly | temperature_or_vibration_outlier | device_log, sound, current | device_graph, task_graph |
| humid_hot_environment | room_temperature_high, room_humidity_high | CO2, airflow, user_behavior | space_graph, self_state_context |
| conflict_escalation_signal | speech_intensity_change, interruption_pattern | posture_distance, language_signal | risk_graph, social_event_graph |
| experiment_deviation | measured_value_differs_prediction | video, device_log, environment_state | learning_engine, experiment_graph |

### 4. 传感器-传感器互补矩阵

回答：两个观测源之间如何共同支持、反驳或修正一个假设？

关系类型：

- `redundancy`：冗余校验。
- `complementarity`：互补拼合。
- `disambiguation`：消歧。
- `calibration`：校准。
- `contradiction`：冲突。
- `context`：背景解释。
- `trigger`：触发高成本或高隐私采集。
- `privacy_guard`：优先使用低隐私观测，必要时再请求高隐私观测。

示例：

| source_a | source_b | relation_type | meaning |
| --- | --- | --- | --- |
| RGB | thermal | redundancy | 都检测到人体存在，提高人存在置信度 |
| pressure | vision_hand_pose | complementarity | 接触压力和手部姿态共同支持握手事件 |
| humidity | skin_conductance | disambiguation | 环境湿度解释手汗，不直接推断紧张 |
| LiDAR | camera | calibration | LiDAR 空间定位校准视觉位置 |
| microphone_array | lip_sync | contradiction | 声源方向和口型不同步时保留多假设 |
| PIR | camera | trigger | 低隐私存在检测触发视觉采集请求 |
| radar | camera | privacy_guard | 先用雷达检测存在，用户允许后再开启摄像头 |

### 5. 传感器-图谱写入矩阵

回答：观测或融合结果可以写入哪个图谱，不能写入什么。

建议字段：

- `input_type`
- `minimum_object_type`
- `allowed_graph_writes`
- `blocked_graph_writes`
- `write_mode`
- `requires_human_review`
- `audit_required`

示例：

| input_type | allowed_graph_writes | write_mode | blocked_graph_writes |
| --- | --- | --- | --- |
| raw_observation | observation_store | append_only | relationship_truth_graph |
| person_presence_hypothesis | global_event_graph, space_graph | hypothesis | identity_truth_graph |
| speech_event_bundle | global_event_graph, conversation_graph | event_candidate | promise_or_intent_truth_graph |
| handshake_bundle | physical_event_graph, social_event_graph | event_candidate | trust_truth_graph |
| room_humidity_observation | space_graph | context_update | emotion_truth_graph |
| device_temperature_anomaly | device_graph, task_graph | alert_candidate | external_control_action |
| experiment_deviation_bundle | experiment_graph, learning_engine | learning_signal | production_truth_without_validation |
| conflict_record | world_model_diagnostics, learning_engine | diagnostic | forced_single_fact |

## 冲突处理

冲突不是异常垃圾，而是世界模型更新的重要证据。

建议结构：

```json
{
  "conflict_id": "conflict_audio_visual_001",
  "schema_version": "sensor_conflict.v1",
  "conflict_type": "source_localization_conflict",
  "observations_in_conflict": [
    "audio_doa_001",
    "visual_lip_sync_001"
  ],
  "hypotheses_affected": [
    "source_match_001",
    "speech_event_20260620_001"
  ],
  "possible_causes": [
    "room_reverberation",
    "offscreen_speaker",
    "incorrect_lip_sync",
    "multiple_speakers"
  ],
  "resolution_policy": "keep_multiple_hypotheses",
  "confidence_effect": {
    "source_match_001": -0.24
  },
  "action": "lower_confidence_and_request_more_evidence",
  "status": "open"
}
```

建议状态：

- `open`：冲突存在，尚未解决。
- `multi_hypothesis`：保留多个候选。
- `downgraded`：降低某个假设置信度。
- `resolved`：后续证据已解释冲突。
- `invalidated`：某观测被判定不可用。
- `needs_human_review`：需要人工复核。

解决策略：

- 保留多假设。
- 降低置信度。
- 请求额外观测。
- 检查标定和延迟。
- 检查隐私权限。
- 暂停图谱写入。
- 转交人工确认。

## 潜变量层

系统不能从传感器直接跳到“张三正在表达敌意”这类社会结论。中间必须使用潜变量表达不确定状态。

建议潜变量：

| latent variable | 含义 | 典型来源 |
| --- | --- | --- |
| `latent_entity_id` | 潜在实体 | 视觉人体、雷达目标、LiDAR 轨迹 |
| `latent_body_part_id` | 潜在身体部位 | 手部姿态、触觉接触、温度 |
| `latent_signal_source` | 潜在信源 | 声源、热源、RF 源、震动源 |
| `latent_event_id` | 潜在事件 | 多个观测共同支持的事件候选 |
| `latent_contact_id` | 潜在接触 | 压力、触觉、视觉重合 |
| `latent_object_id` | 潜在物体 | 视觉、LiDAR、RFID |
| `latent_place_state` | 潜在空间状态 | 温湿度、CO2、光照、噪声 |
| `latent_intent_state` | 潜在意图状态 | 只允许作为低置信候选，不能单独行动 |
| `latent_social_meaning` | 潜在社会意义 | 由物理事件、场景和关系上下文共同支持 |

潜变量进入事实图谱前必须满足：

- 足够的观测支持。
- 冲突已处理或被显式保留。
- 置信度达到对应事件阈值。
- 没有触发 blocked inference。
- 图谱写入策略允许。
- 高风险场景已人工确认。

## 物理概念定义库

物理世界定义库用于把“可观测信号”组合成“行为事件”或“环境状态”，但不直接推出心理、忠诚、欺骗等社会结论。

通用结构：

```json
{
  "concept_id": "concept_handshake_v1",
  "concept": "handshake",
  "type": "social_physical_event",
  "necessary_conditions": [],
  "supporting_conditions": [],
  "exclusion_conditions": [],
  "confidence_rule": {},
  "graph_write_policy": {},
  "forbidden_inferences": []
}
```

### 概念：握手

```json
{
  "concept_id": "concept_handshake_v1",
  "concept": "handshake",
  "type": "social_physical_event",
  "necessary_conditions": [
    "two_human_hands_detected",
    "hand_to_hand_contact_detected",
    "contact_duration_ms > 300"
  ],
  "supporting_conditions": [
    "arm_extension_gesture",
    "mutual_body_orientation",
    "greeting_speech",
    "shake_motion_cycles >= 1"
  ],
  "exclusion_conditions": [
    "object_exchange_only",
    "accidental_collision",
    "medical_examination_context",
    "sports_grip_context"
  ],
  "confidence_rule": {
    "necessary_conditions_required": true,
    "supporting_conditions_min_count": 2,
    "minimum_confidence": 0.75
  },
  "graph_write_policy": {
    "physical_event_graph": true,
    "social_event_graph": "event_candidate",
    "relationship_graph": "low_delta_only",
    "emotion_graph": false
  },
  "forbidden_inferences": [
    "do_not_infer_deep_trust",
    "do_not_infer_deception",
    "do_not_infer_romantic_interest",
    "do_not_infer_hostility"
  ]
}
```

### 概念：某人正在说话

```json
{
  "concept_id": "concept_person_speaking_v1",
  "concept": "person_speaking",
  "type": "speech_event",
  "necessary_conditions": [
    "voice_activity_detected",
    "signal_source_localized"
  ],
  "supporting_conditions": [
    "lip_motion_sync",
    "face_identity_match",
    "body_track_at_sound_direction",
    "known_voiceprint_match",
    "meeting_context_supports_speaker"
  ],
  "exclusion_conditions": [
    "speaker_device_detected",
    "audio_playback_detected",
    "strong_echo_detected",
    "multiple_speakers_unresolved"
  ],
  "confidence_rule": {
    "minimum_confidence": 0.8,
    "identity_confidence_minimum": 0.75
  },
  "graph_write_policy": {
    "global_event_graph": true,
    "conversation_graph": true,
    "relationship_graph": "event_reference_only"
  },
  "forbidden_inferences": [
    "do_not_infer_commitment_without_semantic_confirmation",
    "do_not_infer_emotion_from_tone_only"
  ]
}
```

### 概念：环境闷热

```json
{
  "concept_id": "concept_humid_hot_environment_v1",
  "concept": "humid_hot_environment",
  "type": "environment_state",
  "necessary_conditions": [
    "room_temperature_c > 27",
    "room_humidity_relative > 0.65"
  ],
  "supporting_conditions": [
    "CO2_high",
    "low_airflow",
    "users_fanning_or_removing_jacket"
  ],
  "exclusion_conditions": [
    "sensor_calibration_invalid",
    "localized_heat_source_only"
  ],
  "inference_use": [
    "explain_skin_humidity",
    "adjust_comfort_prediction",
    "avoid_overinterpreting_sweat_as_emotion"
  ],
  "graph_write_policy": {
    "space_graph": true,
    "self_state_graph": "context_only",
    "emotion_graph": false
  }
}
```

### 概念：客户兴趣信号

这个概念是当前 B2B 主线的低风险衔接示例。它不是物理传感器直接判断出的事实，而是由会话事件、任务事件和关系上下文共同支持的候选。

```json
{
  "concept_id": "concept_customer_interest_signal_v1",
  "concept": "customer_interest_signal",
  "type": "business_social_signal",
  "necessary_conditions": [
    "identified_customer_or_lead",
    "business_context_confirmed",
    "customer_initiated_or_responded"
  ],
  "supporting_conditions": [
    "asked_specific_requirement_question",
    "requested_price_or_timeline",
    "shared_internal_decision_context",
    "scheduled_next_meeting",
    "reviewed_materials"
  ],
  "exclusion_conditions": [
    "generic_polite_reply_only",
    "identity_confidence_low",
    "sales_pressure_risk_high",
    "legal_or_contract_dispute_active"
  ],
  "confidence_rule": {
    "minimum_confidence": 0.7,
    "supporting_conditions_min_count": 2
  },
  "graph_write_policy": {
    "global_event_graph": true,
    "relationship_graph": "business_interest_delta_candidate",
    "decision_layer": "strategy_input_only"
  },
  "forbidden_inferences": [
    "do_not_infer_deal_will_close",
    "do_not_auto_send_followup",
    "do_not_infer_budget_without_evidence"
  ]
}
```

## 图谱写入与关系更新边界

物理事件不能直接改关系，只能通过事件层间接影响关系。

示例：握手事件的关系更新策略：

```json
{
  "trigger_event": "handshake_event",
  "relationship_update_policy": {
    "closeness_delta": 0.01,
    "trust_delta": 0.00,
    "interaction_count_delta": 1,
    "business_formality_delta": 0.03,
    "risk_delta": 0.00
  },
  "conditions": [
    "event_confidence > 0.75",
    "participants_identity_confidence > 0.8",
    "no_unresolved_conflict"
  ],
  "blocked_updates": [
    "do_not_infer_deep_trust",
    "do_not_infer_romantic_interest",
    "do_not_infer_hostility"
  ]
}
```

示例：客户沟通信号的策略输入：

```json
{
  "trigger_event": "customer_interest_signal",
  "relationship_policy_input": {
    "policy_bucket_candidate": "business_advancement",
    "current_goal_candidate": "advance",
    "priority_delta": 0.12,
    "next_best_action_candidate": "message_draft",
    "human_confirmation_required": true
  },
  "blocked_actions": [
    "auto_send_message",
    "auto_commit_discount",
    "auto_confirm_contract_terms"
  ]
}
```

## 3D 点云投影要求

感知对齐层进入 3D 点云时，必须显示层级和语义状态，不允许把所有点都渲染成同一种事实粒子。

### 点云节点类型

- `sensor_node`：已登记传感器。
- `observation_node`：Observation Atom。
- `latent_node`：潜变量。
- `fusion_node`：Fusion Bundle。
- `conflict_node`：冲突记录。
- `event_hypothesis_node`：事件候选。
- `confirmed_event_node`：已确认事件。
- `concept_definition_node`：物理概念定义。
- `graph_write_policy_node`：图谱写入规则。

### 点云边类型

- `observes`
- `supports`
- `refutes`
- `modulates`
- `calibrates`
- `conflicts_with`
- `derived_from`
- `candidate_for`
- `updates`
- `blocked_by`
- `requires_confirmation`

### 视觉边界

- 事实节点和假设节点必须可区分。
- 冲突节点必须可见，但不能渲染成系统错误。
- 禁止推断应在详情面板显示，避免用户误读。
- 运行态叠加不能改变事实状态。
- 没有 `source_refs` 的观测、假设或策略不能显示为已确认事实。

## 最小可行闭环

不建议先实现所有传感器。建议先形成两个协议闭环。

### 闭环一：声源匹配

输入：

- 麦克风阵列。
- 摄像头或屏幕会议上下文。
- LiDAR / 深度 / 人体位置。
- 人脸 / 声纹 / 日历到访信息。

输出：

- `Observation Atom`：语音活动、声源方向、口型同步、人体轨迹。
- `Fusion Bundle`：某个潜在声源与某个人的匹配。
- `speech_event` 候选。
- 写入全域事件图谱和对话图谱。
- 低风险引用到人际图谱，不直接推断承诺或情绪。

### 闭环二：握手 / 接触

输入：

- 视觉手部姿态。
- 触觉压力。
- 皮肤温度。
- 局部湿度或电导。
- 环境温湿度。
- 场景上下文。

输出：

- `Observation Atom`：接触、压力、持续时间、温度、湿度、环境背景。
- `Fusion Bundle`：握手事件候选。
- 写入物理事件图谱和社会事件图谱。
- 只允许低幅更新互动次数或商务礼仪完成状态。
- 禁止直接推断信任、敌意、欺骗或亲密意图。

## 与当前项目主线的关系

当前第一阶段仍以 B2B 商务沟通和客户跟进为主。

感知对齐层对当前主线的价值是：

- 给客户互动事件增加证据来源。
- 把会议、回复、材料阅读、需求确认等输入统一转成事件。
- 给关系策略层提供可解释证据。
- 给学习引擎提供预测偏差和反馈样本。

当前不做：

- 不接入真实摄像头、麦克风或传感器。
- 不真实采集用户隐私数据。
- 不自动发送消息。
- 不自动控制设备。
- 不直接修改正式 schema 或运行时。

## 后续正式落地顺序

等图谱总进程确认后，建议正式拆单：

1. 定义 `sensor_registry.v1` 草案。
2. 定义 `observation_atom.v1` 草案。
3. 定义 `fusion_bundle.v1` 草案。
4. 定义 `sensor_conflict.v1` 草案。
5. 定义 `coordinate_frame_registry.v1` 草案。
6. 定义 `physical_concept_definition.v1` 草案。
7. 定义五张矩阵的机器可读样例。
8. 定义 `graph_projection.v1` 如何展示观测、假设、冲突和图谱写入策略。

以上正式化必须同步流程树、Obsidian 视图、schema、样例和验证命令；在当前线程需求暂存阶段不执行这些修改。
