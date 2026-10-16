# 014517 状态、跨回合与效果控制流核查

依据：本目录配对的 `dump_014517/dump.cs` 与 `libil2cpp_014517.so`。全部地址是此版 RVA，不能套用旧 dump。证据输出为 `status_lifecycle.asm`、`status_lifecycle_extra.asm`、`status_functions.asm`、`status_timing.asm`、`status_event_flow.asm`、`status_finalize.asm`、`status_dot_details.asm`、`status_edge_methods.asm`、`status_round_caller.asm`、`status_misc.asm`、`condition_actor_flow.asm`。以下区分已确认事实与尚未闭合部分。

## 1. 状态对象与构造默认值（已确认）

`StatusData`：StaticID +0x10，Value +0x18，UntilRound +0x1C，SourceRoleID +0x20，NowStack +0x28，InSelfStartDisplayRound +0x2C。

`StatusStaticData..ctor` 0x2386060：

- IsBuffType=DeBuff，RoundCount=1。
- IsShowIcon=true、CanUpdateRound=true、CanMerge=true、IsStackMultiplyProp=true。
- IsMergeProperty=false、IsValueMultiplyProp=false、IsReduceBeforeRound=false、IsResident=false，其余布尔零初始化。
- MaxStack 未赋值，默认0。**不可把空 CanMerge/CanUpdateRound 当false。**

`StatusData..ctor` 0x2385928 写入8字节常量：NowStack=1、InSelfStartDisplayRound=-1（常量来自0xD32C08；可复核原始字节）。

状态定义 `RoundCount<0` 才是无限；`UntilRound<0` 并非无限判据。`get_IsUnlimitRound` 0x23841C0。

## 2. 合并不是按同ID，也不是Value累加（已确认）

`BattleStatusContainer.AddStatus` 0x2381B84：先 CanAddStatus（容量限制），再检查**新状态**定义的CanMerge。如果true，找 StatusList 中第一个 `old.StaticData.Group == new.StaticData.Group` 的实例（谓词0x2384108）；找到则 `old.Merge(new)`，否则追加新实例。没有检查来源是否相同，也不是先按StaticID检查。旧状态自身CanMerge不会参与本次判断。

`StatusData.Merge` 0x2381D78：

```text
if old.NowStack + 1 <= old.StaticData.MaxStack:
    old.NowStack += 1
old.Value = max(old.Value, new.Value)             // 不求和
old.UntilRound = max(old.UntilRound, new.UntilRound)
old.SourceRoleID = new.SourceRoleID              // 无论哪份Value更大，来源都被覆盖
if new.StaticData.Level > old.StaticData.Level:
    old.StaticID = new.StaticData.ID
else:
    ids = new.PropertySetting.GetStringList(BuffStackReplace=124)
    if ids非空 && old.NowStack-1 < ids.Count:
        old.StaticID = ids[old.NowStack-1]
```

注意上限取旧定义，升级StaticID发生在层数处理之后；CanUpdateRound在此Merge里完全没有读取，不能据此阻止刷新。达到MaxStack后仍然刷新Value/UntilRound/来源。

`CanAddStatus` 0x2381A00：新状态为空则失败。若新定义IsShowIcon=true，当已显示状态数量达到`PublicVariables.BattleRoleMaxStatusCount`则失败；这是**合并检查之前**的门槛。隐藏状态不受该显示数量门槛。死亡、封印、免疫另见施加流程，不能用这个重载取代全部限制。

`StatusData.IsSame` 0x2383E78 用于ContainStatus(StatusData)，比较 StaticID、UntilRound、Value、SourceRoleID，不比较NowStack。

## 3. 施加值与持续时间（已确认）

`SkillFunctionInfo.AddStatusToRole` 0x235775C：

1. 新定义是DeBuff时先走效果抵抗；Buff/None不走这条抵抗分支。
2. `CreateStatus(target,id,useFunRole.ID)`，并经过目标封强化/封弱化/具体免疫等CanAddStatus重载。`AbsoluteRemoveBuff`字段也会在此允许跳过部分施加门槛，名称不能替代实际控制流。
3. 实例Value：有`StatusValue`转换器就取其值，否则取此功能的`GetValue`。**即使静态Status.Value有值，此路径也会覆盖它。**
4. 容量门槛通过后，

