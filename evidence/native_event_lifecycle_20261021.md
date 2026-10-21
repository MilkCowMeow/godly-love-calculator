# 计算器事件与持续回合专项复核

日期：2026-10-21。审计对象：当前 192 张卡、586 条技能配置、97 状态，原生依据为 1.0.1.014517 的 libil2cpp 和 dump。当前新包与旧原生代码的运行期行为仍以已取得原生二进制为边界。

## 已修复

### 1. 缩短持续回合后及时删除已到期状态

原实现修改实例 until 后直接 refresh，短持续的弱化/强化会继续存在至下一次回合清理，可能让已经到期的封愈、晕眩、减攻继续参与计算。

原生 AddAllBuffRound 0x2353F08 及共用的弱化分支：

- 0x2354250：逐项修改实例 UntilRound。
- 0x235427C：创建该功能的 NoHit 事件。
- 0x23542C0：GetAllLessRoundStatus，筛出本次选中的到期实例。
- 0x2354398：ProcessEvent，在 BeforeEvent 后移除，在 AfterEvent 前完成刷新。
- 到期谓词 0x23841E0：DisplayRound >= UntilRound。
- 无限回合谓词 0x23841C0：读取静态 RoundCount 的符号位。静态无限回合保留；普通状态的 until 缩为负值时正常到期。
- 0x2358ED0：按 Buff/DeBuff 类型和 CanUpdateRound 过滤；另保留 FIDs/IgnFIDs 过滤。

真实配置覆盖如下：

| 技能 | 功能 | 修改 |
| --- | --- | --- |
| C02_SSR_001S2 | AddAllBuffRound | 强化 +1 |
| C03_SSR_014S2 | AddAllDeBuffRound | 弱化 -2 |
| C04_SSR_011S3 | AddAllDeBuffRound | 弱化 +1 |
| C01_SR_010S2 | AddAllDeBuffRound | 弱化 -2 |
| C01_SR_010S3 | AddAllBuffRound | 强化 -1 |
| C02_R_101S3 | AddAllBuffRound | 强化 +1 |
| C02_R_102S2 | AddAllBuffRound | 强化 -1 |

新增回归覆盖短于缩短量、恰好等于缩短量、长于缩短量、静态无限、CanUpdateRound=false。两项净化技能另核实封愈和晕眩属性在同一技能后续函数前清除，后续明确治疗能够立即恢复生命。

### 2. NoHit 技能的零伤害事件链

原生 ProcessSkillHit 0x22FF150 的 NoHit 路径仍在 0x22FF2B4 调用 ProcessEvent 0x230AA34。ProcessRoleSkill 的直接目标回调 0x230EA44 在该目标处理后执行 0x230EC10 的 AnyOneAfterSkillHit 23。

已为当前全部 52 项 NoHit 主动技能逐目标补齐：

1. target BeforeEvent。
2. source ProcessSourceBeforeEvent 入口。
3. 零生命差回写与状态刷新。
4. target AfterEvent。
5. source ProcessSourceAfterEvent 入口。
6. 全场 AnyOneAfterSkillHit。

source 两个状态容器入口 0x23830F8 / 0x23830FC 均为 ret，按其行为保留空操作。普通伤害路径原先直接执行 SourceBeforeEvent 配置，本轮也改经同一空操作入口。

当前官方被动中的 AfterEvent 和 AnyOneAfterSkillHit 伤害条件得到保留。测试将 C02_R_002、C02_SSR_011、C04_SSR_007 的真实被动放入各 NoHit 技能配队，逐目标核查生命、行动值、队列与总伤害，均无伤害事件误触发。护盾与 SkillNullifier 也保留。

### 3. 冷却修改的事件时序与技能集合

空 FID 的 AddSkillCoolDown 仍按此前修复回落当前施放技能 ID。

| 技能 | 当前真实结果 |
| --- | --- |
| C03_SSR_014S2 | 仅敌方拥有同名技能 ID 时 +1 |
| C04_SSR_015S2 | 仅所选敌方拥有同名技能 ID 时 +1 |
| C01_SR_008S2 | 同队拥有本技能 ID 的对象 -1，通常只有施放者 |

