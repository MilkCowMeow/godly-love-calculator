# 行动调度、回合、冷却与追加技能核查

核查对象：`data_014517` 配置、同版 `dump_014517/dump.cs`、`libil2cpp_014517.so`。下列地址均为 Android ARM64 RVA/VA。反汇编见同目录 `round_schedule_disassembly.asm`，可用 `round_disasm.py` 重建；该脚本也用 `script.json` 补全泛型调用名称。

## 1. 编队、站位与互斥

- 普通 PVE 上限 **4 张卡**。`TeamSetting..cctor` **0x23A5544** 硬编码 `Positions=["0","1","2","3"]`、`IntPositions=[0,1,2,3]`；`PVPInfo..cctor` **0x22E6620** 从 **0xD33788** 读取整数组 `(4,5)`，第一个为 `MaxBattleRoleCount=4`。
- `SceneStaticData.PlayerRoleMaxCount` **0x2336BEC**：GVG 返回 3，其余返回上述 4。
- `TeamData.CheckTeam` **0x23A433C** 先检查同卡、再上限、最后关卡代表角色限制。
- `TeamData.HasSameRole` **0x23A44A0** 对每个 `RoleData.StaticID`（字段偏移 **0x18**）使用 HashSet 去重，**同卡不可重复，同 CP 的不同卡可一起上场**。没有据此禁止同 CP。
- `BattleData.GetIndexByPosition` **0x223C540**、`GetPositionByIndex` **0x223C5A0** 分别减/加 `CampStartPosition`；这是战斗内部站位映射。UI 4 槽仍应采用 TeamSetting 的 0..3。

## 2. 三种不同计数，不可混为固定全队回合

| 计数 | 字段 | 推进时机 |
|---|---|---|
| 全局行动步 | BattleData.NowTurn / NowWaveTurn | 每次 `StartRound`，不论哪边谁行动，各 +1 |
| 每角色内部回合 | BattleRoleData.NowRound | `ProcessBeforeRound` **先处理 BeforeRound 触发，随后 +1** |
| 每角色展示回合 | BattleRoleData.DisplayRound | `ProcessAfterRound` 开头 +1 |

`BattleRoleData..ctor` **0x23035A8** 初始 `NowRound=1`、`DisplayRound=1`；不是从 0 开始。普通角色首个 BeforeRound 触发读到 1，随后首次主技能执行阶段内部 NowRound 已为 2。`RoundSkillState` 的各状态见下一节。

`BattleData.StartRound` **0x223CF34**：NowTurn、NowWaveTurn 同时 +1，清上个 NowRoundRoleID，再选择一个角色，然后重算全体角色能力 `ResetAllRoleDataAbility`。因此游戏调度为连续行动条，而不是全队每人各动一次。

原生存在可选虚拟 `TurnRole`，但 **当前 Trial_50 没有启用**：

- `SceneStaticData.get_TurnRole` **0x2336648** 只读 `PropertySetting[TurnRole=170]`。
- `PropertySetting.GetString(string)` **0x22E0F58** 未命中返回空串，没有默认 TurnRole 回退。
- `BattleRoleContainer.ProcessCreateTurnRole` **0x2302848** 发现为空直接返回。
- 当前全部 685 行 scene 表 `TurnRole` 列为空；Trial_50 三个 DynamicField 也都空，role 表也无 TurnRole 系统角色。
- 若某未来关卡启用虚拟角色，则其像普通角色一样参与行动条；每次被选中只递增自身 NowRound 后重新选择真人。最多循环 200 次防挂死，详 **0x2301E80**。

因此本轮计算器可把“所有存活队员至少各完成一次新的主行动”为**统计轮次**的分界，允许高速队员在同一统计轮次多动。它仅是 UI 分组，不应改变或重置行动条、状态、CD；要把追加技能、Boss 行动、DOT 归到实际发生的统计行，并可展开全局行动步。

## 3. 行动条与速度的精确算法

`BattleRoleTimeInfo.NowTimeLength` 为 0..1 附近的行动进度，允许超过 1。

