# 纪事关卡入场属性核验

核验日期：2026-10-21。数据版本：1.0.1.014774。原生方法依据：配对的 1.0.1.014517 ARM64 客户端、类型定义及方法地址映射。本文记录当前纪事关卡的原表内容和可复核的原生执行规则。

## 1. 关卡和入场配置

`scene` 中 `C02_SSR_006_14` 的等级为 80，单波配置为 `MB004_1_C02_SSR_006`，该敌人具有 Boss 标记。场景的 `RoleStatusInfo1` 为：

```json
{
  "RoleIDs": ["C02_SSR_006"],
  "Conditions": [
    {"ID":"Activity_Main","Comparer":"Gt","Value1":0},
    {"ID":"ActivityBuff","Comparer":"Eq","Value1":0},
    {"ID":"ActivityBuff_1","Comparer":"Eq","Value1":1},
    {"ID":"ActivityBuff_2","Comparer":"Eq","Value1":2},
    {"ID":"ActivityBuff_3","Comparer":"Eq","Value1":3},
    {"ID":"ActivityBuff_4","Comparer":"Eq","Value1":4},
    {"ID":"ActivityBuff_5","Comparer":"Eq","Value1":5}
  ]
}
```

`RoleStatusInfo2` 和该场景所有 `DynamicField` 为空。

`SceneStaticData.get_RoleStatusInfoStringList`（`0x233648C`）依次收集两个 `RoleStatusInfo` 字段；`get_RoleStatusInfoList`（`0x23365CC`）通过 `StaticDataHelper.LoadJsonDataList` 反序列化。`SceneRoleStatusInfo` 的字段为 `RoleIDs: List<string>` 和 `Conditions: List<ValueCondition>`。

## 2. 选取主卡和受益成员

`SceneRoleStatusInfo.InitBattleRoleData`（`0x2331D00`）对每个战场角色执行。普通成员流程如下：

1. 当前接收者为怪物时返回。`BattleRoleData.IsMonster`（`0x23095B4`）依据 `MonsterSetting` 是否存在。
2. 扫描战场角色，查找静态 ID 包含于 `RoleIDs` 的普通成员。筛选函数（`0x2332508`）排除怪物和支援角色。
3. 找到主卡后，以主卡 `RoleData.ImprintLV` 检验全部条件。读取该字段的指令位于 `0x23325FC`，偏移为 `+0x2C`。
4. 匹配 `Activity_Main` 时，仅给主卡自身执行升满等级和添加该状态。
5. 匹配其他条件时，给当前接收者添加指定状态。因此，当前关卡普通阵容的全部成员获得主卡星级对应的一档 `ActivityBuff`。

条件函数为 `ValueCondition.CheckCondition`（`0x2213B40`）。本原生枚举的 `Gt` 实现为大于等于，分支 `0x2213C00` 比较 `Value1 <= 输入值`。因此，零星主卡也符合 `Activity_Main` 的条件。

同一 `RoleIDs` 若匹配多个普通角色，原生遍历保留最后一个匹配项。单张卡仅上阵一次的阵容中，主卡唯一。

### 支援角色分支

匹配 `RoleIDs` 的支援角色有独立入口：直接升满等级、添加 `Activity_Main`，然后返回。该角色承担支援身份时，普通成员的主卡搜索会跳过它。全队星级加成的来源是阵容中的普通成员。

不匹配 `RoleIDs` 的支援角色进入普通接收流程，可获得普通主卡提供的对应档状态。

普通流程的实际筛选依据是怪物身份、支援身份和卡 ID；该方法没有额外的阵营整数比较。当前玩家队伍加场景怪物的结构与此筛选一致。

### 状态来源记录

`0x23326A4` 至 `0x23326B8` 调用 `StatusData.CreateStatus(接收者, 状态ID, 接收者.ID)`，之后以 `needResetData=true` 加入接收者的状态容器。每名成员的入场状态以该成员自身 ID 记录来源。

## 3. 升满等级的具体含义

`ProcessMaxLVStatus`（`0x2331FE0`）完成以下写入：

| 字段 | 偏移 | 写入结果 |
| --- | --- | --- |
| `RoleData.Star` | `+0x28` | `RoleStaticData.MaxStar`，值为 8 |
| `RoleData.LV` | `+0x24` | `RoleData.MaxLV`，值为 80 |
| `SkillData.Level` | `+0x10` | 每个主要技能的 `MaxSkillLevel` |

`RoleStaticData` 的静态构造器（`0x231EBB4`）设置 `MaxStar=8`、`StarLVBase=10`、`MaxLV=80`。`RoleData.get_MaxLV`（`0x231073C`）使用突破阶乘以每阶等级上限。`RoleData.ImprintLV`（`+0x2C`）保持原值，卡牌实际星级和对应升星效果保留。

