# 014517 命中、克制、减伤与护盾证据审计

本报告只依据配对的 dump_014517/dump.cs 与 libil2cpp_014517.so；未使用旧版小写 asm。新增 hit_defence_targeted.py/.asm 给出盾和舍入等额外反汇编。现有大写 asm 的调用注释正确；同名方法跨类有不同 RVA。

## 1. 属性克制
RoleStaticData.IsConquer，RVA 0x231C5C8：
- Ice(2) 克 Fire(1)，Fire(1) 克 Earth(3)，Earth(3) 克 Ground(5)，Ground(5) 克 Ice(2)。是四属性环。
- Light(4) 与 Dark(0) 相互克制。
- 其余组合均 false。
RoleStaticData.IsLightDarkElement RVA 0x231CDE4，仅元素0或4为 true。

BattleCalculator.IsSkillConquer，0x22FC7F8：
- 攻击者 RoleData.RuntimeData.PropertyMap.GetBool(NoConquer=151) 为true，返回false。
- 否则，源技能事件中任一 Trigger=ForceConquer(27) 的 SkillFunctionInfo.CheckCondition 成功，返回true。
- 否则回落 IsConquer(sourceElement,targetElement)。
BattleCalculator.IsDefenceConquer，0x22FCAEC：
- 防守者 NoConquer 为true，返回false。
- 攻击者满足ForceConquer，返回false。
- 防守者满足 NoDefenceConquer(30)，返回false。
- 否则回落 IsConquer(targetElement,sourceElement)。
GetConquerAttackRate，0x22FC720：先检查IsSkillConquer，则1.1；否则IsDefenceConquer，则1.0；否则1.0。常数来自 card_skills_raw.json PublicVariable。

## 2. 命中类别互斥顺序与精确阈值
CalculateHitType RVA 0x22FCEDC；返回伤害倍率，同时设置HitInfo.HitType。
所有普通抽签使用新的RandomFloat(0,1)，成功判定为 r <= threshold；概率外显可clamp到[0,1]，原生本函数不显式clamp。

伪代码（target为calculator持有角色）：

    if target.runtimeProperty(MustDodge=79) >= 1:
        return Dodge(type=3, multiplier=0.75)
    skillConquer = IsSkillConquer(source,context,event)
    if target.runtimeProperty(NoDodge=82) <= 0 and skill.property(MustHit=77) <= 0:
        dodgeBonus = 0
        if IsDefenceConquer(...) and not target.static.IsLightDarkElement:
            dodgeBonus = ConquerDodgeRate # 0.5
        pDodge = target.RoleRuntimeData.DodgeRate + dodgeBonus - skill.property(HitRate=31)
        if random() <= pDodge:
            return Dodge(type=3, multiplier=0.75)

    if skill.property(MustCritical=78) >= 1:
        return Critical(type=1,multiplier=source.runtimeProperty(CriticalDamageRate=18))
    pCrit = skill.property(CriticalRate=16) + (0.15 if skillConquer else 0) - target.runtimeProperty(DeCriticalRate=17)
    if skill.property(NoCritical=86) >= 1:
        pCrit = -1
    if random() <= pCrit:
        return Critical(type=1,multiplier=skill.property(CriticalDamageRate=18))

    pBig = BigHitRate # 0.25
    if skill.property(MustBigHit=76) >= 1:
        pBig = 100
    elif skill.property(NoBigHit=87) >= 1:
        pBig = -1
    elif skillConquer:
        pBig = ConquerBigHitRate # 0.25, 替换而非相加
    if random() <= pBig:
        return BigHit(type=2,multiplier=1.15)
    return Normal(type=0,multiplier=1)

特殊优先级：MustDodge优先于MustHit/NoDodge；MustCritical优先于NoCritical；MustBigHit优先于NoBigHit。但MustCritical仍会在前序闪避成功时失效，MustBigHit仍会在前序闪避/暴击成功时失效。
期望类别概率：D=d，C=(1-d)c，B=(1-d)(1-c)b，N=(1-d)(1-c)(1-b)。不应把四种类别的裸概率直接相加。
闪避实际是0.75倍伤害，不能解释成零伤或miss。命中类别无共同一轮骰子。

