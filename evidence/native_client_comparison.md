# 原生客户端战斗样本对照

2026-10-17，MuMu现有实例，客户端`1.0.1.014517`。单卡《针针思》`C02_SR_003`，80级、刻印5级、Star=8，对阵试炼50层原始双敌。

环境使用已有的本地账号/资料服务，战斗计算由游戏原生客户端执行。记录了一场战斗的1080×1920画面及原生伤害日志；没有修改伤害、随机数或技能结果。此记录不代表官方服务器账号实战，也不代表所有卡牌已完成逐回合验证。

## 已发现并修正

- **角色系数精度**：`PropertySetting.MultiplyValue`先把角色系数转float32，再以double乘基表，保留小数。《针针思》80级、刻印5级的实际攻击为**3509**，此前过早按十进制系数计算为3510。
- **属性合并与取整**：刻印与临时属性在同一PropertySetting合并，最终读取float32后，攻击/防御截断，生命/速度取偶数舍入。不能先把刻印后的面板取整，再乘所有临时增益。
- **运行时属性**：普通命中的攻击参数取整；数值转换读取PropertySetting时可以保留小数。样本随从的持续伤害存值为**159.939**，不能从已经截断的1066攻击反推成159.9。
- **动画分段数字**：画面上的多段数字会分别截断。样本4885伤害可显示为2093和2791，不能仅用浮字之和判定实际扣血少了1。

## 样本回归

| 对照项目 | 原生日志或画面 | 修正后 |
|---|---|---|
| 我方攻击/防御 | 3509 / 2655 | 一致 |
| Boss/随从初始生命 | 31826 / 12454 | 一致 |
| Boss连续五次叠攻 | 3376、3817、4257、4698、5138 | 一致 |
| 我方终结技对Boss | 原始1065.822，整数1066 | 一致 |
| 我方终结技对随从 | 原始1604.446，整数1604 | 一致 |
| 持续伤害存值 | 159.939 | 一致 |
| 13次技能命中、2次状态伤害 | 共15条原生日志 | 同输入逐项比较，整数结果全部一致 |

日志只显示有限小数位，浮点对照容差为0.005；这15条样本的整数结果另行严格比较。此项核查使用采集到的命中分支和输入，不声称浏览器随机数序列与Unity随机数逐项相同。

可复核的数字样本见[`native_client_fixture.json`](../tests/native_client_fixture.json)，检查代码见[`test_live_client.cjs`](../tests/test_live_client.cjs)。不发布账号日志、会话标识或凭据。

## 原生位置

- `RoleData.CreateRoleBasePropertySetting`：`0x23118B4`
- `PropertySetting.MultiplyValue(PropertySetting)`：`0x22DFEE8`；系数double→float→double，再与基表double相乘。
- `RoleData.CreateRolePropertySetting`：`0x2311C38`；刻印、装备、技能等加入同一属性容器。
- `AbilityData.CreateFinalValuePropertySetting`：`0x22FAD00`
- `AbilityData.ResetTempValue`：`0x22FAB00`
- `BattleRoleData.GetRoleRuntimeProperty`：`0x2309A38`；读取重建后的PropertySetting.GetFloat。
- `BattleRoleEvent.GetDisplayHitNumber`：`0x2242B88`
