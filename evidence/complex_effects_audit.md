# 014517 复杂战斗效果：有界覆盖与原生语义

日期：2026-10-16。范围为现有计算器的192张玩家卡、试炼50层2个敌人、对应584个唯一技能，以及97项状态定义。未修改主解释器/UI；新增原生模块 `../native_complex_rules.js`，测试 `../test_native_complex_rules.cjs`。

原始配置逐项保存在 `complex_effects_configs.json` 与 `complex_effects_configs.md`。本报告末尾附会引入额外攻击、复活、转移、分摊、爆破的完整函数对象。状态引用沿 `FID/FIDs` 遍历，实际可达状态46项；状态库留档不等于卡池已使用。

## 死亡清理补充核实

新增 `processNativeSourceDeath(dead, action)` 与 `processNativeDeaths(action)`；复杂模块现有19组测试通过。证据另存 `complex_effects_death_cleanup.asm`。

即时 `BattleRoleData.ProcessEvent` 顺序为 `PreSelfDead`（`0x230B0E4`）→存活他人的 `PreOtherDead`（`0x230B22C`，lambda `0x230EF10`）→存活他人的 `OtherDead`（`0x230B334`，lambda `0x230EF84`）→`SelfDead`（`0x230B3CC`）→来源死亡状态清理（`0x230B3F8`）→`AfterEvent`（`0x230B4C0`）。每个后续阶段均重新判断死者HP是否仍小于1；死亡事件判定也必须成立。`OtherDead` 和延后的 `OtherDeadAfter` 是不同触发器。

`ProcessDeadRemoveOtherStatus(0x230D260)` 只遍历除死亡者自己之外、HP>0的角色（`0x230ED18`），从其状态中筛选 `SourceRoleID==死者ID && StaticData.IsSourceDeadNeedRemove`（`0x230EE8C`）。没有期限、是否常驻、增减益、阵营等附加条件。每位接收者的全部匹配状态合成一个 `CreateRemoveStatusEvent`，以死者作为source执行该角色的 `ProcessEvent`（`0x230ED4C`）；事件Fun由首个状态的增/减益类型决定（RemoveBuf=5、RemoveDeBuf=4），HitType=RemoveBuff（8）。因此本helper必须由主伤害事件在SelfDead后、AfterEvent前调用，不能放到回合结束再补。

`StatusStaticData.IsSourceDeadNeedRemove(0x2386020)` 读取静态Property的 `IsSourceDeadRemove=104`；`PropertySetting.GetBool(0x22E11D0)` 在属性不存在时返回false，存在时以数值是否非0为bool（负数也true），无需等于1。该getter不读状态实例的stack/value乘数，状态值为0也不能阻止清理。当前97状态中仅 `Taunt` 设置 `IsSourceDeadRemove#1`。

延后 `BattleData.ProcessDeadRoles(0x223DD90)` 对全部角色逐一检查HP<1；lambda `0x2241280` 首先 `RemoveStatusAfterDead(0x2383100)` 删除自身 `!DeadResident` 的状态（predicate `0x2383D08`）。这是容器级删除，没有BeforeEvent/AfterEvent。然后通过 `DeadRoleIDs` 集合去重；首次处理此死者时，对当时HP>0的其它角色（predicate `0x2240FA8`）触发 `OtherDeadAfter=39`（`0x2241728`→`0x230A574`）。自身清理每次执行，OtherDeadAfter每次死亡只发一次。复活事件完成后会移除DeadRoleIDs（`ProcessEvent 0x230B4F8..530`），故模块在复活成功HP>0时清除对应去重标记。

当前状态库有6个 `DeadResident=TRUE` 定义：`C01_SSR_005S2`、`C01_SSR_010_c`、`C03_SSR_007`、`C03_SSR_013S2`、`C04_SSR_009_1`、`C04_SSR_009_2`；普通 `IsResident` 并不豁免死亡清理。

## 覆盖边界

| 函数 | 配置出现数 | 当前卡池与50层可达数 |
|---|---:|---:|
| AdditionSkill | 9 | 9 |
| ReplaceSkill | 3 | 3 |
| AddPinchSkill | 4 | 4 |
| CounterSkill | 7 | 7 |
| AddRound | 12 | 12 |
| ImmortalAddHP | 2 | 2 |
| DirectRevive | 3 | 3 |
| Revive | 2 | 2 |
| TransferBuff | 1 | 1 |
| TransferBuffFrom | 1 | 1 |
| TransferDeBuff | 2 | 2 |
| SplitDamage | 2 | 2 |
| BlastBuff | 3 | 1 |
| DirectHPValueHit | 2 | 1 |
| AddEventHPDiff | 1 | 0 |

当前无 `TransferDeBuffFrom`、`BlastBuffWithInjury`、`ReviveMonster`、`SpawnMonsters` 函数配置。模块对未核验的 `BlastBuffWithInjury` 停止报错，不擅自套用普通爆破。