证据地址：
- 0x22FD004..028 MustDodge；0x22FD1A8 设置3并返回DodgeAttackRate。
- 0x22FD060..09C NoDodge / MustHit >0跳过闪避。
- 0x22FD248..294 克制闪避加成及光暗排除。
- 0x22FD2A0..2C4 pDodge及抽签。
- 0x22FD534..680 MustCritical、CritRate-DeCrit、强制暴击来源差异。
- 0x22FD684..6B8 NoCritical阈值置-1。
- 0x22FD958..A70 强击优先级、克制替换。

## 3. 效果命中/抗性
IsEffectResist RVA 0x23000A4：

    effectHit = GetEffectHitRate(source,context,source.GetBattleRoleCombinedFunctions(context))
    resist = target.runtimeProperty(ResistanceRate=24)
    threshold = 1 + effectHit - resist
    if threshold <= 0: return false
    cap = 1 - BuildinResistance # 0.85
    if threshold > cap and not target.runtimePropertyMap.GetBool(IgnoreBuildinResist=179):
        threshold = cap
    return random() <= threshold

尽管方法名为IsEffectResist，本函数实际返回布尔为 random<=上述命中阈值，需由上层调用分支确定UI语义，不能按名字直接显示“抵抗率”。本函数没有乘施加基础概率FRate，若有基础概率，应在上层查证。
GetEffectHitRate RVA 0x22FBA44 从 source.runtimeMap.EffectHitRate(23) 起，累计符合条件的EffectHitRate转换值。它不是直接用技能面板文本的单一数字。
IgnoreBuildinResist在本函数从目标而非源读取，值得实现时注意。

## 4. 减伤/易伤与伤害增幅
ProcessHurtReduction RVA 0x22FDBD4，只处理 event.IsDamageHit；存储并计算 float，不在这里取整。
lambda RVA0x23008F0：对每个有HurtReductionRate转换器且CheckCondition成功的目标function：
- 负值累计 negative += value；
- 非负值仅 maxPositive=max(maxPositive,value)。不是正值相加。
随后读取 target.runtimeMap.HurtReductionRate(172)：
- 若>0，加到maxPositive；若<0，加到negative。
IsIgnoreHurtReduction 0x2300984：若 target.runtimeMap.IgnoreBeHurtReduction(213) 为true，或sourceSkill.GetBattleRoleSkillProperty(IgnoreHurtReduction=198,source,event=null)>0，则maxPositive=0。
最终 event.HitInfo.HPDiffValue *= (1 - (maxPositive+negative))。
注意：此函数没有clamp(0,1)或max(0,...)。负减伤即受伤加深。忽略减伤只清正分量，保留负分量。
重要地址：0x22FDE94..EC4 runtime正负分流；0x22FDEC8..EF4忽略及倍率；0x22FE104..114乘法。

ProcessSourceDamageRate RVA0x22FE150：
- 对符合条件的SourceDamageRate转换值，正值相加，负值相加（并非max）；再加 source.runtimeMap.SourceDamageRate(175)。
- multiplier=max(0,1+sumPositive+sumNegative)。
- event.HitInfo.HPDiffValue *= multiplier。
技能伤害结算中先SourceDamageRate，再HurtReduction，再GetMaxSkillDamage上限（0x22FFDCC、0x22FFDE8、0x22FFDFC）。

## 5. 护盾、免伤及舍入
BattleRoleEvent.HPDiff getter，RVA0x2239144：return Convert.ToInt32(HitInfo.HPDiffValue)。
System.Convert.ToInt32(float) RVA0x3B11968：转double，再调用ToInt32(double)0x3B10058。
0x3B10058的原生分支明确是最近整数、.5到偶数（银行家舍入），正负数都如此。例如2.5=>2、3.5=>4、-2.5=>-2、-3.5=>-4。
因此JS Math.round不等价。上述技能伤害标量链为float32运算，精确复刻应各算术步骤Math.fround，最后bankersRound。属性生成另有double容器与float32系数/读取交替，不可一概按float32或提前取整；2026-10-17[原生战斗样本](native_client_comparison.md)已据此修正。

