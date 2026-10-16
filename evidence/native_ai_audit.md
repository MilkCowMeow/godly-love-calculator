# 014517 自动选技与选目标核查

本文件对应 `dump_014517/dump.cs` 与 `libil2cpp_014517.so`。实现为 `native_ai_rules.js`，安装到 `GLTimeline.Simulation`。没有修改主引擎文件。

## 必须修复的旧行为

- `data.autoAI` 48 行原表使用 `Condition1..3` 与 `TargetSetting1..5`；旧 `choose` 只读 `conditions/targets`，实际规则被静默跳过。新模块安全解析 JSON5 子集并同时兼容两种形态。
- 普通 AI 全失败回首普攻，不能逆序随意选最后一个可用技能。
- Runtime `AI=100` 覆盖卡牌静态 AIs。嘲讽分支另读 `TauntAI=157`，不能把两种字段混为一谈。
- AI 不可在 `One` 目标时先截第一个；Boss、克制等规则要对完整候选列表筛选。
- `FrontRow/BackRow` 是固定 `CampPosition == 0/3` 的单个角色。首位空缺时本规则失败，不拿其他站位递补；旧 `<2` / `>=2` 两人筛选错误。
- 已由 AI 选中的隐匿单体必须保留到执行。旧 `skillTargets` 会再按普通手选条件丢掉 AI 第三轮重试选中的对象。新模块包装单体执行校验与 Front/Back 选择，不更换通用选择器其他分支。

## 原生入口与顺序

|规则|原生地址|
|---|---|
|主处理、嘲讽、指定技能、默认回退|`AIProcessor.ProcessAI 0x221A570`|
|按优先级遍历 AI 组|`AIActionStaticData.GetAIs 0x2218914`、`CreateResultByAISettingList 0x221AE5C`|
|单条 AI：可用技能、条件、三次目标尝试|`AIActionStaticData.CreateAction 0x2218FB4`|
|目标概率及最终最低血比/怪物平值随机|`AITargetSetting.GetTarget 0x221975C`|
|AI 目标 Rate 默认 1.1f|`AITargetSetting..ctor 0x221B480`|
|构造目标参数及友方可见性默认值|`SkillSelectInfo.CreateBySkillParam 0x235C0C0`|
|目标筛选与内部排序|`BattleRoleContainer.GetTargetRolesInContainer 0x230574C`、`SkillSelectInfo.FilterRoleList 0x235C2F0`|
|固定前/后站位|`0x2305CA4/0x2305CBC` → `GetPositionRowRole 0x2305478`；谓词 `0x2308E5C`|
|技能 SP/CD/目标可用性|`BattleSkillContainer.CanUseSkill 0x2346270`|
|一般技能可选对象|`GetAllCampCanTargetRoles 0x2305280`、`SkillData.CanSelect 0x234E10C`|
|运行时 AI 覆盖|`BattleRoleData.get_AIActionList 0x2309668`|
|默认普攻目标分数|lambda `0x221B0AC`，常量 `0xD34D20`|

正常处理为：AI 组按 Priority 降序稳定排序；逐条先按 `SkillIndex` 找技能、检查可用性、检查 AI Conditions；再按 TargetSetting 顺序寻找首个成功目标。敌方技能且施放者可控制时，有效显式 TargetID 在目标规则前可直接使用。

每条规则的目标设置有三轮尝试：

1. 默认：友方 IncludeStealth/IncludeInvincible 都 true；敌方默认都 false，可被设置本身开启。
2. 各设置重新构造参数，只强制 IncludeInvincible=true。
3. 再重新构造参数，只强制 IncludeStealth=true；不沿用第二轮强制的 Invincible。

每次调用目标设置都先抽 `U(0,1)`，超过 Rate 则本设置失败；缺省 Rate=1.1f 仍然消耗一次抽样。AI 上下文构造本身不消耗随机数。

## 目标规则的两层选择