```text
duration = function.StatusRound >= 1 ? function.StatusRound : statusDef.RoundCount
new.UntilRound = target.NowRound + duration
if target.IsBeforeSkillState && !def.IsReduceBeforeRound:
    new.UntilRound -= 1
if !target.IsBeforeSkillState && target.NowRound != target.DisplayRound:
    new.InSelfStartDisplayRound = target.DisplayRound
```

`IsBeforeSkillState` 0x2309514只在RoundSkillState=BeforeRound(1)或BeforeSkill(2)时为true，**Skilling(3)已为false**。

`CreateStatus` 0x23857F8 的一般初始化先设置Value=静态Value、UntilRound=GetRoundBase(target)+def.RoundCount，后被上述功能路径改写。手工创建的初始化状态与技能施加不能混成同一简化规则。

`GetRoundBase` 0x238593C：IsReduceBeforeRound=true读目标NowRound(+0x44)，false读DisplayRound(+0x48)。UI `GetRound` 0x237F5B0：无限返回-1，否则max(0,UntilRound-base)。

## 4. 一次角色行动的状态时序（已确认）

本游戏不是全队一起rounds--，NowRound/DisplayRound属于各自角色。

`BattleData.ProcessNowRoleBeforeRound` 0x223D9E8：先处理主回合开始及全场AnyOneBeforeRound相关，接着当前行动者：

1. `BattleRoleData.ProcessBeforeRound` 0x230A98C：先触发BeforeRound(2)，再NowRound++、RoundSkillState=BeforeRound，发状态同步事件。
2. `StatusContainer.ProcessRoundBuffAction` 0x2381330：对当前StatusList浅复制，逐个执行该状态的BuffRound(13)；再对当时StatusList另取浅复制，逐个执行AfterBuffRound(38)。**顺序是所有状态第一类完成后才第二类，不是逐状态两种连做。**
3. 取得到期状态，过滤`IsReduceBeforeRound=true`，发删除事件。到期定义：`!IsUnlimitRound && role.NowRound >= status.UntilRound`（GetAllNoRoundStatus谓词0x2384170）。先触发再到期删除，因此持续伤害可在最后一次开始结算。
4. 处理追加伤害、死亡、复活等，再进入行动。

主行动结束时`BattleRoleData.ProcessAfterRound` 0x230BEBC：DisplayRound++、RoundSkillState=None；技能冷却OnAfterRoleRound；发同步事件；触发当前技能/角色AfterRound(3)。随后全场其他人的回合后触发及追加/死亡/复活处理，最后`ProcessStatusAfterRound`→`StatusContainer.ProcessAfterRoleRound` 0x23820D0删所有到期状态。死亡角色改为清理非DeadResident状态。

所以“添加当回合是否减”取决于施加阶段、目标自己的计数与IsReduceBeforeRound，不可统一回答当回合减/不减。普通2回合Buff在目标自己的BeforeRound/BeforeSkill被施加时会UntilRound-1；常见DOT显式IsReduceBeforeRound=true，不走这个-1。

## 5. 毒、灼燃、血绽、持续回复（已确认）

本轮原表四者都显式`CanMerge=FALSE`，所以重复施加并存多个独立实例，逐份触发，而非一条实例乘层数。

|状态|当前原始功能|实际结算|
|---|---|---|
|Poison 中毒|BuffRound→AddHP，ValueConvert={Rate:-0.05,Property:MaxHP}|持有者最大HP的5%负生命变化|
|ContinuousHeal 续愈|BuffRound→AddHP，Rate:+0.06,MaxHP|持有者最大HP的6%正生命变化|
|Burn 灼燃|BuffRound→BuffAttack|以施加时存入的Status.Value为基础伤害，经直接伤害防御流程|
|Bleed 血绽|BuffRound→BuffAttack|同灼燃（取实例Value，不重新读来源攻击）|
|Hypertoxic 蚀毒|BuffRound→AddHPWithInjury，Rate:-0.1,MaxHP|10%负生命变化，额外按实际损血产生伤势|