BattleStatusContainer.ProcessBattleRoleEvent RVA0x2382478：
- 若DamageHit且角色Invincible(59)，标记event.NoDamage=true，返回0，先于护盾。
- NoDamage(85)在符合IsHurtRemoveStatusEvent且非IsSystemPunish的伤害上也标记NoDamage返回0，先于护盾。这里的免伤不是所有类型无条件生效。
- 其他则调用ProcessShield；由护盾返回剩余HP差。
- HP差为负且符合条件时，后续移除受击解除状态（睡眠等）；非普通伤害有类型例外。
- Immortal/保命/LastHP等不在本函数范围，未做完整逆向，不要标为全部防御机制已涵盖。

ProcessShield RVA0x23828D4：
    shield = GetFirstStatusDataByType(Shield=34) # 仅第一个盾
    hpDiff = event.HPDiff # 到这里已经Convert，伤害为负数
    if shield is null: return hpDiff
    shieldFloat = shield.Value
    damageInteger = -hpDiff
    if shieldFloat < damageInteger:
        absorbInteger = Convert.ToInt32(shieldFloat)
        shield.Value = 0
        remove shield
        return hpDiff + absorbInteger
    else:
        shield.Value = shieldFloat - damageInteger #盾余额仍float
        if shield.Value==0: remove shield
        return 0

一个event只消耗第一个Shield状态，函数没有遍历下一盾。不能把所有Shield简单加成总值。get_ShieldValue(0x237F328)也只取第一个Shield的Value并Convert。
盾受击解除状态/状态删除事件会按完整event流程同步，单次静态伤害计算可展示以上盾前/盾后数值。

## 范围与未核实项
本审计没有推断未知内容：反击/夹击触发率、特殊Boss事件、Immortal与HP伤势回写、效果施加基础FRate的外层判定，尚未在这里核查。基础防御、穿透、技能攻击倍率由主Agent另行负责。本报告信息可直接支持单次伤害计算，不等于全自动战斗引擎已完成。

## 6. 追加核查：真实状态概率与闪避的外层门控

补充证据 `hit_defence_followup.asm` / `.py`，均来自014517配对文件。

### 6.1 基础概率不在 CheckCondition 中
`MathHelper.CheckRate(float)` 0x21BDA54 只是 `RandomFloat(0,1) <= inRate`。并不存在独立的SkillFunctionInfo.CheckRate方法。
`SkillFunctionInfo.GetRate` 0x2350E78：

    baseRate = RateConvert.GetValue(context,param) if RateConvert != null else Rate
    if AddRate != null: baseRate += AddRate.GetValue(context,param)
    return baseRate

`SkillFunctionInfo.ProcessFunc` 的逐目标闭包 `b__0` 0x2359C64，在目标范围、CheckCondition、AntiFun门控通过后（0x2359DDC等），于0x235A3F4读取GetRate。
随后循环 `Count + AddCount` 次（0x235A42C..43C），每次独立抽随机数（0x235A45C），若 `baseRate >= random` 才进入 ProcessFuncToRole（0x235A680）。因此基础概率的独立一次施加率为 clamp(baseRate,0,1)，不是抵抗计算中的加数。
Rate默认值在SkillFunctionInfo构造器0x23585BC确认为1，Count在0x23585C0为1。

### 6.2 负面状态的第二次判定
`AddStatusToRole(context,param,string)` 0x235775C：查目标状态StaticData.IsDeBuff；只有要加的状态是debuff时进入IsTargetEffectResist（0x2357868）。正面状态跳过该抗性判定，仍有CanAddStatus/状态合并规则。