- `InitTime` **0x2301DF4**：`RandomFloat(0, 0.05f)`。浮点常量 **0xD33F64 = 0.05000000074505806**，即初始随机 0..5% 条。
- `GetLeftTimeToEnd` **0x2307BDC**：若 progress>1，直接 `1-progress`，**此负值不除速度**；否则 `(1-progress)/NotZero(speed)`。
- `Utility.NotZero` **0x21BDF8C**：只在 speed 精确等于 0 时替换为 **1e-4f**，常量 **0xD33CD0 = 0.00009999999747378752**；不夹负速度。
- `ProcessTimePass` **0x23083C4**：`progress = f32(progress + f32(speed*dt))`，没有夹到 1。
- `AddTime` **0x230D790** / 事件应用 **0x230AEEC**：`progress=max(0,progress+delta)`，不夹上限。

核心伪代码（需要 Float32 语义可用 Math.fround）：

```js
function leftTime(role) {
  const p = role.progress;
  if (p > 1) return f32(1 - p);
  const speed = role.ability.speed === 0 ? f32(1e-4) : role.ability.speed;
  return f32(f32(1 - p) / speed);
}
function ordinarySelect(battle) {
  const roles = [...battle.aliveRolesInNativeOrder];
  if (battle.turnRole) roles.push(battle.turnRole);
  // OrderBy，稳定升序；同值保留候选原顺序，不额外随机。
  const sorted = roles.map((role, i) => ({role, i, t:leftTime(role)}))
    .sort((a,b) => a.t - b.t || a.i - b.i);
  const chosen = sorted[0].role, dt = sorted[0].t;
  if (dt > 0) for (const x of sorted)
    x.role.progress = f32(x.role.progress + f32(x.role.ability.speed * dt));
  chosen.progress = 0;
  return chosen;
}
function selectNextRole(battle) {
  while (battle.extraRoundFIFO.length) {
    const id = battle.extraRoundFIFO.shift();
    const r = battle.roles.get(id);
    if (r && !r.dead) return r; // 不推进任何条，也不清 r 原有条。
  }
  for (let guard=0; guard<200; guard++) {
    const r=ordinarySelect(battle);
    if (r!==battle.turnRole) return r;
    r.nowRound++;
  }
  // 原生报错并取首个存活角色作为兜底。
  return battle.aliveRolesInNativeOrder[0] || null;
}
```

地址：普通选择器 **0x2301FC0**；时间选择/取角色 lambda **0x2307B64、0x2307C7C、0x2307C84**；推进 lambda **0x2308394**；额外回合优先器 **0x223D0A4**。

**速度取选择器调用当下的 AbilityData.Speed**。选择阶段没有触发技能，不会在一次 dt 推进中途改变速度。选中后才发生 StartRound 的全体能力重算、BeforeRound、技能与状态事件；这些事件的 `ResetData` 会即时刷新能力，影响**下一次**调度。不能到统计行末才应用速度效果。

## 4. 单个角色一次完整主回合

原生主干 **0x223D9E8、0x223E9E4、0x230A98C、0x230BEBC**：

```text
StartRound: 全局 NowTurn/NowWaveTurn++ → 选角 → 全体重算能力
BeforeRound:
  对所有角色分发 AnyOneBeforeRound(29)
  对当前角色处理 BeforeRound(2)，此时内部 nowRound 尚未++
  当前角色 nowRound++，state=BeforeRound(1)
  当前角色 ProcessRoundBuffAction（DOT等）
  追加伤害 → 死亡 → 复活 → Boss死亡 → 支援
选择主动作：死亡/眩晕/睡眠/隐藏等可跳过（仍走回合结束）
有动作时：
  ProcessRoleSkill(main)
  对其他角色分发 AfterOtherSkill(14)
  按下一节处理至多10批追加技能
  清本次反击去重记录，处理死亡
AfterRound:
  当前角色 displayRound++，state=None
  当前角色所有技能CD减1；<=0移出映射
  同步一次无伤事件
  若本次存在主动作，处理该技能 AfterRound(3)
  对所有角色分发本角色回合结束相关触发
  追加伤害 → 死亡 → 复活
  当前角色状态到期移除/重算
```

一次 `ProcessRoleSkill` **0x230C730**（主动作和追加动作共用）：