`RoleData.CreateRoleBasePropertySetting`（`0x23118B4`）按 `RolePropertyID` 和当前 `LV` 获取对应的 `roleproperty` 表项，再应用角色静态模板。活动升至 80 级后的基础属性来自 80 级表项。

### 当前技能等级的数值影响

`SkillStaticData.get_MaxSkillLevel`（`0x234E2E0`）读取该技能的等级数据列表；列表为空时，`0x234E40C` 至 `0x234E41C` 明确返回 1。当前 `skilllevel` 表为零行。因此，当前卡 `C02_SSR_006` 的入场主要技能等级设置为 1，原表技能系数、冷却及按实际 `ImprintLV` 解锁的补丁保持当前数值。

## 4. 全队状态和属性乘区

`status` 原表定义：

| 主卡星级 `ImprintLV` | 状态 ID | `AttackFinalRate` | `HPFinalRate` |
| --- | --- | ---: | ---: |
| 0 | `ActivityBuff` | 0.10 | 0.10 |
| 1 | `ActivityBuff_1` | 0.15 | 0.15 |
| 2 | `ActivityBuff_2` | 0.20 | 0.20 |
| 3 | `ActivityBuff_3` | 0.30 | 0.30 |
| 4 | `ActivityBuff_4` | 0.40 | 0.40 |
| 5 | `ActivityBuff_5` | 0.50 | 0.50 |

这些状态均为 `RoundCount=-1`、`IsResident=true`、`IsBuffType=None`。属性配置由真实状态的 `DynamicField` 提供。`Activity_Main` 自身没有属性数值配置。

`AbilityData.Reset`（`0x22FA904`）的属性合并顺序为：

1. `RoleData.CreateRolePropertySetting`：角色等级基础属性、角色本身的成长和其他已有角色属性。
2. 加入 `FormationPropertySetting`。
3. 依序加入每个状态的 `PropertySetting`。
4. 加入属性触发函数返回的属性。
5. `ResetTempValue`（`0x22FAB00`）调用 `CreateFinalValuePropertySetting`（`0x22FAD00`），计算最终属性。

最终生命和攻击的结构分别为：

```text
HP = (HP基础值 × (1 + HPRate之和) + HPValue之和)
     × (1 + HPFinalRate之和)

Attack = (Attack基础值 × (1 + AttackRate之和) + AttackValue之和)
         × (1 + AttackFinalRate之和)
```

原生最终值随后按各属性规定的数值转换方式写入运行面板。纪事增益与已有同名 `FinalRate` 进入同一求和项。

可核对的关键读取：`0x22FAD78` 读取 `HPFinalRate`（枚举 138），`0x22FADF0` 读取 `AttackFinalRate`（枚举 7）。

## 5. 入场状态和当前生命初始化顺序

`BattleRoleData.Init`（`0x230383C`）的调用顺序：

```text
CreateInitRoleStatuses
InitAllFormationProperty
InitRuntimeValue
ResetData
InitRuntimeValue
RoleTimeInfo.InitTime
BattleSkillContainer.Init
```

`CreateInitRoleStatuses`（`0x2309750`）读取当前场景的 `RoleStatusInfoList`，对每项调用前述 `InitBattleRoleData`。这一步完成活动等级提升和状态加入。

`InitAllFormationProperty`（`0x230981C`）在合并阵容属性后调用 `AbilityData.Reset`。随后的 `ResetData` 再进行一次含属性触发函数的属性重算。

`InitRuntimeValue`（`0x230992C`）于 `0x230993C` 读取 `AbilityData.MaxHP`，于 `0x2309944` 写入 `NowHP`。第二次调用位于最终属性重算之后。因此，正常入场当前生命按含纪事状态的最大生命初始化为满血。

## 6. 数据指纹

| 014774 原表 | SHA-256 |
| --- | --- |
| `scene` | `7e82519f54ea0b2d318b4b066252697ae4ef5a83b767185360246ce27f74ab62` |
| `status` | `1a189bcaed30a18e4fa7f7022cdd5464c29c3bb296d62aa3267750140528d647` |
| `skilllevel` | `05ac387c05b7ff72c371b377e506b8367ac180991399840235cd0062dd874d49` |
| `roleproperty` | `565576b694dc0cb11402caf789a84a9075306a565a9eb1c366d3d61337d13be1` |
| `skill` | `8602dca931a5ea68089b55db2af55c86a4a5516eed95bd111566ad9c3289d878` |