本轮补齐相应 NoHit 事件：BeforeEvent 读取旧冷却，AfterEvent 读取新冷却；不存在指定 ID 时 AddSkillCoolDown 返回失败。

另发现 AddAllSkillCoolDown 原先对首技能之外的全部技能修改，包含被动。原生 GetAllMainCoolDownSkills 0x234B7A8 明确从索引 1 开始，并筛选 SkillType=Active、静态 IsNormalSkill139=false。本轮据此修复，防止给被动制造冷却并污染 AnyAllyHaveCoolDown 等条件。0x2353888 无论筛选结果是否为空仍执行 ProcessEvent，已覆盖空集合事件。

9 项真实全冷却配置：C01_SSR_005S3、C01_SSR_008S3、C02_SSR_005S2、C03_SSR_002S2、C04_SSR_010S3、C03_SR_001S3、C01_R_102S2、C02_R_001S2、C04_R_007S2。

NoHit 功能事件中的 EventFunValue 按原生功能枚举：AddSkillCoolDown18、AddAllSkillCoolDown21、AddAllBuffRound15、AddAllDeBuffRound16。保留相应冷却差表、被修改状态与被移除状态列表。

## isDamageHit 字段交叉核验

发现上轮证据标注把 0x235E854 的 +0x6C 称为 AttRate。独立读取 dump 显示 AttRate+0x68、Pow+0x6C；独立交叉核查 GetSkillAttRate 0x22FB958 读取 +0x68，CalculateSkillDamage 0x22FF7E8 读取 +0x6C。故原生门槛应为 Enemy 且 Pow!=0，构造默认 Pow=0。

已修改共享 config_engine.js 的谓词及配套合成测试。本轮其他入口统一调用共享谓词。当前 586 条技能中，Enemy 阵营下 AttRate/Pow 的非零性差异为 0，官方卡原有 NoHit 集合仍为 52；合成配置和自定义卡的边界由 Pow 正确区分。

天然协战仍按 Main、Enemy、实际首技能 ID 处理；原生入口没有 Pow 门槛。反击沿用 isDamageHit 门槛。定向回归同步给相关合成技能补足 Pow 字段。

## 原生 schema 过滤的只读复核

loadNativeFunction 已按实际字段所属类解释枚举。现有 test_config_engine 覆盖数字枚举、数字字符串、字段和成员大小写、组合成员按位 OR、非法成员、嵌套非法枚举整条丢弃，以及未知字段整体忽略。

官方全部技能、状态、卡属性、升星、预置强化扫描的非法枚举集合锁定为 6 条：C01_SR_006S3.DynamicField1、C02_SR_007S3.DynamicField1、C02_SSR_013S1.DynamicField2、C02_SSR_013S2.DynamicField3、C04_SSR_013S1.DynamicField2、C04_SSR_013S2.DynamicField3。未知字段不会误按其他类的同名枚举验证；原始 raw/configs 保留。

本轮未修改共享 schema loader。

## 测试及证据文件

新 tests/test_event_lifecycle.cjs 共 8 组，通过。另通过：test_native_skill_hit、test_config_engine（192/586 全配置遍历）、test_native_status_rules（18）、test_native_turn_rules（6）、test_native_complex_rules（19）、test_timeline（288 组混队）、test_trials（300 场跨层）、test_custom_characters。

独立限长反汇编：event_lifecycle_probe.asm。原有证据：research/complex_effects_native_more.asm、research/status_finalize.asm、research/status_lifecycle.asm、native_source_recheck_evidence.asm。

## 明确边界

以上为原生代码证据、官方配置扫描与离线数值/事件回归。当前已有原生实战伤害样本共 15 条；本轮没有操作模拟器进行 192 张卡逐一实战。

当前官方状态及卡的静态字段扫描没有 AntiAddCoolDown/AntiReduceCoolDown；对应动态免疫、额外注入的零生命事件改写非零 HP 等扩展路径仍保留单独核验边界。遇到零生命事件被改成非零差值时引擎明确停止，避免静默入账。