另外，返锋 `Counterattack` 的 `CounterRate#1` 走独立普通反击路径，不包含在7个 `CounterSkill` 函数里；`C04_SR_005S3` 的 `PinchRate#0.15` 也属于属性驱动夹击。`NoPinch#1` 出现在 `C03_SSR_009S1`、`C01_R_008S1`；`NoCounter#1` 出现在 `C04_SSR_009S1`，均不可遗漏。

## SkillFunctionInfo 默认值

证据：构造器 `0x23584E0`，反汇编 `complex_effects_native.asm`。

| 字段 | 原生默认值 |
|---|---|
| TargetCamp | Enemy（2） |
| Target | One（0） |
| Rate | 1 |
| Count | 1 |
| AddCount | 0 |
| SpawnCount | -1 |
| Value | 0 |
| FID | null |
| FIDs、IgnFIDs | 空列表 |
| GCD | -1 |
| DeadCanRun | true |
| RandCount | 1 |
| IsTransferBuffRemove | true |
| IsForceAddSkill、CheckDupAddSkill、DupReplaceAddSkill | false |
| SubFuns、ContinueFuns、Conditions | 空列表 |

`Count+AddCount` 是对**每个目标尝试执行该函数的次数**，每次独立比较随机数与 `GetRate`。它不是偷取/净化状态个数。转移个数读取 `int(GetValue)`，通常由 `Value` 给定。`GetValue` 首先看 `UseBeforeValue`，否则走 `ValueConvert` 或数值设定。

### 外层时序（重要）

原生 `ProcessFunc`（`0x2350168`）及逐目标闭包 `0x235A3E4...0x235A738`：

```text
检查触发/CD/DeadCanRun；解析目标列表
attemptedAny = false
for target in targets:
    创建本目标上下文并检查函数条件
    重复 Count + AddCount 次:
        若 GetRate < random: continue
        attemptedAny = true   // 调用核心函数之前已经置位
        succeeded = ProcessFuncToRole(...)
        if succeeded:
            执行 ContinueFun 与 ContinueFuns（本目标）
if attemptedAny:
    写入函数CD
    整体执行一次 SubFuns
```

因此核心函数返回false时，`ContinueFuns` 不执行，**但 SubFuns 仍可能执行**，因为外层标记是“条件和概率通过、已尝试核心函数”，不是“实际效果成功”。本报告更正早期把 SubFuns 描述为实际成功门槛的说法。

原始 `Blast_Burn/Blast_Bomb` 带有拼错的单数 `SubFun`；配对原生类没有这个字段，不能擅自将它扩展成 `SubFuns`。两种状态另有独立的第二条清除自身配置，因此忽略单数拼错字段不代表标记永不移除。

## 追加技、夹击与反击

核心方法 `SkillFunctionInfo.AddSkill`：`0x2352030`。

- 当前根行动需 `ActionType=Main`，或该函数显式 `IsForceAddSkill=true`。`BattleAction.IsMainSkill` (`0x223ABC8`) 只判断 ActionType==0。
- `AdditionSkill`：行动者为 `UseFunRole`；目标为该函数选中的 `Param.Target`；`FID` 空则普通技能。
- `AddPinchSkill`：目标选择设置选的是**协战者**。行动者为选中的 `Param.Target`，实际攻击目标为当前主行动的 TargetID。`FID` 空则调用所选协战者的 `GetPinchSkill` (`0x2346898`)；该方法先读取原生 `PinchSkill` 字符串替换，未成功才回普通技能。
- `CounterSkill`：行动者优先 `AuraSource`，为空才 `UseFunRole`；实际攻击目标为当前主行动 SourceID。`FID` 空则普通技能；不能误用“目标”当反击者。
- 追加队列有原生去重逻辑；`DupReplaceAddSkill/CheckDupAddSkill` 影响重复追加。不能将同一事件上所有随机协战无条件累加，也不能让一般反击/追加无限互相递归。
- `NoCounter`、`RoleNoPinch`、`RoleNoCount` 及 `WillPassRound` 是独立门槛。原生 `ParamOrder=1` 的追加会插入队列头部。

普通反击由 `BattleRoleData.ProcessCounter` (`0x230D430`) 单独实现：根行动Main、造成伤害命中、原技能为敌阵营技能、受击者活着且未受禁止行动控制；检查禁止反击与去重，再按 `CounterRate` 判定，调用 `GetCounterSkill`，并非只检查7项显式 `CounterSkill`。

## 复活与直接复活

核心 `Revive`：`0x2352CF8`；分派表 `0x2351358`。

```text
Revive/DirectRevive 都要求目标当前已死
若目标有 AntiCantRevive，绕过 CanRevive
否则：不能已退场、不能有敌方 EnemyCantRevive、不能有任意方 AllCantRevive
hp = truncTowardZero(GetValue)  // 不是默认10%、20%或30%
创建 HitType=Revive 的生命变化事件，FunID = FID
DirectRevive：立即处理该事件，再执行 AfterRevive
Revive：将 FunctionParam 放入 ReviveList，稍后统一处理
```