为什么MaxHP读取持有者：CreateStatusParam 0x235AC04把UseFunRole设为状态持有者；转换器Who默认Source=UseFunRole。这里不是原状态施加者的最大HP。

### AddHP路径

`AddHPToRole` 0x2351930：先GetValue，再**向零截断为整数**写HitInfo.HPDiffValue；正值且target.Ability.IsSealHeal(SealHeal=102)为true则整个功能返回false。负值标成HP变动型事件。它没有调用CalculateSkillDamage/CalculateDirectHit，也没有通用防御、克制、暴击、格挡、闪避、伤害倍率、SourceDamageRate、HurtReduction乘区。

`CantAddToDie=true`且负值会致死时，把数值改为`1-target.NowHP`。`AddHPWithInjury`且负值会标记伤势回写。最终通过事件BeforeEvent/SourceBeforeEvent等，因此可有明确配置的事件改写/触发，但**不存在在AddHP方法里隐式叠上的通用治疗加成**。要改变治疗必须来自GetValue转换器或相应事件功能。当前EProperty没有通用HealRate类枚举，不应编造一个。

`BattleRoleData.AddHP` 0x2309BC4最终把HP截在[0,AbilityData.MaxHP]；正治疗的实际回复随后改写为新旧HP差，溢出治疗不算实际回复。伤势会改变有效上限（完整伤势算法沿用另份审计）。

### Burn/Bleed的BuffAttack路径

`BuffAttack` 0x2353E80→`ProcessStatusHit` 0x22FE60C→`CalculateDirectHit` 0x22FE930。

```text
param.DirectDamageValue = status.Value           // 无乘NowStack
base = status.Value * PublicVariables.AttackPowerRate
if param.SkillData != null && param.UseFunRole != null:
    base *= GetBuffAttackRate(...)               // 1 + sum(BuffAttackRate转换器)
denom = 1 + Defence * GetDefenceRate(null,ctx,targetFunctions) * 0.3
                / PublicVariables.BattleAttackDefenceConstant
event.HPDiffValue = -(base / denom)
ProcessHurtReduction(ctx,event,targetFunctions,param,source=null)
target.ProcessEvent(... sourceRole=null, param=null)
```

**0.3系数已核验CalculateDirectHit的常量0xD3414C，原始字节9A 99 99 3E，float32为0.30000001192092896。**

常规状态触发的CreateStatusParam没有SkillData，因此上式BuffAttackRate条件分支通常不进入。不要把攻击者的所有主动技能增伤套在DOT上。此路径不调用CalculateHitType，不暴击/格挡/闪避，不用普攻主动倍率/普通DamageRate/SourceDamageRate，也没有主动技能穿透链；确实调用目标的HurtReduction（可含负值易伤）。最后继续过Invincible/护罩等事件阶段；NoDamage的常规受击开关有事件类型过滤，不能随意扩大（参照hit_defence_audit）。未发现本函数的独立DOT上限或主动GetMaxSkillDamage调用。

## 6. 功能成功、Continue与SubFuns的控制流（已确认）

`ProcessFunc` 0x2350168与目标闭包0x2359C64必须区分两层：

```text
ProcessFunc:
  if 功能自身CD / 来源死亡不允许 / 外层PreCond失败: return
  isRateTrigger=false
  for selectedTarget:
    if targetScope失败 / Condition失败 / IgnoreFunction命中: skip
    for Count+AddCount:
      if 随机未过GetRate: continue
      isRateTrigger=true                        // 主函数执行前就置true
      ok=ProcessFuncToRole(targetParam)
      if ok:
         ContinueFun.ProcessFunc(targetParam)
         each ContinueFuns.ProcessFunc(targetParam)
  if !isRateTrigger:return
  SetFunCD()
  each SubFuns.ProcessFunc(原始inFunctionParam)   // 全目标处理后，原始参数
```

因此：**主函数返回false也可执行SubFuns**（只要至少一目标通过Condition与Rate并尝试了主函数）；不会执行ContinueFun/ContinueFuns。若条件不成立、没有目标、全未过概率、CD拦截，则SubFuns不执行。SubFuns不是每个目标一次，也不自动沿用某个选定目标；Continue类才用目标参数。

