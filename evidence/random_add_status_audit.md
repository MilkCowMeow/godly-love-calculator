# 《誓约束缚》随机状态配置核查与纠正

核查日期：2026-10-18。对应本地未修改的官方包 `1014_2_Godly_Love_On_Air.apk`，客户端 `1.0.1.014517`。

## 结论与采用口径

`RandomAddStatus` 是客户端的功能枚举 `EFunction.RandomAddStatus = 22`，不是一条独立的状态定义。《誓约束缚》战技 `C03_SSR_012S1` 的候选状态已全部包含在包内，但该行将功能名误填到了 `FID`，实际 `Fun` 仍为 `AddStatus`。

原生代码会按 `Fun` 选择执行路径；`AddStatus` 路径读取单个 `FID`，不因另有 `FIDs` 列表而变成随机施加。状态查询返回空时，该路径进入原生空引用异常入口，没有自动回落到随机功能。此处不能把技能文案的预期效果说成未修改客户端的实际行为。

用户在了解上述差异后，明确选择“采用最小纠正，让这张卡可以计算”。计算器因此只对这一条已识别的原始配置应用纠正；这是一项经授权的配置纠正，不是发现了隐藏状态，也不是官方已修复的证明。网页不添加推测性机制说明。

## APK 内原始数据

技能原始字段：

```text
Fun#{Fun:"AddStatus",Rate:0.75,FID:"RandomAddStatus",FIDs:["Silence","Unhealable","ReduceAttack","ReduceDef"],StatusRound:1}
```

纠正后的执行字段：

```text
Fun#{Fun:"RandomAddStatus",Rate:0.75,FIDs:["Silence","Unhealable","ReduceAttack","ReduceDef"],StatusRound:1}
```

仅改变 `Fun` 并移除错误的单值 `FID`。保留 75% 基础概率、原有四个候选及 1 回合持续时间，沿用现有命中、抵抗、免疫和状态生命周期处理。

| 候选 | 状态名称 | 原状态作用 |
|---|---|---|
| `Silence` | 息声 | `Silence#1` |
| `Unhealable` | 封愈 | `SealHeal#1` |
| `ReduceAttack` | 攻击下降 | `AttackFinalRate#-0.2` |
| `ReduceDef` | 防御下降 | `DefenceFinalRate#-0.2` |

这条技能明确指定 `StatusRound:1`，覆盖攻击下降、防御下降状态自身的默认 2 回合。75% 是基础功能概率，并非免疫、闪避和效果抵抗处理后的最终成功率。

直接从未修改 APK 重新读取以下两个 Unity TextAsset，并与研究用表逐行比较，内容一致；没有使用本地服修改后的规则冒充官方原始数据：

- `skill.txt_1274c0a3c21e26f126167410d63a7207.bundle`
- `status.txt_1011cc8f3913efeeffb23591cc83ee4c.bundle`

原生库亦与该 APK 中的 `lib/arm64-v8a/libil2cpp.so` SHA256 一致：

```text
8dd87b18e1f32041faaa8f32366175afb8044772cbdf3d15ff04413595a75e35
```

## 原生路径证据

| 方法 | RVA | 观察 |
|---|---|---|
| `SkillFunctionInfo.ProcessFuncToRole` | `0x2351358` | 按 `Fun` 枚举查跳转表 |
| `AddStatusToRole(context,param)` | `0x2351544` | 从实例 `+0x90` 读取 `FID`，进入 `0x235775C` |
| `AddRandomStatusToRole` | `0x235154C` | 从 `+0xA0` 取得 `FIDs` 副本；随机取候选，再调用单状态施加 |
| `AddStatusToRole(context,param,id)` | `0x235775C` | 在 `0x2357844` 调用状态查询；空值在 `0x2357848` 跳向 `0x2357C40` 的异常入口 |
| `StatusStaticData.GetStaticData` | `0x237BABC` | 从状态字典查 ID；未找到返回空，没有按功能名生成状态的分支 |
| `StatusStaticData.<InitStaticDatas>b__4_0` | `0x23862C0` | 把表中非空 ID 写入状态字典，没有特殊随机状态生成 |

用 Unicorn 执行原始 ARM64 `ProcessFuncToRole` 的入口与跳转表，限制为最多 100 条指令及 1 秒，分别得到：

| 输入 | 实际抵达入口 | 单值 FID |
|---|---|---|
| `Fun=AddStatus`，保留非空候选列表 | `0x235775C` | 转发原 `FID` 指针 |
| `Fun=RandomAddStatus` | `0x235154C` | 不走单值 FID 分发 |

这是原始分发代码的隔离执行核查，不是修改后技能的游戏实战。当前没有为这张未来卡取得官方服实战样本。网络检查本轮未能连接官方接口，不能据此声称 014517 之后的官方版本也相同。

可复现工具：[`audit_random_status.py`](../scripts/audit_random_status.py)。需要 `pyelftools`、`capstone`、`unicorn`，校验原 APK 时还需要 `UnityPy`。输出 JSON 包含输入文件摘要及分发结果；汇编导出使用明确的函数范围，避免将通用方法间的空缺误当成一个巨大函数。

本轮执行结果保存在[`random_status_native.json`](random_status_native.json)。

```powershell
python scripts/audit_random_status.py --research <配对的014517研究目录> --tables <原始表目录> --apk <官方APK> --out <输出目录>
```

## 实现边界与检查

[`config_engine.js`](../src/calculator/config_engine.js) 在复制配置时纠正，原始 `DATA`、原文和图片不改。匹配范围同时限定：

1. 客户端版本 `1.0.1.014517`，且状态表中没有 `RandomAddStatus`。
2. 技能 `C03_SSR_012S1` 的 `DynamicField1`。
3. 原始功能的全部 5 个字段、字段值及候选顺序完全匹配。

版本、技能、字段、概率、候选或其他参数改变时，不使用这条例外。其他缺失状态仍停止计算，不作通用猜测或跳过。

[`test_random_status.cjs`](../tests/test_random_status.cjs) 检查原数据不变、精确匹配边界、四个候选、1 回合期限、基础概率/抗性/免疫门控、0～5 星与两种对手的 36 组场景、固定种子复现。连续混合队伍检查重新纳入此卡，其他原生标量与实测样本检查继续保留。