两者从分派表进入 `Revive` 时均传 `inIsIgnoreCantRevive=false`，所以 **DirectRevive 不绕过禁复活**。它的“直接”是立即结算语义。

实例配置中的百分比：`C03_SSR_005S2` 目标最大生命20%；`C03_SSR_008S2` 目标最大生命10%；`C03_SSR_011S2` 目标最大生命20%；`C03_SSR_006S3` 自身最大生命20%；`Revive` 状态自身最大生命30%。百分比均由各自 `ValueConvert` 指定。

复活事件最终通过 `AddHP` (`0x2309BC4`) 把生命限制在0与当前生命上限之间；不能强行最少设为1。`ImmortalAddHP` (`0x2353D2C`) 才是直接保留1点生命，不能当成百分比复活。

延迟队列 `BattleController.ProcessReviveRoles` (`0x223DED0`) 以 `param.Order` **降序**排列，较高的99优先于1。消费时只检查仍死亡、未实际退场，不重新比较 CanRevive。目标执行 AfterRevive 后，若owner与target不同才再次对owner执行 AfterRevive。一个目标已经被前一条队列复活，后续条目跳过。

## 转移强化 / 弱化

方法：`TransferBuff 0x2355AF8`、`TransferBuffFrom 0x2355C2C`、`TransferDeBuff 0x23559C4`、`TransferStatus 0x23570C0`；克隆/筛选闭包 `0x2358C54...0x2358ECC`。

| 函数 | 来源 | 接收者 | 专属抗性检查 | 效果抗性检查 |
|---|---|---|---|---|
| TransferBuff | 函数目标 | UseFunRole | 来源 AntiTransferBuff | 来源，忽略Immune |
| TransferBuffFrom | FromSelect首个角色 | 每个函数目标 | **接收者** AntiTransferBuff | 来源，忽略Immune |
| TransferDeBuff | UseFunRole | 函数目标 | 接收者 AntiTransferDeBuff | 接收者，正常Immune |

```text
candidates = from.StatusList 中
    IsDeBuff == 要转移的类型
    && !IsResident && !DeadResident && IsShowIcon
chosen = candidates.TakeLast(trunc(GetValue)) // 不是最前、不是随机
若chosen为空或抵抗：return false
若 IsTransferBuffRemove 且本次函数尚无缓存：
    从来源移除chosen，并缓存同一组实例
对chosen逐个Clone:
    SourceRoleID = UseFunRole.ID
    UntilRound = old.UntilRound - from.DisplayRound
                 - Number(old.InSelfStartDisplayRound == from.DisplayRound)
                 + to.NowRound
    其余Value/Stack/InSelfStartDisplayRound照克隆
    检查每个状态接收的CanAddStatus / Immune，允许的进入状态容器
return true
```

多人 `TransferBuffFrom` 复用同一组缓存供各目标复制，不能给第一位抽2项后，第二位再抽不同的2项。来源移除不因某接收者的单项免疫而恢复。接收状态仍按原生Group与Level处理合并：新实例保留原stack；与已有实例合并时，`StatusData.Merge` 每次只+1并受MaxStack限制，不把被转移stack整批相加。

`Count` 不控制状态数量；`Value=1/2` 才是1/2个。`IsTransferBuffRemove` 缺省true。`FID/FIDs` 在TransferStatus不作任意状态筛选。

## 分摊伤害

`SplitDamage 0x2354850`；消费候选位于 `BattleRoleData.ProcessBeforeEvent 0x230C0EC`。

```text
要求是伤害事件；排除SetHPRate、系统惩罚、已是SplitDamage事件
光环函数要求本函数target就是AuraSource
保护者不能是被保护者本人、不能已死
原受击目标有BeDamageNoSplit时不分摊
原受击者不是Boss且施放技能带NoSplitDamage>=1时不分摊
split.HPDiff = GetValue × 当前原事件.HPDiff（负数）
加入原事件.SplitDamageList
全部BeforeEvent函数跑完后：
    从候选按HPDiff升序取第一项（绝对分摊伤害最大）
    原事件.HPDiff -= split.HPDiff
    对该保护者执行独立分摊事件
```

只有**最大的一项**执行，多个保护者不能累加分摊。闪避命中仍造成75%伤害，并没有独立的“不分摊闪避”分支；不能把HitInfo.IsSystemPunish误读成IsDodge。

当前配置仅 `C03_R_004S3` 的15%（保护站位3），以及 `C03_R_105S3` 的8%光环。模块只记录 `event.splits[]` 候选；由主 applyDamage 统一挑最大，防止中途重复减少原伤害。

## 爆破

`BlastBuff 0x2354EB8`，属性计算 `SkillValueConvert.GetValue 0x237DAFC` 与闭包 `0x23808D0`。