ProcessFuncToRole特殊分支还有“忽略子方法返回值，统一返回true”：AddRound(41)、SetTime(20)、AddSoul(26)、MarkRoles(34)、ClearMarkRoles(35)等以0x23514E8统一返回1。**AddTime(2)、AddSkillCoolDown(18)、RemoveBuf/RemoveDeBuf直接保留子方法的bool结果。**

原生字段只有`SubFuns`列表，没有`SubFun`单数。原始配置中若写SubFun，除非JSON框架另有别名扩展证据，不可假设它等价。

## 7. AddTime / AddRound / 冷却（已确认）

### AddTime 0x2352724

不同阵营先效果抵抗。v=GetValue：

- v<0：查AntiReduceTime(52)；再乘`1-sum(target functions.ReduceTimeRate)`。
- v>=0：查AntiAddTime(140)；乘`1+target.AddTimeRate(141)`、再乘`1+sum(target functions.AddTimeRate)`。target.AntiNegativeAddTime(195)为true时，两个加成分量各自为负则分别忽略。
- 拦截返回false；否则发TimeDiff事件、返回true。

事件回写：`NowTimeLength=max(0,NowTimeLength+TimeDiff)`，**正值推进、负值延后**。由0x2307BDC GetLeftTimeToEnd证实`left=(1-NowTimeLength)/speed`，进度>1时返回负剩余时间用于排序。状态原始属性AddTime#值走0x2381F00立即执行RoleTimeInfo.AddTime，不是每回合持续重复。

### AddRound 0x2356904

只是发`EventFun=AddRound`事件。`BattleRoleData.ProcessEvent` 0x230AF08识别41并把目标ID加入`BattleActionResult.AdditionRoundRoleList`，不读功能Value决定额外次数。调度消费列表的去重与插入顺序在本文件未闭合；不能按Value=N自行给N回合。ProcessFuncToRole强制成功，所以Continue可继续。

### AddSkillCoolDown 0x23533CC

v=trunc(GetValue)。v>0查AntiAddCoolDown(58)与抵抗；v<0查AntiReduceCoolDown(169)；0不走这两个分支。FID指定技能，FID为空时尝试当前行动技能ID。技能不存在返回false。技能自身PropertySetting也检查相应禁改冷却开关。成功写入SkillCooldownDiffMap并ProcessEvent。

OnAfterRoleRound 0x23473A0是角色自己的行动后冷却推进，而非全队一轮末统一推进。技能初次冷却设置、冷却到期比较由行动时序审计统一实现。

### AddAllBuffRound / AddAllDeBuffRound 0x2353F08

筛选对应Buff/DeBuff类型且定义CanUpdateRound=true的实例（0x2358ED0），再排除IgnFIDs中的StaticID；若提供FIDs则仅保留其中StaticID。每份选中状态的UntilRound加trunc(GetValue)（0x235900C），不是新建状态，不增加层数；更新后可把已到期状态加入删除事件。对敌方施放先效果抵抗，传入isIgnoreImmune的值等于是否Buff路径。**CanUpdateRound限制的是此类延长/缩短功能，Merge本身不读这个标志。**

## 8. 净化/驱散（已确认）

`RemoveStatuses` 0x2351D30：

- RemoveBuf筛选IsBuffType=Buff；RemoveDeBuf筛选DeBuff；None不算两者。
- 普通常驻IsResident状态不可移除；AbsoluteRemoveBuff=true允许（CanRemoveStatus 0x2357C44）。
- 没有候选返回false。
- 驱散Buff另外走IsTargetEffectResist(... isIgnoreImmune=true)；净化DeBuff不走这一步。
- `RemoveBuffs` 0x2357C90：n=trunc(GetValue)，n=-1表示全部；取候选列表的前n个（LINQ Take），不随机；创建RemoveStatusEvent，完成后以事件RemoveStatusList.Count>0返回true。
- 去除的是整个StatusData实例，不是减一层；同一DOT多份实例按列表数量算。

## 9. Who、阵营与技能条件的精确主体（新增重点，已确认）

`GetWhoTargetList` 0x2347BB4，若有TargetInfo选择器先走选择器覆盖Who。无选择器跳表0xD77642：