```text
StartNewSkillEvent → 按配置替换技能 → 计算目标列表
对目标做施放前处理
state=BeforeSkill(2)
  若 ActionType==Main，用“替换前所选技能”设置CD
  用替换后的技能 SP 值产生 SP 事件
  分发 BeforeSkill(1)、全员 AnyOneBeforeSkill(36)
  检查并预排协战
state=Skilling(3) → 逐目标技能命中/技能函数
state=AfterSkill(4)
  神魂成本/营地资源 → 状态 AfterSkill
  先 PreAfterSkill(34)，再 AfterSkill(0)
  若技能 NoCounter<=0：逐目标检查反击
  逐目标 TargetAfterSkill(17)
  分发队友/敌人 AfterSkill 与 Main 专属的 AfterMainSkill 条件
state=None
```

追加动作也会经过技能触发管线，**不能简单只有一笔额外伤害**。但追加动作本身不新开完整角色回合，不单独增加 NowRound/DisplayRound，也不会单独在结束时减 CD。相对地，`AddRound(41)` 是真正完整额外角色回合，见下节。

## 5. 额外回合、协战、反击、追击队列

### 额外回合 AddRound

`SkillFunctionInfo.AddRound` **0x2356904** 生成事件；`BattleRoleData.ProcessEvent` **0x230AF08..0x230AF88** 检查 `Function==41`，把目标角色 ID 加到 `BattleData.AdditionRoundRoleIDList` 尾部。下次 StartRound 优先 FIFO 取存活角色，**没有推进或清空行动条**，但完整跑 BeforeRound/AfterRound，包含 CD 递减。

### 每批追加动作

`BattleData.ProcessRoleAction` **0x223E9E4** 在主技能及其他角色 AfterOtherSkill 后，对待执行列表最多处理 **10 个批次**：

```js
for (let batch=0; batch<10 && pending.length; batch++) {
  const snapshot=pending.slice(); pending.length=0;
  for (const a of snapshot.filter(a=>a.type===7)) executeAddition(a, false);
  const pinch=snapshot.filter(a=>a.type===2)
    .sort((a,b)=>b.priority-a.priority)[0];
  if (pinch) executeAddition(pinch, false); // 本批最多一个协战！
  for (const a of snapshot.filter(a=>a.type===1)) executeAddition(a, false);
  processDeaths();
  for (const a of snapshot.filter(a=>a.type===3)) executeAddition(a, true);
  // 执行中新加入 pending 的动作等下一批，不插到当前快照中。
}
```

类型为 `Continue=7 → Pinch=2 → Counter=1 → Addition=3`。Pinch 仅取 Priority 最大的一个，其余本批被丢弃，不是全部依次协战。其余类型按插入顺序。`Priority` 构造默认 1（**0x223A698**），技能可另行设置。

`executeAddition` **0x223F47C**：

- 来源不存在、死亡或 WillPassRound 时不执行。
- Counter 检查 `RoleNoCounter=216`；Pinch 检查 `RoleNoPinch=215`。
- 非当前主回合角色的 Addition/Continue 还会检查原生限制状态组（由 `StatusStaticData` 的全局字符串配置提供；未在本核查中推断该组名称）。
- 仅 Addition 传 `canReTarget=true`；已死目标会通过相同技能索引重跑 AI 选活目标。
- 通过这些检查后调用 `ProcessRoleSkill`，故保留通常的被动/事件触发，并通过 IsMain 条件区分主行动。

### 协战

`ProcessPinchSkill` **0x230CE98**：仅主动作、目标阵营为 Enemy、且实际是普攻，技能属性 `NoPinch(81)<1` 才会检查。候选为同阵营其他角色，按原列表顺序调用随机资格 predicate，取第一个合格者。

资格 predicate **0x230E4B4**：禁用函数集中不含 AddPinchSkill(28)，HP>0，非 WillPassRound，`U(0,1)<=PinchRate(19)`。不是把全队协战概率简单相加后再均分。

协战使用其 `PinchSkill(150)` 指定技能，若没有或技能查不到则普攻，见 **0x2346898**。加入待执行队列（**0x22645EC**）。

### 反击

`ProcessCounter` **0x230D430**：仅原动作类型 Main、上下文是伤害命中、原技能目标阵营 Enemy，受击角色 HP>0 且非 WillPassRound；禁用函数集中不含 AddCounterSkill(9)，且本次动作反击列表中尚无此来源角色的 Counter。之后判 `U(0,1)<=CounterRate(20)`，成功入队。