```text
查找目标上 StaticID == FID 的全部状态实例；没有则return false
param.StatusList += 这些实例
param.DirectDamageValue = GetValue
param.IsDirectDamageNoDefence = 原状态定义中不存在BuffAttack函数
把param排入伤害队列
立即移除被爆破的原状态实例
return true
```

- `BlastBuffRoundValue = Σ(instance.Value × instance.GetRound(target))`，逐实例按float32累加。
- `BuffValue` 读取指定ID的**第一个实例**Value；`BuffCountByID` 是实例个数。
- `Blast_Burn`：`1.1 × Σ(每个Burn实例值×剩余回合)`。Burn本来有BuffAttack，因此保留防御结算，不能简单当纯真实伤害。
- `Blast_Bleed` 同理但当前卡池未引用；`Blast_Bomb` 原始计算是首个Bomb的Value×实例数×1.1，同样仅在状态库留档。
- 爆破以排队伤害结算；原始状态马上移除。模块 `flushComplexDamage()` 通过主引擎 `directDamage(owner,target,value,action,noDefence)` 结算，不复制另一套伤害公式。

## 接口与验证

```javascript
GLNativeComplex.install(Simulation);
simulation.executeComplex(owner,f,action,target,event,ctx,val);
// → {handled,success}; Count/Rate/Condition/SubFuns由主execute负责
simulation.flushComplexDamage();
simulation.flushRevives();
```

依赖主引擎 `effectResisted`（`_nativeAntiChecked` 表示专属转移抗性已检查）、`directDamage`，以及状态模块的 `addStatusClone` 优先入口。15项针对性测试已通过：来源/目标方向、TakeLast、多人同源缓存、持续期克隆、专属免疫、复活HP截断/零HP、复活队列优先级、禁复活、闪避分摊、爆破移除与队列、防御分支、爆破剩余回合求和、直接数值伤害延迟与空触发来源、批量状态事件次数、复活事件与AfterRevive先后顺序。

### 集成审查新增确认

- `DirectHPValueHit` 也只入 `DirectHitList`，不能立即反弹；模块现统一入 `nativeComplexDamageQueue`。`ProcessRoleAction 0x223E9E4` 在 AfterRound 后的 `0x223F2D8` 消费追加伤害，随后处理死亡、复活。
- `ProcessDirectHit 0x22FED40` 调用目标 `ProcessEvent` 的 sourceRole 实参为null（`0x22FEE6C...78`），不能额外触发owner的SourceBeforeEvent。模块伤害metadata保留 `sourceRole:null`，统计归属另用 `damageCredit`；爆破归属其标记施加者仅属于计算器统计约定，原生数值上下文仍是 `nativeOwner`。
- `CalculateDirectHitNoDefence 0x22FF058` 直接写 `HPDiff=-Value`，没有再算HurtReduction。
- `CalculateDirectHit 0x22FE930`：`Value × AttackPowerRate × BuffAttackRate / (1 + Defence × DefenceRate × 0.3 / DefenceConstant)`，随后再算HurtReduction。浮点常数 `0xD3414C` 解出0.3；不能套普通技能的全防御系数。原生AttackPowerRate为1.871。
- 分摊直接分走已算好减伤的原事件HPDiff，再对保护者走事件层的无敌/护盾等；不能再以保护者的HurtReduction重算一次。`IsHurtRemoveStatusEvent 0x2382404` 对 SplitDamage13 返回false，所以分摊不是ordinaryHit，不消耗NoDamage或触发BeHitRemove/HurtRemove。
- 致命事件时序为 `PreSelfDead → SelfDead → ProcessDeadRemoveOtherStatus → AfterEvent → SourceAfterEvent`（`0x230B0DC、0x230B3CC、0x230B3F8、0x230B4C0、0x230B4D8`），不能先发AfterEvent再执行保命/死亡触发。

## 完整原配置

以下自动附录保留每个函数对象；“仅状态库留档”均明确标记，未作为当前卡池已使用机制。

### C01_SSR_002S3 / AdditionSkill

`DynamicField1`（当前可达）

```json
{"Fun":"AdditionSkill","Target":"SkillSelect","FID":"C01_SSR_002S1","Conditions":[{"CheckFun":"IsMainRound"},{"CheckFun":"IsNormalSkill"},{"CheckFun":"CheckSkillCooldown","CheckID":"C01_SSR_002S3"},{"Who":"Target","Property":"NowHPRate","Comparer":"Lt","Value":0.5}],"SubFuns":[{"Fun":"ReSetSkillCoolDown","TargetCamp":"My","Target":"Self","IsShowTip":false,"IgnoreResist":1,"IgnoreImmune":true,"IgnoreDodge":true,"FID":"C01_SSR_002S3"}]}
```


### C01_SSR_010S1 / ReplaceSkill

`DynamicField2`（当前可达）

```json
{"Fun":"ReplaceSkill","FID":"C01_SSR_010S3","Conditions":[{"CheckFun":"SkillID","CheckID":"C01_SSR_010S1"},{"CheckFun":"IsPinch"}]}
```


