# 试炼敌方详情展示核查

客户端版本：1.0.1.014517。展示模块 `src/calculator/trial_details.js` 只读 `DATA.trials`、技能、状态及 `DATA.autoAI`，独立于计算线程。

## 资料选择与分类

- 入口按 `plan.trialFloor` 通过 `GLTimeline.resolveTrial` 选择关卡，将实际敌方对象传入详情模块。
- 技能来自每个试炼角色的 `skills`，免疫来自该角色的 `AntiList`。玩家卡只用于匹配缩略图。
- 隐藏技能按敌方 `hiddenSkills` 标识，列出引用它的 `AdditionSkill`、`ReplaceSkill` 来源。原表无定义的悬空引用继续沿用数据提取时的过滤结果。
- 展示基础面板，并明示常驻技能增益会参与战斗结算。技能配置中的属性项亦列出，覆盖第5层暴击率+25个百分点、第45层最终生命+15%等。

## 免疫与试炼机制

- `AntiSilence/AntiStun/AntiTaunt/AntiTargetTaunt/AntiSleep/AntiPoison` 依次对应息声、晕眩、嘲弄、指定嘲弄、静眠、浸毒。
- 48名Boss配置上述6项；第11、12层Boss和13名随从仅配置晕眩免疫。效果抵抗单独展示。
- 第1至46层 `Trial_AttackStack`，第47至50层 `Trial_AttackStack_2`。技能 `BeforeRound` 向自身附加同ID状态；状态 `AttackFinalRate` 分别为0.05、0.15，最大999层、无限持续、常驻、隐藏、`IsBuffType=None`。
- 第38层随从《青丘狐火：柳生》也配置 `Trial_AttackStack`，详情按自身技能显示相同5%叠攻机制。
- `config_engine.js` 的 `nativeStatusProperties` 按状态层数乘属性值；此加成进入最终攻击加成乘区。层数跟随Boss自身行动回合增加。

## 行动规则

解析与排序直接复用 `GLNativeAI.normalize`。语义依据 `evidence/native_ai_audit.md`、`src/calculator/native_ai_rules.js`。

- 技能先检查可用性及条件，再顺序尝试目标设置。技能目标阵营约束保留；全体技能仍按其范围执行。
- `FrontRow` 为固定第1号位，原配置 `Rate=0.6` 为此目标规则尝试概率。
- `ConquerOKTarget` 优先自身克制目标，其次选择不克制自身的目标。
- `LessHPRate` 内层按生命比例、站位截取1人；Boss/克制筛选仍有多人时，再取最低生命比例，怪物随机处理并列。
- 治疗AI的 `Boss` 首规则无血量阈值，后备 `LessHPRate` 单独要求 `NowHPRate<0.99`。
- 第47层绝技额外条件：`TargetInfo.All`、`DeBuffCount>1`、`IsAllWhoPass`缺省false，意为对面至少一名单体具有至少2个弱化状态。
- 第22层随从绝技要求 `AnyAllyHaveCoolDown`，目标依次为技能剩余冷却最长、有技能处于冷却中。
- 原生三轮目标可见性重试、默认战技回退、嘲弄分支均有补充说明。

## 关键脚本细节

- 第28层专用 `Trial_C03_R_101S3`：`TargetAfterSkill`、仍存活、伤害技能事件、被动冷却结束，敌方全队推进20%行动条，被动冷却2。
- 第48层 `C02_SSR_001S4`：自身主回合S1且自身 `BuffCount>1`，替换为隐藏的80%全体S3。保命使用原脚本的9999回合效果冷却描述；所有后续状态附加保留在可展开的效果参数中。
- 第50层S1追加S3：自身主回合、技能ID匹配、`SelectTarget.NowHPRate<0.3`，追加效果CD1。隐藏S3攻击倍率30%、全体。
- 第50层S2：`ConditionAttack` 的 `Who=SelectTarget`、`Rate=0.0022`、`Property=LastHPRate`。已损生命按0至100的百分数取值，附加乘区为 `1+0.0022×已损生命百分数`。
- 第50层潜影：伤害技能事件之后触发，要求仍存活与被动CD结束；附加1回合潜影并拉条20%，被动CD2。潜影全体减伤50%，受伤后解除，常规单体选取受同伴存活影响，AI保留三轮可见性重试。
- 第50层随从20%追加战技包含主回合、普攻标记、技能ID检查及效果CD1。

## 验证

`tests/test_trial_details.cjs` 穷举50层63名敌方，检查全部有效技能引用、免疫、叠攻、6组AI、隐藏技能调用来源、28/47/48/50层边界、参数数字保留、只读性与真实弹窗入口。全套原有引擎回归继续运行。

2026-10-20验证结果：242条技能引用检查通过；全套回归通过，含300场跨层战斗、288组配队及15条原生命中/状态伤害样本。构建产物与修改前的内嵌DATA、ASSETS逐项一致，全部内嵌脚本语法检查通过。新增文字在BookCN、TitleCN内嵌字体中全部有对应字形。

本轮本地浏览器预览访问被浏览器权限策略拒绝，尚未进行桌面/移动端浏览器视觉验收。样式使用原有主题变量，并为窄屏配置单列递归参数布局。