反击去重 predicate **0x230E304** 对 SourceID 与 Counter 类型检查。主技能的 `NoCounter(91)>0` 会跳过反击检查。原生常规反击不能引起反击套反击，因为非 Main 不进入上述入口。

## 6. 主动技能与函数触发冷却

### 主动技能 CD

- `BattleSkillContainer.Init` **0x2345E4C** / lambda **0x23479B8**：遍历技能，仅当 `StaticData.IsInitCoolDown` 真时调用 SetSkillCoolDown。
- `SetSkillCoolDown` **0x2346F88**：技能 CD>=1 且不是普攻，映射 `[SkillID]=skill.CoolDown`。
- `ProcessBeforeUseSkill` **0x2346F50**：只对 ActionType.Main 设置。调用点在 `ProcessBeforeSkill` **0x230B9BC**，早于 SP 与 BeforeSkill 触发；使用替换前的原技能来设置 CD。
- `OnAfterRoleRound` **0x23473A0**：每个映射值 -1（lambda **0x23478C4**），值<=0删除（**0x23476E4**）。包括刚施放的技能，并不跳过本次刚上 CD 的条目。
- 例如 CD=3，无其他加减 CD 时：本次用完立即剩2，下一次自己回合结束剩1，再下一次自己回合结束清除，第三次后续行动可再次使用。不能把使用回合结束前的3直接当作下回合UI的3。
- 被眩晕等跳过主动作时仍走 AfterRound，自己的 CD 仍减1。协战/反击/追加技能不单独减CD。完整 AddRound 则减CD。
- `AddSkillCoolDown` **0x234703C**：原值+delta，<=0删除，>0保存，不夹在技能原 CD 上限。
- `CanUseSkill` **0x2346270**：通常要求可使用技能、负SP费用扣后>=0、CD<=0、存在可选目标；当 AbilityData.CanUseSkill=false 则只能返回普攻匹配（眩晕/睡眠的跳过由更上层 WillPassRound 处理）。

### 函数触发 CD / GCD

函数级 CD 使用 ID 与 **到期计数**，不是每轮给所有函数数值减1：

```js
function setFunCD(role, fun) {
  // 若ID为空却配置正CD或正GCD，原生记配置错误并不设置。
  if (fun.CD > 0) localUntil[fun.ID] = role.nowRound + fun.CD;
  if (fun.GCD >= 0) globalUntil[fun.ID] = battle.nowTurn + fun.GCD;
}
function inFunCD(role, fun) {
  if (fun.CD > 0) return localUntil.has(fun.ID) && role.nowRound < localUntil[fun.ID];
  if (fun.GCD >= 0) return globalUntil.has(fun.ID) && battle.nowTurn < globalUntil[fun.ID];
  return false;
}
```

原生地址：SetFunCD **0x234E49C**、IsInCD **0x234E7F8**。**配置了正 CD 时，查询以角色 CD 分支为准，不再 OR 全局 GCD**。到期比较 `<`，不是 `<=`。若同一个函数的多个触发共享 ID，就共享该映射项；不能按技能列表项单独开计数。

## 7. 控制状态门槛

`AbilityData` 原生定义：

```js
canUseSkill = !(taunt || sleep || silence);       // 0x22FA63C
willPassRound = dizzy || sleep || hideOut;         // 0x22FA678
canControlAction = !(taunt || dizzy || sleep || hideOut); // 0x22FA6AC
```

- 眩晕、睡眠、隐藏使主动作跳过，并禁止协战/反击/追加执行。
- 沉默限制主动技能，允许普攻；沉默本身不会令 WillPassRound=true。
- 嘲讽限制手动选动作/技能，使用普攻，目标还需按原生嘲讽选取逻辑；并不跳过回合。
- `RoleNoPinch/RoleNoCounter` 是动作执行时的额外限制；函数禁止集合（BanFunction=168）也是单独门槛。
- 被动封印 `IsSealPassive` 不应直接当作跳过回合；需要在被动函数集合/函数执行入口施加对应限制，仍保留普通攻击与行动条。

## 可实施边界

此报告确认了调度和上述入口顺序。原生函数的条件、状态到期、特殊禁用状态组、随机抽样、目标重选仍需与已有 `hit_defence_audit.md`、配置函数处理器一起实现；不能据本报告把所有额外技能折成固定百分比。对无行动目标的无限人偶可以作为计算器自定义目标显式禁用其主动行为，但不应宣称这是官方关卡自身机制。