|Who|真实对象|
|---|---|
|Source(默认1)|param.UseFunRole（效果持有者）|
|Target(0)|param.Target（此次功能选中的目标）|
|SelectTarget(2)|context.NowSelectTargetRole（当前行动选择目标）|
|TriggerSource(3)|param.TriggerSource|
|AuraSource(4)|param.AuraSource|
|TargetSetting(5)|此分支回UseFunRole（配置选择器另行优先）|
|TriggerTarget(6)|param.TriggerTarget|
|SkillDirectTargets(7)|context.NowSkillEvent.TargetRoleIDList对应角色|

`CreateRoleParam` 0x234DA30设UseFunRole=inUseFunRole、TriggerSource=inTriggerRole，其余目标字段不自动填满。`ProcessBeforeEvent` 0x230C0EC在目标上创建BeforeEvent(20)角色参数，owner为受击者，TriggerSource为攻击者，RoleEvent为当前命中；随后功能目标选择器才设置param.Target。

### IsSameCamp / IsDiffCamp

分支0x234957C / 0x23495A4比较**条件选中的角色(theConditionTarget)**和**param.UseFunRole**的Camp。并非简单比较ctx.source和ctx.target。

例如Boss受击被动条件`{Who:TriggerSource,CheckFun:IsDiffCamp}`→攻击者与Boss异营。默认Who=Source且没有TargetInfo时会owner对owner，IsDiffCamp自然false，不能为文案“合理化”而改原生配置。

### IsNormalSkill

19号分支0x2348C1C完全不使用theConditionTarget。取当前`context.NowSkillEvent.Action.SourceRoleID`在RoleContainer中找当前行动者，调用其BattleSkillContainer.IsNormalSkill(role,currentSkillEvent) 0x2346940。该方法选Action.ReplaceSkill优先、否则Action.SkillData，与行动者GetNormalSkill比StaticID，或技能IsDirectSetNormal开关为真。不是只看ID以S1结尾，也不是看效果持有者自己的技能；Who不会改此检查。

### IsDamageSkill / IsNoDamageSkill

11号分支0x2348DF0、10号分支0x2348C44：优先`param.RoleEvent.IsDamageHit`，没有事件则`context.IsDamageHit`；不看Who、不是单独判断面板AttRate>0。上下文getter的具体损伤定义可以沿用原生HitInfo.HitTypeSet。IsNoDamageSkill是上述反值。

### TargetIsAll / TargetIsOne

18号分支0x23495E4读取当前Action.SkillStaticData.TargetType==All(2)；17号分支最后0x23498B8读取NowSkillEvent的TargetType标记==One(0)。也是当前行动信息，与Who无关。

## 10. 尚未闭合、实现时必须明确保留的部分

- 完整伤害/盾/免伤/伤势事件链沿用hit_defence_audit，本文不重复宣称覆盖了所有死亡/复活连锁。
- AdditionRoundRoleList消费后的队列插入、去重及多次额外回合，本文只确认入列。
- `SubFun`单数字段是否有自定义反序列化别名：未发现原生字段，不能自动兼容。
- 需要float32逐步运算；AddHP的初始trunc与最后事件Convert.ToInt32(float)（银行家取整）是两层，不能全局一律Math.round。
- 表内配置异常应展示原始规则，不从技能描述推测修复。

## 11. 状态新增/移除的非伤害事件桥（补核验与代码落实）

`CreateAddStatusEvent` 0x2242850 设置 EventFun=AddStatus(1)、HitType=Buff(7)、damageHit=false；`CreateRemoveStatusEvent` 0x2241A84 设置HitType=RemoveBuff(8)，EventFun根据**第一份被移除状态**选择：Buff→RemoveBuf(5)，其他→RemoveDeBuf(4)。指定ID移除也不把EventFun设为RemoveBufsByID。

存活角色的回合到期移除使用CreateNoHitEvent，EventFun=No(0)、HitType=NoHit(9)，由target自己作为sourceRole。死亡角色的ProcessAfterRoleRound则直接调用容器RemoveStatus，不创建独立事件。受击/伤害/盾耗尽造成的状态解除是当前伤害事件的RemoveStatusList，不能再人为创建一份独立RemoveBuff事件重复触发。