原生首先由 GetTargetRoles 对 Type 执行自身筛选、排序、截取；随后 AITargetSetting 在其结果上按 NowHPRate 升序，取所有等于最低血比的候选。玩家取第一位，Monster 随机取一位（单候选也调用随机）。

因此“怪物最低血比并列随机”不能越过内层筛选：`LessHPRate` 已在内层按血比、CampPosition 截取 1 人；`HightestAtkOne` 按攻击降序、CampPosition 截取 1 人。Boss 或 ConquerOKTarget 规则可保留多人，才可能由最外层随机打破平值。旧摘要中笼统说所有类型都随机，需按此限定。

当前 48 行 AI 涉及的 13 类 Type 均已实现：Boss、ConquerOKTarget、FrontRow、LessHPRate、HaveDeBuffOne、DeadOne、HightestSkillCD、HaveCoolDown、MaxProperty、MostTime、HightestAtkOne、TautSource，以及接口默认 One。

- ConquerOKTarget 先筛施放者克制的对象；无则筛不克制施放者的对象，仍无则本规则失败。
- HaveDeBuffOne 先筛有减益对象，在内层随机取 1 人。
- DeadOne 在内层筛可复活死者并随机取 1 人；可复活判定复用 GLNativeComplex.canRevive。
- MostTime 按行动条降序、当前 HP 升序、原始站位排序，截取 1 人。
- HightestSkillCD 按最大技能 CD 降序、当前 HP 升序截取 1 人（当前 HP 同时相等时保留原始站位顺序）。
- MaxProperty/MinProperty 按指定值降/升序、当前 HP 升序截取 Count（AI 为 1）。未验证属性明确抛 Incomplete。

普通 AI 全失败时，首普攻的目标按以下整数分数升序；同分保留候选列表顺序：

```text
target.NowHP
  - 80000   if actor conquers target
  + 90000   if target conquers actor
  + 900000  if target is Invincible
  + 9000000 if target is Stealth
```

指定技能/固定技能索引追加的特殊 fallback 按最低血比排序。固定追加不会改放其他技能。若技能索引不存在，抛 Incomplete。

## 手动方案接口

`plan.actions[row][slot]` 可写 `auto/basic/ultimate/wait`、明确技能 ID，或 `{mode, skillID, targetID}`。行号为当前表格统计行 `rowIndex`，站位从 0 开始。未填使用 `u.config.mode`。敌人始终自动。

显式技能不属于已解锁技能、被禁用、CD 未结束或无目标时退首普攻。嘲讽按原生在手动模式前处理，会强制对应规则/来源普攻。`wait` 是计算器提供的手动停手动作。

## 安装及验证

在 `simulation_rules` 与 `native_turn_rules` 安装后调用 `GLNativeAI.install(GLTimeline.Simulation)`，状态/复活模块也必须加载。独立模块仅覆写 AI 及两处必需的目标桥。

`node test_native_ai_rules.cjs`：48 行原始 AI 全部完成解析，11 组有效性测试通过，覆盖按行手动方案、CD/沉默回退、Boss 优先、三轮可见性、固定站位、怪物平值随机、运行时 AI、固定索引追加、逐目标条件、隐匿执行桥。

`node research/smoke_native_ai.cjs`：真实 4 张 SSR、3 个统计轮次、14 次原生行动、53 条事件，成功产出 44,073 伤害。此数仅是集成烟雾证据，不作为原生全场景数值对照。

## 与 simulation_rules 的剩余集成观察

- 原技能普通攻击判定已由父代理改为读取 originalSkill 的 IsNormalSkill 标记，符合 `0x2346940`。
- 上下文中的 IsDamageSkill 应始终按原生技能 AttRate>0 判断；若用当前事件实际 damage 判断，闪避/零伤害/持续伤害会错。该条件仍由主上下文模块管理。
- 通用选择器尚未被本模块全量重写；本模块只覆盖当前 AI 13 类与 Front/Back 桥。新的配置 Type、不可验证的属性、负 SP 费用缺少 NowSP 上下文均明确停止，不生成假结果。