## 8. 动态动作条件 API 对照（补查）

`SkillCondition.CheckSelfCondition` **0x23486A0** 的 CheckFun 跳表在 **0xD7764A**，为57个 uint16 相对偏移，case n目标=`0x2348A6C + table[n-1]*4`。可用 `condition_round_probe.py` 复核。

| 条件 | 真正判断 | 配置字段的影响 |
|---|---|---|
| MainActionType=7 | 当前 `NowSkillEvent.Action.ActionType==Main(0)` | **完全不读 CheckID/Value**；缺省 CheckID 也能正确为 true |
| IsMainRound=22 | 条件 Who 所选角色 `.ID==Battle.RoleContainer.NowRoundRoleID` | 不判断当前动作类型；必须针对条件选中的角色，而非全局统一布尔 |
| IsNotMainRound=21 | 上一行的逻辑非 | 同上 |
| IsNormalSkill=19 | 当前事件来源角色的 `IsNormalSkill(event)` | **不使用条件 Who 角色**；按 Action.SourceID 找真实施放者 |
| IsCounter=26 | 当前动作类型等于1 | CheckID不参与 |
| IsPinch=25 | 当前动作类型等于2 | CheckID不参与 |
| IsAddition=27 | 当前动作类型等于3 **或7(Continue)** | CheckID不参与 |

地址：MainActionType case **0x2348E7C**；IsMainRound **0x2348C80**；IsNotMainRound **0x23496A0**；IsNormalSkill **0x2348C1C**；IsCounter **0x2348CBC**；IsPinch **0x23493D4**；IsAddition **0x2348BCC**。

`SkillCondition..ctor` **0x234AD48** 设置默认 `Who=Source(1)`，所以通常 IsMainRound 检查 UseFunRole；若显式 Who=Target 或 TriggerSource 等，必须按它选角色。

`SkillProcessContext.IsMainActionRoleRound` **0x22645B0** 精确实现：

```js
function isMainRound(conditionRole, ctx) {
  return conditionRole != null && conditionRole.id===ctx.battle.nowRoundRoleId;
}
function mainActionType(ctx) {
  return ctx.nowSkillEvent?.action != null && ctx.nowSkillEvent.action.type===0;
}
```

`BattleSkillContainer.GetNormalSkill` **0x23463F0** 返回 `GetAllSkills(role)[0]`，不是凭 S1 后缀猜测。

条件版 `IsNormalSkill(role,event)` **0x2346940**：

```js
function isNormalSkillEvent(sourceRole, event) {
  const skill = event.action.oldSkill || event.action.skill;
  return skill.id === getAllSkills(sourceRole)[0].id ||
         skill.static.properties.IsNormalSkill === true; // EProperty139
}
```

`IsDirectSetNormal` **0x235E874** 读取 `SkillStaticData.PropertySetting[IsNormalSkill=139]`。替换技能 **0x230CAC8** 会把旧技能写进 `Action.OldSkillData(+0x30)`、新技能写进 `Action.SkillData(+0x28)`，所以普攻替换后仍保留条件版普攻身份。

但必须区分两个重载：

- 条件版 event 重载允许旧技能与139标记。
- `IsNormalSkill(role, SkillData)` **0x2346914** 仅比较传入技能ID与首技能ID；**不读139**。设置主动CD使用这个重载，并以替换前所选技能为输入。
- 自动协战入口 **0x230CF60..0x230CF88** 则自己比较**替换后的技能ID**与首技能ID，不使用条件版、也不读139。因此替换普攻虽然满足 IsNormalSkill 条件，**仍可能失去自动协战入口资格**。
- 协战使用普通首技能时，当前事件的 IsNormalSkill=true；若使用特配 PinchSkill 则看该技能本身是否首技能或139标记。

实际卡例 `C04_SSR_003S1` ReplaceSkill 配置 `Conditions:[{CheckFun:"MainActionType"},{CheckFun:"SkillID",CheckID:"C04_SSR_003S1"},{Property:"BuffCount",Comparer:"Gt",Value:1}]` 中，第一项在正常主动作就成立，不能因为没有 CheckID 错判 false。