### C01_SSR_014S4 / AdditionSkill

`DynamicField2`（当前可达）

```json
{"Fun":"AdditionSkill","Target":"SkillSelect","IsForceAddSkill":true,"FID":"C01_SSR_014S3","Conditions":[{"CheckFun":"IsMainRound"},{"CheckFun":"IsNormalSkill"},{"CheckFun":"CheckSkillCooldown","CheckID":"C01_SSR_014S4"}],"SubFuns":[{"Fun":"ReSetSkillCoolDown","TargetCamp":"My","Target":"Self","IsShowTip":false,"IgnoreResist":1,"IgnoreImmune":true,"IgnoreDodge":true,"FID":"C01_SSR_014S4"}]}
```


### C02_SSR_001S4 / ImmortalAddHP

`DynamicField1`（当前可达）

```json
{"ID":"3_1","CD":9999,"Fun":"ImmortalAddHP","Trigger":"PreSelfDead","TargetCamp":"My","Target":"Self","SubFuns":[{"Fun":"AddStatus","TargetCamp":"My","Target":"Self","FID":"Immortal_Mark"},{"Fun":"AddSkillCoolDown","TargetCamp":"My","Target":"Self","FID":"C02_SSR_001S2","Value":-4}]}
```


### C02_SSR_001S4 / ReplaceSkill

`DynamicField2`（当前可达）

```json
{"Fun":"ReplaceSkill","FID":"C02_SSR_001S3","Conditions":[{"CheckFun":"IsMainRound"},{"CheckFun":"SkillID","CheckID":"C02_SSR_001S1"},{"Property":"BuffCount","Comparer":"Gt","Value":1}]}
```


### C02_SSR_006S3 / AddRound

`DynamicField1.SubFuns[0]`（当前可达）

```json
{"Fun":"AddRound","TargetCamp":"My","Target":"Self"}
```


### C02_SSR_007S1 / AddPinchSkill

`DynamicField1`（当前可达）

```json
{"Fun":"AddPinchSkill","Rate":0.3,"TargetCamp":"My","SelectInfo":{"TargetCamp":"My","TargetType":"RandomOne","NoSelf":true,"RemoveWillPassRound":true,"Condition":{"Property":"RoleNoPinch","Who":"Target","Value":0}}}
```


### C02_SSR_008S4 / AdditionSkill

`DynamicField1`（当前可达）

```json
{"Fun":"AdditionSkill","FID":"C02_SSR_008S3","IsForceAddSkill":true,"Condition":{"CheckFun":"SkillID","CheckID":"C02_SSR_008S1","Conditions":[{"TargetInfo":{"TargetType":"RandomTwo"},"Property":"NowHP","Comparer":"Lt","Value":0}]}}
```


### C02_SSR_008S4 / AdditionSkill

`DynamicField2`（当前可达）

```json
{"Fun":"AdditionSkill","FID":"C02_SSR_008S3","Condition":{"CheckFun":"SkillID","CheckID":"C02_SSR_008S2","Conditions":[{"TargetInfo":{"TargetType":"SkillDirectTargets"},"Property":"NowHP","Comparer":"Lt","Value":0}]}}
```


### C02_SSR_009S3 / CounterSkill

`DynamicField2`（当前可达）

```json
{"Trigger":"TargetAfterSkill","Fun":"CounterSkill","Target":"SkillSource","Rate":0.3,"Condition":{"CheckFun":"IsDamageSkill"}}
```


### C02_SSR_014S1 / TransferBuff

`DynamicField1`（当前可达）

```json
{"Fun":"TransferBuff","Rate":0.75,"Value":1}
```


### C03_SSR_001S3 / AddPinchSkill

`DynamicField2`（当前可达）

```json
{"Fun":"AddPinchSkill","SelectInfo":{"TargetCamp":"My","TargetType":"HightestAtkOne","NoSelf":true,"RemoveWillPassRound":true,"Condition":{"Property":"RoleNoPinch","Who":"Target","Value":0}},"Conditions":[{"CheckFun":"IsMainRound"},{"CheckFun":"IsNormalSkill"},{"CheckFun":"CheckSkillCooldown","CheckID":"C03_SSR_001S3"}],"SubFuns":[{"Fun":"ReSetSkillCoolDown","TargetCamp":"My","Target":"Self","IsShowTip":false,"IgnoreResist":1,"IgnoreImmune":true,"IgnoreDodge":true,"FID":"C03_SSR_001S3"}]}
```


### C03_SSR_003S1 / AdditionSkill

`DynamicField2`（当前可达）

```json
{"ID":"C03_SSR_003S1","CD":1,"Trigger":"BeforeSkill","Fun":"AdditionSkill","IsForceAddSkill":true,"RateConvert":{"Base":0.2,"Rate":0.2,"Property":"ValueOne","Condition":{"Who":"SelectTarget","Property":"BuffCount","Comparer":"Gt","Value":1}},"FID":"C03_SSR_003S1","Condition":{"CheckFun":"SkillID","CheckID":"C03_SSR_003S1"}}
```


