# 角色图鉴第二轮独立核查

核查日期：2026-10-21。数据快照：2026-10-20，资源目录 `catalog_014774`。本轮对上一轮修复结果重新从原表、中文文本、原生类型定义和图片资源核对，并同步检查计算器。

## 核查范围与结果

| 项目 | 本轮结果 |
| --- | --- |
| 玩家卡 | 192 张，角色归属、稀有度、属性、定位及图标逐项对照原表 |
| 人物归属 | 128 张单人卡、64 张双人卡，按原始 Represents 字段关联 |
| 玩家技能闭包 | 583 项，技能库共 586 项 |
| 状态定义 | 97 项，检查正文、定义及引用闭包 |
| 刻印/升星行 | 960 行 |
| 额外强化行 | 260 行 |
| 详情页渲染 | 192 张卡、120 项活动及全部角色档案 |
| 独立原表审计 | 0 项错误 |
| 完整回归 | `scripts/run_tests.py` 退出码 0 |

原表审计同时核对原字段、解析后的配置、技能解锁引用、两站正文、词条引用、伤害目标说明和成长配置。上一轮 11 项文案纠正再次逐条核对通过。

## 卡名与图片

Role.NAME 留空的卡仍可能在同 ID 的 Item.Name 中配置名称。同步顺序调整为 Role.NAME、同 ID Item.Name、历史已知名称。本轮找回五张卡的正式中文名：

| ID | 名称 |
| --- | --- |
| C01_SSR_013 | 微温新绿 |
| C01_SSR_014 | 凛冬双舞 |
| C01_SSR_015 | 彩帷狂想 |
| C02_SSR_013 | 时间铭刻 |
| C03_SSR_015 | 靡澜长夜 |

补回 C01_R_109《昨夜星芒：旭》、C04_R_109《潜波梦逅：玄泽》的卡面和缩略图。两张图片此前受提取器文件名过滤影响；本轮从现有 bundle 的 Sprite 取得完整 576×1024 图片。

另有 19 张 R 卡的详情图从 228×428 缩略图提升至原包完整的 576×1024 图片。21 张补充/升级的全图均已人工目视检查。列表缩略图和详情原图分别保存，全部资产引用与图片解码检查通过。

现有包中仍未取得六张未来 SR 的对应图片：C03_SR_006、C03_SR_007、C03_SR_008、C03_SR_009、C03_SR_010、C03_SR_011。页面保留缺图占位。原包中重复的预置图片保留相应说明。另有 20 张卡在角色表与道具表中均未配置可用中文名，继续使用现有未公布名称提示。

## 本轮新增的 18 项技能说明纠正

以下更正以可执行配置及配套原生逻辑为依据。官方原文字段保留在 `clientDescription`，原始 raw 数据保留。每条覆盖同时校验源配置指纹及源中文文本；客户端修改相应配置或文案后，旧覆盖停止匹配。

| 技能 ID | 已确认的配置行为 |
| --- | --- |
| C02_SR_006S1 | 攻击本体为选定单体，自身行动值提升 12% |
| C03_SSR_015S1 | 攻击本体为选定单体；自身及其他友方的行动提升分开处理 |
| C04_SR_006S1 | 攻击本体为选定单体，按配置向其转移弱化 |
| C04_SSR_014S1 | 攻击选定单体，中毒功能独立选择两名敌人 |
| C03_SR_008S2 | 攻击选定单体，防御下降功能作用于全体敌人 |
| C03_SR_009S2 | 攻击本体为选定单体，附加功能按各自目标选择器执行 |
| C03_SR_010S2 | 攻击本体为选定单体，附加功能按各自目标选择器执行 |
| C04_SR_011S2 | 攻击本体为选定单体，附加功能按各自目标选择器执行 |
| C01_SR_007S4 | 缺省反击技能回落战技 S1，其攻击目标为单体 |
| C01_SR_006S3 | Target:TriggerTarget 为非法枚举，整条动态函数装载失败 |
| C02_SR_007S3 | Target:TriggerTarget 为非法枚举，整条动态函数装载失败 |
| C02_SSR_004S3 | 任一敌方技能完成后检查条件，包含敌方治疗或强化技能 |
| C02_R_109S3 | OtherDead 无阵营条件，其他敌我角色死亡均可触发 |
| C02_SSR_011S3 | ResistRate 属性键与原生读取的 ResistanceRate 不同，35% 抵抗句移除 |
| C03_SSR_011S3 | ResistRate 属性键与原生读取的 ResistanceRate 不同，35% 抵抗句移除 |
| C03_SSR_014S2 | 基础选择阵营为 My，原生判定 NoHit；弱化回合、行动值及符合技能 ID 条件的冷却功能继续执行 |
| C04_SSR_015S2 | AddSkillCoolDown 空 FID 回落当前施放技能 ID，仅对持有同 ID 技能的目标生效 |
| C01_SR_008S2 | 空 FID 的冷却减少同样回落当前技能 ID，按目标实际拥有技能判断 |

两站共保存 29 项经核对的文案覆盖，其中 11 项来自上一轮。源 Description 留空的 8 项辅助动作继续使用已核对配置生成的说明。

伤害参数栏同时显示攻击本体的真实目标范围。C04_SSR_009S1 单独显示通常单体、终结技冷却中两名敌人的条件范围。选择 My 的 NoHit 技能保留冷却及目标信息。

## 原生字段与运行逻辑依据