`SkillFunctionInfo.IsTargetEffectResist` 0x2350EE4，按如下次序执行：

    if target.IsImmune and !isIgnoreImmuneArgument and !function.IgnoreImmune:
        return true # 被阻止，同时生成Immune(type14)事件
    if !function.IgnoreDodge and any(event.TargetRoleID==target.ID && event.HitInfo.HitType==Dodge in context.CurrentSkillEvent.RoleEvents):
        return true # 被阻止，不进行效果命中随机数
    ignoreResist = NoResistCondition.Check(context,param) if NoResistCondition != null else (IgnoreResist>0)
    if ignoreResist:
        return false # 不抵抗，仍晚于上面免疫、闪避门控
    passed = target.BattleCalculator.IsEffectResist(source,context,function)
    if passed: return false
    else:
        生成Resistance(type6)事件
        return true

闪避查询闭包RVA0x23587E8：先比较event.TargetRoleID与param.Target.ID（0x2358810），再比较HitType==3（0x2358824）。不是单凭计算器本次输入的命中类型；同一SkillEvent内已有的目标闪避事件即可阻止未IgnoreDodge的debuff。
IsEffectResist的true确认为“通过效果判定”，与方法名相反；外层IsTargetEffectResist才是真正true=被挡。

普通单次、无额外状态免疫的debuff概率：

    P = clamp(GetRate,0,1) * clamp(1 + effectHit - resist, 0, 0.85)

若目标IgnoreBuildinResist，则后项取消0.85上限（仍受随机数自然概率界限1限制）。若IgnoreResist条件成立则后项为1。但目标闪避且未IgnoreDodge时P=0；Immune且没有IgnoreImmune同理。CanAddStatus的逐类型免疫/已有状态堆叠还可能拒绝，此式不能覆盖所有状态加入限制。

SkillNullifier/Invincible不在此抗性门控中；它们挡HP伤害，不应自动视为免疫负面状态。真正IsImmune单独处理。

## 7. 追加核查：同一技能的施加先后顺序

`BattleRoleData.ProcessRoleSkill` 0x230C730：
1. StartNewSkillEvent、ProcessReplaceSkill、准备目标列表。
2. 状态BeforeSkill(2)，调用ProcessBeforeSkill（0x230C9A4）。
3. ProcessPinchSkill（0x230C9B4），即夹击在主命中之前。
4. 状态OnSkill(3)，遍历目标调用闭包b__1（0x230EA44），其中0x230EB04调用ProcessSkillToRole。
5. ProcessSkillToRole 0x230D198直接调用该目标Calculator.ProcessSkillHit（0x22FF150）。由此CalculateSkillDamage→target.ProcessEvent→HP状态回写先完成。
6. 所有目标基本命中完成后，source.ProcessAfterSkill（0x230CA00）。
7. 对目标ProcessCounter（闭包0x230EBB0），除非NoCounter>0。
8. 对目标ProcessTargetAfterSkill（闭包0x230EBD4，调用0x230A95C，触发17）。
9. ProcessAfterSkillEventToAll，最后退出技能状态。

`ProcessBeforeSkill` 0x230B9BC在0x230BB28设置Trigger=1，ProcessSkillFunction执行。
`ProcessAfterSkill` 0x230BCAC在0x230BE20设置Trigger=0(AfterSkill)，同时把None(22)加入前置触发列表，随后0x230BEB4调用ProcessSkillFunction。
`ProcessSkillFunction` 0x235AE34先处理PreTriggers，再处理与参数Trigger相等的function（筛选闭包0x235BA40；前置筛选0x235BA8C）。
`SkillFunctionInfo`构造器0x23584E0没有写Trigger字段，所以对象默认0，等于AfterSkill。

准确结论：
- 配置里未写Trigger的AddStatus动态效果，默认在本技能基础伤害全部完成后施加。
- 因此“攻击后减防”不会让本次基础攻击吃到自己刚施加的减防；下一击才会用新状态。
- 显式BeforeSkill的状态可先于基础伤害，影响本次。
- 显式TargetAfterSkill更晚于来源AfterSkill动态效果和反击，不可提前。
- 属性转换器/SkillProperty不等于AddStatus动态施加；它们在伤害函数内按条件读值，须按各自语义处理。