### C03_SSR_004S3 / AddRound

`DynamicField1.SubFuns[0]`（当前可达）

```json
{"Fun":"AddRound","TargetCamp":"My","Target":"Self"}
```


### C03_SSR_005S2 / DirectRevive

`DynamicField2`（当前可达）

```json
{"FID":"C03_SSR_005S2","Fun":"DirectRevive","TargetCamp":"My","Target":"SkillDirectTargets","ValueConvert":{"Who":"Target","Rate":0.2,"Property":"MaxHP"}}
```


### C03_SSR_006S3 / Revive

`DynamicField1`（当前可达）

```json
{"ID":"C03_SSR_006","CD":9999,"FID":"C03_SSR_006","Trigger":"SelfDead","Fun":"Revive","ParamOrder":1,"Target":"Self","TargetCamp":"My","ValueConvert":{"Rate":0.2,"Property":"MaxHP"}}
```


### C03_SSR_008S2 / DirectRevive

`DynamicField2`（当前可达）

```json
{"Fun":"DirectRevive","TargetCamp":"My","Target":"AllWithDead","ValueConvert":{"Who":"Target","Rate":0.1,"Property":"MaxHP"},"Condition":{"Who":"Target","Property":"NowHP","Comparer":"Lt","Value":0}}
```


### C03_SSR_011S2 / DirectRevive

`DynamicField3`（当前可达）

```json
{"FID":"C03_SSR_011S2","Fun":"DirectRevive","TargetCamp":"My","Target":"DeadOne","ValueConvert":{"Who":"Target","Rate":0.2,"Property":"MaxHP"}}
```


### C03_SSR_015S2 / AddRound

`DynamicField1`（当前可达）

```json
{"Fun":"AddRound","TargetCamp":"My","Target":"Self"}
```


### C03_SSR_015S3 / CounterSkill

`DynamicField2`（当前可达）

```json
{"Trigger":"AnyOneAfterSkillHit","Rate":0.15,"Fun":"CounterSkill","Target":"SkillSource","NoSelf":true,"DeadCanRun":false,"Conditions":[{"Who":"TriggerSource","CheckFun":"IsDiffCamp"},{"Who":"TriggerTarget","CheckFun":"IsNoSelf"},{"CheckFun":"IsDamageSkill"}]}
```


### C04_SSR_002S1 / AdditionSkill

`DynamicField2`（当前可达）

```json
{"CD":1,"Fun":"AdditionSkill","FID":"C04_SSR_002S3","Conditions":[{"CheckFun":"SkillID","CheckID":"C04_SSR_002S1"},{"Who":"SelectTarget","Property":"NowHPRate","Comparer":"Lt","Value":0.3},{"CheckFun":"IsMainRound"}]}
```


### C04_SSR_003S1 / ReplaceSkill

`DynamicField2`（当前可达）

```json
{"Fun":"ReplaceSkill","FID":"C04_SSR_003S3","Conditions":[{"CheckFun":"MainActionType"},{"CheckFun":"SkillID","CheckID":"C04_SSR_003S1"},{"Property":"BuffCount","Comparer":"Gt","Value":1}]}
```


### C04_SSR_007S3 / CounterSkill

`DynamicField1`（当前可达）

```json
{"Trigger":"AnyOneAfterSkillHit","Rate":0.15,"Fun":"CounterSkill","Target":"SkillSource","NoSelf":true,"DeadCanRun":false,"Conditions":[{"Who":"TriggerSource","CheckFun":"IsDiffCamp"},{"Who":"TriggerTarget","CheckFun":"IsNoSelf"},{"CheckFun":"IsDamageSkill"}]}
```


### C04_SSR_010S3 / AddRound

`DynamicField1.SubFuns[0]`（当前可达）

```json
{"Fun":"AddRound","TargetCamp":"My","Target":"Self"}
```


### C01_SR_002S2 / AddRound

`DynamicField2`（当前可达）

```json
{"Fun":"AddRound","TargetCamp":"My","Target":"Self","Condition":{"Who":"SelectTarget","Property":"NowHP","Value":0,"Comparer":"Lt"}}
```


### C01_SR_004S2 / AddRound

`DynamicField1`（当前可达）

```json
{"Fun":"AddRound","TargetCamp":"My","Target":"Self"}
```


### C01_SR_004S3 / AddRound

`DynamicField1.SubFuns[0]`（当前可达）

```json
{"Fun":"AddRound","TargetCamp":"My","Target":"Self"}
```


### C01_SR_007S4 / CounterSkill

`DynamicField1`（当前可达）

```json
{"Trigger":"TargetAfterSkill","Rate":0.2,"Fun":"CounterSkill","Target":"SkillSource","Condition":{"CheckFun":"IsDamageSkill"}}
```