本轮原生证据取自本地 `libil2cpp_014517.so` 及其配套类型 dump；当前表数据来自 `catalog_014774`。主要入口与核查点：

| 原生入口 | 地址/事实 |
| --- | --- |
| SkillFunctionInfo.CreateSkillFunctionInfos | LoadJsonDataList 逐条反序列化；失败对象跳过，其他动态字段继续 |
| 动态 JSON 装载 lambda | 0x2CE7284；catch 0x2CE7388..0x2CE7420 |
| EnumUtils.ParseEnum | 0x3C46024，未知枚举名称抛异常 |
| JsonPropertyCollection.GetClosestMatchProperty | 0x3C62E10，精确字段名后按 OrdinalIgnoreCase 匹配 |
| SkillStaticData 构造 | 0x235ECB0，默认 TargetCamp=Enemy，TargetType=One |
| SkillStaticData.get_SelectInfo | 0x234D74C，先读取 TargetSelectInfo，再使用基础目标字段 |
| SkillData.GetSelectInfo | 0x234D4D4，继续应用 TargetTypeFun |
| SkillContainer.GetCounterSkill | 0x2346BAC，缺省分支 0x2346D54..0x2346D68 回落 GetNormalSkill |
| SkillStaticData.get_IsDamageHit | 0x235E838，Enemy 且 AttRate 非零时成立 |
| SkillProcessContext.get_IsDamageHit | 0x226456C，读取当前技能 StaticData 的命中类别 |
| BattleCalculator.ProcessSkillHit | 0x22FF150；0x22FF290 进入 NoHit，继续 ProcessEvent |
| PropertySetting._AddNewPropertyToMap | 0x22E07C4，以原属性字符串存储 |
| PropertySetting.GetProperty | 0x22E0C14，按枚举名称取属性 |
| BattleCalculator.IsEffectResist | 0x23000A4，读取 ResistanceRate=24 |
| OtherDead 分发 | 0x230B334，回调全部其他存活角色 |

从配套类型定义提取 6 个配置类和 9 个枚举全集，作为 `config_engine.js` 中的 `NATIVE_FUNCTION_SCHEMA`。覆盖 SkillFunctionInfo、SkillCondition、SkillValueConvert、SkillSelectInfo、ConditionRate、SceneMonsterStaticInfo。Python 词条生成器读取同一份 schema，保持装载判定一致。

完整扫描 72 张原表中的 1230 个 Fun 根对象，识别出 6 个原生无法装载的对象：上一轮 4 个 Fun:ForceConquer 与本轮 2 个 Target:TriggerTarget。整条失败对象及其 SubFuns 按原生丢弃；未知字段按原生忽略。CUSTOM_ 自定义角色保留其扩展功能。

非 Fun 动态属性键完整扫描共发现 3 个未知键：上述两处 ResistRate，以及 TargetTaunt 状态中的 TargetTaunt。该状态另有合法 Taunt 字段，既有嘲弄功能保留。

计算器同步采用共享 `isDamageHit` 判定；空 FID 冷却功能按当前施放技能 ID 回落。显式指定 FID 和 AddAllSkillCoolDown 保持各自处理路径。零倍率协战的独立原生条件由定向回归覆盖。

## 校验与可重复运行

新增/扩展检查：

- `tests/test_card_characters.py`：全卡角色归属、稀有度、属性定位及图标像素，五张新增正式名称。
- `tests/test_catalog_assets.py`：资产引用存在性、所有内嵌图像解码、21 张 R 详情全图尺寸与缩图引用。
- `tests/test_catalog_readers.cjs`：调用实际详情渲染函数，遍历 192 张卡、120 项活动及角色档案，检查空值、数值异常、遗留文本键、技能和成长内容。
- `tests/test_content_completeness.py`：单体/群体参数、条件目标、NoHit 参数及无效词条过滤。
- `tests/test_config_engine.cjs`：原生类型装载、非法枚举整条丢弃、大小写、未知字段及自定义扩展。
- `tests/test_native_skill_hit.cjs`：NoHit、友方生命/弱化/行动值、空 FID 冷却、明确伤害与治疗。
- `tests/test_native_turn_rules.cjs`：自然反击与独立协战条件。

全套运行：

```powershell
python scripts/run_tests.py
```

本轮全套包含 300 场跨层战斗、50 层 63 个敌方配置、15 条已有原生伤害样本，以及治疗、溢出、护盾、方案保存、随机种子、自定义角色、图鉴筛选和更新数据回归。全部通过，进程退出码 0。

原表审计命令：

```powershell
python scripts/audit_client_content.py --tables <当前原表目录> --locale <当前中文目录> --output <核查结果.json>
```

浏览器人工检查覆盖新增完整 R 图、五张正式名称中的详情、C03_SSR_014 的修正文案/参数、成长/词典内容和 390×844 手机视口。手机检查无横向溢出，浏览器错误日志为空。

## 验证范围

本轮结论建立在当前资源目录的原表、中文字段、配套原生控制流、图像核查和回归测试上。当前卡池、未来预置内容与现有缺图情况继续按已取得的证据展示。逐卡原生实战录制、全部零生命变化事件生命周期的逐事件对照仍属于额外验证范围。

用户此前批准的《誓约束缚》RandomAddStatus 最小配置纠正继续单独保留，其依据见 `random_add_status_audit.md`。本轮全部源 raw 数据保留原值。
