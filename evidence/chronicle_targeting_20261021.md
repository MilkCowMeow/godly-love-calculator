# 纪事双目标选取的原生核验

日期：2026-10-21。配置来源为 1.0.1.014774 原始 tables；配对原生行为来源为现有 1.0.1.014517 的 libil2cpp.so 和 dump.cs。

## 新关卡闭包

《共奏心音》纪事为 `BranchC02_SSR_006`，最终关卡为 `C02_SSR_006_14`（S14，80级）。该关单波首领 `MB004_1_C02_SSR_006`，本地化名“红莲金翅鸟”。原始怪物的基表为 `AcStory_Boss`，技能为本怪物的 S1、S2、S3 和 `Ac_AttackStack`。

80级面板：生命30906、攻击3828、防御9440、速度3360、暴击率15%、暴击伤害130%、效果抵抗10%、协战率0%。数值按基表 double 乘角色 float32 系数，最终属性读取转 float32，再按属性执行截断或舍入。

- S1 `MB004_1_C02_SSR_006S1`：`TargetType=RandomTwo`，倍率0.6，威力1，冷却1；向 RandomTwo 施加2回合血绽，快照值为自身攻击的15%。
- S2：全体攻击倍率0.4，冷却3，初始冷却开启；全体静眠1回合，自身速度提升2回合。
- S3：回合结束向 RandomOne 施加1回合攻击下降。
- `Ac_AttackStack`：自身回合开始叠加攻击，每层5%，静态无限回合。
- 怪物免疫原串：`AntiSilence~AntiStun~AntiTaunt~AntiTargetTaunt~AntiSleep~AntiPoison`。
- AI：`M_S1Att_S2Att`，包含 FrontRow/Rate0.6、ConquerOKTarget、LessHPRate 的原始规则。

关卡的纪事入场加成由另一个专项核验负责，保留场景 `RoleStatusInfo1` 原始配置。

## RandomTwo 原生路径

1. `ProcessRoleSkill 0x230C730` 在 `0x230C8EC` 读取技能选择设置，在 `0x230C918` 取得直接目标，随后才运行 `ProcessBeforeSkill 0x230B9BC`。
2. `GetTargetRolesInContainer 0x230574C` 的 switch 使用 `ETargetType-1` 索引表 `0xD77086`。`RandomTwo=1` 对应 `0x2305B30`。
3. `0x2305B48` 从 `context.NowSkillEvent.Action.TargetID` 读取主目标。`BattleAction.TargetID` 偏移0x18，`RandomTargetList` 偏移0x20。
4. `0x2305B70..0x2305BA0` 检查副目标缓存；已有缓存时取首个ID，通过 `GetRoleByID` 还原目标，返回主目标和缓存副目标。该路径没有再次筛选死亡或可见性，也没有重新抽样。
5. 缓存为空时，`0x230633C` 取得过滤候选，`0x2306358` 移除主目标。候选按原始站位排序。候选非空时，`0x230638C` 仅抽一次 `RandomInt(0,count,false)`，`0x23063D4..0x2306418` 将副目标ID写入当前原生 Action 的 `RandomTargetList`。
6. 首次新抽样路径在 `0x2306AB0..0x2306C2C` 构建两人列表并按站位排序。原生位置比较函数 `0x2307F34` 直接相减 `BattleRoleData.CampPosition`（0x20）。
7. 缓存命中路径 `0x2306438..0x2306698` 返回主目标、副目标的顺序。零个副候选时返回主目标，且不抽随机数。

这使同动作的 RandomTwo 技能伤害、状态施加、条件检查关联同一主副目标。死亡缓存目标仍可参与后续条件，例如《惊喜绽放》的击杀判定。

## 可见性与条件

`SkillSelectInfo..ctor 0x235C2D0` 将 IncludeStealth/IncludeInvincible（0x22/0x23）都初始化为 true，IncludeHideOut 维持 false。`SkillStaticData.get_SelectInfo 0x234D74C` 和 `SkillFunctionInfo.GetSelectInfo 0x234F964` 的默认构造保留同样值。

首次副目标选择遵循阵营、NoSelf、HideOut、显式的潜影/无敌可见性、RemoveWillPassRound 和目标 Condition。直接目标经过技能执行的有效性检查；后续读取已缓存主副目标时保留死亡、潜影等变化。

## 本轮实现

仅修改 `src/calculator/native_ai_rules.js`：

- 在实际 skillTargets 阶段为当前动作预置共享对象 `_nativeRandomTargets`；trigger/execute 的浅拷贝保留同一对象。
- `RandomTwo` 首次保留 AI/手选主目标，抽取并缓存一个副目标。后续 RandomTwo 效果复用缓存。
- 直接目标初始化位于 `simulation_rules.skillAction` 的 BeforeSkill 阶段之前。更早的 ReplaceSkill 函数直接使用主 action。新增完整 BeforeSkill 被动测试锁定该时序。
- `nativeAIChoice` 对 RandomTwo 延后生成副目标，避免 AI 预览与实际出手分别抽样。该返回值的 `targets` 为待解析空列表，实际出手使用 `selected` 和 skillTargets。
- 普通单体和全体选择保持原分支。

## 既有玩家卡影响范围

当前官方卡共有6张、7条技能引用 RandomTwo：

| 卡 | 引用 |
| --- | --- |
| C02_SSR_008 惊喜绽放 | S1、S4 |
| C03_SSR_006 热汗缠绵 | S1 |
| C04_SSR_009 潜波梦逅 | S1 |
| C04_SSR_014 炽空奇景 | S1 |
| C02_SR_005 岁月书 | S2 |
| C02_R_110 缠吻窥情：塞恩 | S2 |

以上卡及其出现在敌方阵容中的实例会按新核实的原生选目标和随机数消费结算，历史结果可能变化。其他单体/全体阵容由既有回归保护。

## 测试

`tests/test_native_random_two.cjs`：9组通过，覆盖真实纪事Boss攻击/血绽同目标、玩家旧卡状态/行动值同目标、主目标选择和抽样次数、首次/缓存顺序、浅拷贝、BeforeSkill、缓存死亡目标、潜影/无敌、空副目标和普通单体/全体。

测试使用红璇队员隔离防御克制造成的闪避。蓝澈队员面对红璇首领时，固定低随机值会落入防御克制的闪避分支，并使普通附加弱化被 IgnoreDodge 门槛阻止；该现象已在测试夹具设计中明确处理。

本轮没有进行模拟器实战。原生证据与离线回归组成该补丁的核验范围。