### C01_SR_009S3 / TransferBuffFrom

`DynamicField1`（当前可达）

```json
{"Fun":"TransferBuffFrom","TargetCamp":"My","Target":"All","FromSelect":{"TargetType":"SkillDirectTargets"},"Value":2,"Conditions":[{"CheckFun":"IsMainRound"},{"CheckFun":"IsNormalSkill"},{"CheckFun":"CheckSkillCooldown","CheckID":"C01_SR_009S3"},{"TargetInfo":{"TargetType":"SkillDirectTargets"},"Property":"BuffCount","Comparer":"Gt","Value":1}],"SubFuns":[{"Fun":"ReSetSkillCoolDown","TargetCamp":"My","Target":"Self","IsShowTip":false,"IgnoreResist":1,"IgnoreImmune":true,"IgnoreDodge":true,"FID":"C01_SR_009S3"}]}
```


### C01_SR_010S2 / AddRound

`DynamicField4`（当前可达）

```json
{"Fun":"AddRound","TargetCamp":"My","Target":"Self"}
```


### C01_SR_011S2 / AddRound

`DynamicField1`（当前可达）

```json
{"Fun":"AddRound","TargetCamp":"My","Target":"Self"}
```


### C02_SR_009S2 / AddRound

`DynamicField3`（当前可达）

```json
{"Fun":"AddRound","TargetCamp":"My","Target":"Self"}
```


### C03_SR_003S1 / TransferDeBuff

`DynamicField1`（当前可达）

```json
{"Fun":"TransferDeBuff","Rate":0.5,"Value":1}
```


### C03_SR_005S2 / AddRound

`DynamicField2`（当前可达）

```json
{"Fun":"AddRound","TargetCamp":"My","Target":"Self","Value":1,"Condition":{"TargetInfo":{"TargetType":"SkillDirectTargets"},"Property":"NowHP","Comparer":"Lt","Value":0}}
```


### C04_SR_003S3 / AdditionSkill

`DynamicField1`（当前可达）

```json
{"ID":"C04_SR_003S1","CD":1,"Trigger":"BeforeSkill","Fun":"AdditionSkill","Rate":0.2,"Conditions":[{"CheckFun":"IsMainRound"},{"CheckFun":"IsNormalSkill"},{"CheckFun":"SkillID","CheckID":"C04_SR_003S1"}],"FID":"C04_SR_003S1"}
```


### C04_SR_006S1 / TransferDeBuff

`DynamicField1`（当前可达）

```json
{"Fun":"TransferDeBuff","Rate":0.5,"Value":1}
```


### C02_R_009S3 / CounterSkill

`DynamicField1`（当前可达）

```json
{"Trigger":"TargetAfterSkill","DeadCanRun":false,"Fun":"CounterSkill","Target":"SkillSource","Rate":0.3,"Condition":{"CheckFun":"IsDamageSkill"}}
```


### C03_R_002S1 / AdditionSkill

`DynamicField1`（当前可达）

```json
{"ID":"C03_R_002S1","CD":1,"Fun":"AdditionSkill","IsForceAddSkill":true,"Rate":0.2,"FID":"C03_R_002S1"}
```


### C03_R_004S3 / SplitDamage

`DynamicField1`（当前可达）

```json
{"Trigger":"BeforeEvent","TargetCamp":"My","Target":"AuraSource","Fun":"SplitDamage","IsAura":true,"NoSelf":true,"Value":0.15,"Condition":{"CheckFun":"Position","CheckID":"3"}}
```


### C03_R_007S3 / AddPinchSkill

`DynamicField1`（当前可达）

```json
{"Fun":"AddPinchSkill","SelectInfo":{"TargetCamp":"My","TargetType":"HightestAtkOne","NoSelf":true,"RemoveWillPassRound":true,"Condition":{"Property":"RoleNoPinch","Who":"Target","Value":0}},"Conditions":[{"CheckFun":"IsMainRound"},{"CheckFun":"IsNormalSkill"},{"CheckFun":"CheckSkillCooldown","CheckID":"C03_R_007S3"}],"SubFuns":[{"Fun":"ReSetSkillCoolDown","TargetCamp":"My","Target":"Self","IsShowTip":false,"IgnoreResist":1,"IgnoreImmune":true,"IgnoreDodge":true,"FID":"C03_R_007S3"}]}
```


### C03_R_008S2 / AddRound

`DynamicField1`（当前可达）

```json
{"Fun":"AddRound","TargetCamp":"My","Target":"Self"}
```


### C03_R_102S3 / CounterSkill

`DynamicField1`（当前可达）

```json
{"Trigger":"TargetAfterSkill","DeadCanRun":false,"Fun":"CounterSkill","Rate":0.3,"Condition":{"CheckFun":"IsDamageSkill"}}
```


### C03_R_105S3 / SplitDamage

`DynamicField1`（当前可达）

```json
{"Trigger":"BeforeEvent","TargetCamp":"My","Target":"AuraSource","Fun":"SplitDamage","IsAura":true,"NoSelf":true,"Value":0.08}
```