`ProcessEvent` 顺序已核对：target.BeforeEvent（0x230AD18）→source.ProcessSourceBeforeEvent→生命及状态回写→target.AfterEvent（0x230B4C0）→source.ProcessSourceAfterEvent（0x230B4D8）。但是，两个source方法最终分别尾调StatusContainer的0x23830F8与0x23830FC，**两个方法实际都只有ret**，不会运行SourceBeforeEvent/SourceAfterEvent配置。

当前583技能与97状态配置递归扫描：BeforeEvent15项、AfterEvent1项、SourceBeforeEvent/SourceAfterEvent均0项。唯一AfterEvent是C02_R_002S3，条件包含IsDamageSkill，状态新增/移除的damage:false会阻止它触发；BeforeEvent多数为减伤，另有零HP差不产生伤害的SplitDamage，以及Brand中只在正HP差>1才改写的AddEventHPDiff。完整清单保存status_mutation_coverage.json。

`native_status_rules.js` 已落实普通AddStatus、净化驱散和存活到期移除的target事件桥，并保留source no-op调用位置。addStatusClone仍为纯容器helper：TransferStatus原生把多个clone合在一份NoHit事件，批量桥由native_complex_rules负责。若未来注入配置使本来0 HP差的状态事件改成非零，会明确Incomplete，避免跳过生命、保命和死亡桥而产生伪造统计。

## 12. 默认One目标与持续伤害选择（原生实证）

证据文件：`status_default_targets.asm`、`status_target_selection.asm`、`status_process_selector.asm`、`status_buff_action_context.asm`。

`SkillFunctionInfo..ctor` 0x23584E0 把TargetCamp设为Enemy(2)，Target字段未赋值，故为One(0)。`GetSelectInfo` 0x234F964 若没有显式SelectInfo，就将这两个默认值复制到新建选择器；这不代表每次都要按Enemy重新筛选目标。

`GetTargetRolesInContainer` 0x230574C 的默认One分支：0x2305AD0读取Target，减1后以无符号比较跳表范围，One(0)直接进入0x2306264，继而0x23064F4调用IsSelectOne。其实际逻辑为：

```js
if (selectInfo.IsSelectOne) {
  const current = context.NowSelectTargetRole;
  if (selectInfo.TargetCamp === My &&
      (current == null || current.Camp !== param.UseFunRole.Camp)) {
    return [param.UseFunRole];
  }
  return [current];
}
```

具体指令：0x230650C..653C只在TargetCamp==1(My)时比较当前选择角色与UseFunRole的Camp，缺目标或不同Camp则走0x23062A4返回UseFunRole；否则0x2306540..6570把context(+0x20)=NowSelectTargetRole加入单元素列表，0x2306698直接返回。此路径**不调用FilterRoleList，不按Enemy/My重筛，不应用NoSelf或存活列表过滤**。外层`GetTargetRoles` 0x2305570仅滤null；若结果空且有Backup，才尝试备用选择器。目标后续能否执行函数仍由条件/函数自身判定。

`OneWithDead(7)`另有专用分支0x23062D4，直接读`param.Target(+0x48)`加入列表，也不重新按阵营筛选。它与One所读对象不同，不能以一个“传入默认目标”字段混同。

持续状态作用于持有者的完整证据链：`SkillFunctionParam.ProcessSkillFunction` 0x235B088..B0B4以UseFunRole.ID和Status调用`BattleAction.CreateBuffAction`(0x223A99C)，并StartNewSkillEvent。CreateBuffAction在0x223A9EC..A9F8把持有者ID写入action.TargetRole(+0x18)；`SkillProcessContext.StartNewSkillEvent` 0x22631D0..31EC按action.TargetRole查找角色并写入context.NowSelectTargetRole(+0x20)。所以Burn/Bleed的`{Trigger:BuffRound,Fun:BuffAttack}`虽然不写Target/Camp，默认One仍选择状态持有者，不会选择敌人。

实现应将当前事件选择对象与param.Target区分：One取当前选择对象（在普通行动通常是action.selected；状态新建BuffAction时为持有者），OneWithDead取param.Target。不能把未写Target理解为固定Self，也不能把默认Enemy套入一般候选池筛选。