每个基础命中自己的`ProcessEvent`还在真正HP回写前执行目标BeforeEvent(20)、来源SourceBeforeEvent(24)，但这时CalculateSkillDamage已算完float伤害；修改属性不会自动重算已经得到的基础伤害，除非效果直接修改event HPDiff。

## 8. 追加核查：技能伤害无效、保命与实际HP损失

### 8.1 SkillNullifier是一次命中免伤
原表 `SkillNullifier`：
- `DynamicField1=NoDamage#1`。
- `BeHitRemove=TRUE`，RoundCount=-1。
其逻辑确为BattleRoleRuntimeData.NoDamage(85)，不是名为SkillNullifier的特殊硬编码。

`BattleStatusContainer.ProcessBattleRoleEvent` 0x2382478：
- Invincible优先返回0（0x2382584..25A0），此早退不消耗后续BeHitRemove状态，也不消耗盾。
- 读取NoDamage后缓存布尔（0x23825D0..D8）。
- 对有效普通受击、非SystemPunish，先移除所有BeHitRemove状态（0x238269C..2784），即使SkillNullifier刚移除，它先前缓存的NoDamage仍令本次返回0（0x2382788→260C..2698）。
- 免伤返回发生在ProcessShield之前，盾不扣。
- 只要是符合条件的受击，本次即消耗SkillNullifier，不要求真扣HP；闪避(0.75伤)同样仍属普通受击，未见排除Dodge。

有效普通受击的`IsHurtRemoveStatusEvent` 0x2382404 排除以下EventFun：BlastBuff(30)、DirectHit(37)、DirectHPValueHit(40)、BlastBuffWithInjury(58)、AddHP(3)、AddHPWithInjury(59)，并排除HitType BuffHit(4)、SplitDamage(13)。因此NoDamage不能被简单推广为所有事件无敌。Invincible则在本函数的DamageHit分支最早挡伤。
BeHitRemove筛选闭包0x2383C90直接读取StatusStaticData.BeHitRemove字段0x49。

### 8.2 HP底线及保命
`BattleRoleData.AddHP(int)` 0x2309BC4：

    NowHP += hpDiff
    NowHP = min(NowHP, RuntimeData.MaxHP)
    NowHP = max(NowHP, 0)

事件处理0x230AD48取盾/免伤后的整数HP差，0x230AD58调用AddHP。因此普通实际HP最多降至0，即过量伤害不等于实际HP损失。
随后状态变更、ResetData完成后，ProcessEvent 0x230B00C..B08C：

    if NowHP < 1:
        if runtime.Immortal or context.CurrentSkillEvent.ImmortalAddHPRoleIDSet包含该角色:
            NowHP = 1

Immortal本体状态原表 `Immortal#1`，RVA0x22FA49C的getter读EProperty.Immortal(83)。本段没有消耗Immortal状态，因此只要还有效，多次致死伤害仍可保1；其持续回合/移除来自状态规则。
如果保命检查后NowHP仍<1且event.IsEventToDead，则0x230B0D8..0x230B0F4触发PreSelfDead(32)。例如卡C02_SSR_001的被动包含ImmortalAddHP。
`SkillFunctionInfo.ImmortalAddHP` 0x2353D2C不是按最大HP百分比治疗：0x2353D6C直接设置param.Target.NowHP=1，并在CurrentSkillEvent.ImmortalAddHPRoleIDSet注册该ID（0x2353D94）。后续同一技能事件的死亡检查也可据此保1。

`BattleRoleEvent.RealHPDiff` getter 0x2242A8C：return NowHP - LastHP。与HPDiff（浮点结果银行家取整）不同。
计算器应区分“计算伤害（盾前/盾后）”与“实际HP损失”：后者受到剩余HP、免伤与保命限制。例如NowHP=100，盾后攻击500，普通实际损100，Immortal实际损99。不能将计算伤害直接显示为实际扣血。