### C04_R_104S3 / CounterSkill

`DynamicField1`（当前可达）

```json
{"Trigger":"TargetAfterSkill","DeadCanRun":false,"Fun":"CounterSkill","Rate":0.3,"Condition":{"CheckFun":"IsDamageSkill"}}
```


### C04_R_106S1 / AdditionSkill

`DynamicField1`（当前可达）

```json
{"ID":"C04_R_106S1","CD":1,"Fun":"AdditionSkill","FID":"C04_R_106S1","Conditions":[{"Property":"NowHPRate","Comparer":"Lt","Value":0.25},{"CheckFun":"IsMainRound"},{"CheckFun":"SkillID","CheckID":"C04_R_106S1"}]}
```


### C04_R_106S3 / ImmortalAddHP

`DynamicField1`（当前可达）

```json
{"ID":"3_1","CD":9999,"Trigger":"PreSelfDead","Fun":"ImmortalAddHP","TargetCamp":"My","Target":"Self","SubFuns":[{"Fun":"AddStatus","TargetCamp":"My","Target":"Self","FID":"Immortal_Mark"}]}
```


### Reflection / DirectHPValueHit

`DynamicField1`（当前可达）

```json
{"Trigger":"TargetAfterSkill","Fun":"DirectHPValueHit","Target":"SkillSource","ValueConvert":{"Rate":0.3,"Property":"WhoSkillDamage","FinalMaxValueConvert":{"Rate":1,"Property":"MaxHP"}},"Condition":{"CheckFun":"IsDamageSkill"}}
```


### Revive / Revive

`DynamicField1`（当前可达）

```json
{"Trigger":"SelfDead","FID":"Revive","Fun":"Revive","ParamOrder":99,"TargetCamp":"My","Target":"Self","ValueConvert":{"Rate":0.3,"Property":"MaxHP"}}
```


### Curse / DirectHPValueHit

`DynamicField1`（仅状态库留档，当前无引用）

```json
{"Trigger":"AnyOneAfterSkillHit","TargetCamp":"My","Target":"Self","Fun":"DirectHPValueHit","ValueConvert":{"Who":"SelectTarget","Property":"SkillDamage","Rate":0.6},"Conditions":[{"Who":"TriggerTarget","CheckFun":"IsNoSelf"},{"Who":"TriggerSource","CheckFun":"TargetIsOne"},{"Who":"TriggerSource","CheckFun":"IsDiffCamp"},{"Who":"TriggerSource","CheckFun":"IsDamageSkill"}]}
```


### PinchEnhance / AddPinchSkill

`DynamicField1`（当前可达）

```json
{"Fun":"AddPinchSkill","ParamOrder":5,"TargetCamp":"My","Target":"AuraSource","IsAura":true,"Conditions":[{"Who":"AuraSource","CheckFun":"IsNoSelf"},{"CheckFun":"IsNormalSkill"},{"CheckFun":"IsSkillNoPinch","Invert":true}]}
```


### Blast_Bleed / BlastBuff

`DynamicField1`（仅状态库留档，当前无引用）

```json
{"Trigger":"AnyOneAfterRound","Fun":"BlastBuff","FID":"Bleed","TargetCamp":"My","Target":"Self","ValueConvert":{"Who":"Target","Rate":1.1,"Property":"BlastBuffRoundValue","PropertyID":"Bleed"}}
```


### Blast_Burn / BlastBuff

`DynamicField1`（当前可达）

```json
{"Trigger":"AnyOneAfterRound","Fun":"BlastBuff","FID":"Burn","TargetCamp":"My","Target":"Self","ValueConvert":{"Who":"Target","Rate":1.1,"Property":"BlastBuffRoundValue","PropertyID":"Burn"},"SubFun":{"Fun":"RemoveBufsByID","TargetCamp":"My","Target":"Self","AbsoluteRemoveBuff":true,"IgnoreResist":1,"FID":"Blast_Burn","Value":1}}
```


### Blast_Bomb / BlastBuff

`DynamicField1`（仅状态库留档，当前无引用）

```json
{"Trigger":"AnyOneAfterRound","Fun":"BlastBuff","FID":"Bomb","TargetCamp":"My","Target":"Self","ValueConvert":{"Who":"Target","Rate":1.1,"Property":"BuffValue","PropertyID":"Bomb","ExtraRate":{"Who":"Target","Rate":1,"Property":"BuffCountByID","PropertyID":"Bomb"}},"SubFun":{"Fun":"RemoveBufsByID","TargetCamp":"My","Target":"Self","AbsoluteRemoveBuff":true,"IgnoreResist":1,"FID":"Blast_Bomb","Value":1},"ContinueFuns":[{"Fun":"AddStatus","FID":"Stun","TargetCamp":"My","Target":"Self","IgnoreResist":1,"IgnoreDodge":true,"StatusRound":1}]}
```
