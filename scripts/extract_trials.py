"""从客户端原表生成普通试炼 1 至 50 层的计算器数据，全程离线。"""

from __future__ import annotations

import argparse
from collections import deque
import copy
import csv
import hashlib
import importlib
import json
from pathlib import Path
import re
import struct
import sys


REPO = Path(__file__).resolve().parents[1]
DEFAULT_TABLES = Path(r"D:\GodlyLove\_server\data_014517")
DEFAULT_LOCALE = Path(r"D:\GodlyLove\_工作目录\角色HTML\tables")
DEFAULT_LIBS = Path(r"D:\GodlyLove\_工作目录\角色活动图鉴\libs")
TABLE_NAMES = ("scene", "chapter", "role", "roleproperty", "skill", "status", "aiaction")
STAT_NAMES = ("HP", "Attack", "Defence", "Speed", "CriticalRate", "CriticalDamageRate", "EffectHitRate", "ResistanceRate", "PinchRate")
SKILL_REFERENCE_FIELDS = ("TwinSkill", "ReferanceSkillID", "LevelSkillID")
SKILL_FUNCTIONS = {"AdditionSkill", "ReplaceSkill", "CounterSkill", "AddPinchSkill"}
VERSION = "1.0.1.014517"


def require_file(path: Path) -> Path:
    if not path.is_file():
        raise ValueError(f"缺少源文件：{path}")
    return path


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def f32(value: float) -> float:
    return struct.unpack("<f", struct.pack("<f", value))[0]


def read_rows(path: Path) -> list[dict]:
    with require_file(path).open(encoding="utf-8-sig", newline="") as stream:
        result = list(csv.DictReader(stream, delimiter="@", quoting=csv.QUOTE_NONE))
    if not result or any(None in row for row in result):
        raise ValueError(f"源表为空或分隔字段错误：{path}")
    return result


def load_dependencies(libs: Path):
    if libs.is_dir():
        sys.path.insert(0, str(libs))
    try:
        json5 = importlib.import_module("json5")
        convert = importlib.import_module("opencc").OpenCC("t2s").convert
    except ImportError as error:
        raise ValueError(f"缺少离线依赖 json5 或 opencc，请用 --libs 指定已有依赖目录：{error}") from error
    return json5, convert


def load_locale(directory: Path, convert):
    mapping = {}
    paths = [require_file(directory / language) for language in ("CHT", "CHS")]
    for path in paths:
        for line in path.read_text(encoding="utf-8-sig").splitlines()[1:]:
            if "@" in line:
                key, value = line.split("@", 1)
                mapping[key] = value

    def translate(value: str) -> str:
        return convert(re.sub(r"<[^>]+>", "", mapping.get(value, value)).replace("\\n", "\n"))

    return translate, paths


def extract_embedded_data(path: Path) -> dict:
    html = require_file(path).read_text(encoding="utf-8")
    marker = "const DATA="
    if marker not in html:
        raise ValueError(f"既有计算器缺少 DATA 数据：{path}")
    return json.JSONDecoder().raw_decode(html[html.index(marker) + len(marker):])[0]


def generate(args):
    json5, convert = load_dependencies(args.libs)
    translate, locale_paths = load_locale(args.locale, convert)
    tables = {name: read_rows(args.tables / f"{name}.txt") for name in TABLE_NAMES}
    rows = {name: {row["ID"]: row for row in tables[name]} for name in TABLE_NAMES if name not in ("roleproperty", "aiaction")}
    properties = {(row["ID"], int(row["LV"])): row for row in tables["roleproperty"]}
    published = extract_embedded_data(args.baseline_html)
    baseline_50 = published.get("tower50")
    if not baseline_50 or baseline_50.get("version") != VERSION:
        raise ValueError("既有计算器缺少同版本 tower50，无法完成兼容性核对。")

    def configs(row):
        result = []
        for field, raw in row.items():
            if not raw or "#" not in raw or not field.startswith(("DynamicField", "PassiveProp.DynamicField")):
                continue
            key, value = raw.split("#", 1)
            try:
                value = json5.loads(value)
            except (ValueError, TypeError):
                pass
            result.append({"key": key, "value": value, "raw": raw, "field": field})
        return result

    def definition(kind, identifier):
        raw = rows[kind][identifier]
        return {"id": identifier, "name": translate(raw["NAME" if kind == "skill" else "Name"]), "description": translate(raw["Description"]), "raw": raw, "configs": configs(raw)}

    def closure(enemies):
        skill_queue = deque(sid for enemy in enemies for sid in enemy["skills"])
        status_queue = deque()
        selected_skills, selected_statuses, missing = {}, {}, set()

        def collect(value):
            if isinstance(value, dict):
                if value.get("Fun") in SKILL_FUNCTIONS:
                    skill_queue.extend(part.split(":", 1)[0] for part in str(value.get("FID", "")).split("~") if part)
                for item in value.values():
                    collect(item)
            elif isinstance(value, list):
                for item in value:
                    collect(item)
            elif isinstance(value, str):
                for item in value.split("~"):
                    if item in rows["skill"]:
                        skill_queue.append(item)
                    if item in rows["status"]:
                        status_queue.append(item)

        for enemy in enemies:
            collect(enemy["configs"])
        while skill_queue or status_queue:
            while skill_queue:
                sid = skill_queue.popleft()
                if sid in selected_skills or sid in missing:
                    continue
                if sid not in rows["skill"]:
                    missing.add(sid)
                    continue
                record = selected_skills[sid] = definition("skill", sid)
                for field in SKILL_REFERENCE_FIELDS:
                    skill_queue.extend(part.split(":", 1)[0] for part in record["raw"].get(field, "").split("~") if part)
                collect(record["configs"])
            while status_queue:
                sid = status_queue.popleft()
                if sid in selected_statuses:
                    continue
                record = selected_statuses[sid] = definition("status", sid)
                collect(record["configs"])
        return selected_skills, selected_statuses, sorted(missing)

    def make_enemy(entry, position, level, wave_index):
        rid = entry["M"]
        if rid not in rows["role"]:
            raise ValueError(f"试炼敌方角色缺失：{rid}")
        raw = rows["role"][rid]
        base = properties.get((raw["RolePropertyID"], level))
        if base is None:
            raise ValueError(f"试炼属性基表缺失：{rid}，{raw['RolePropertyID']}，等级 {level}")
        # 原生取值顺序：基表 double × 角色 float32 系数，最终属性读取再转 float32。
        unrounded = {key: float(base[key]) * f32(float(raw[key]) if raw.get(key) else 1.0) for key in STAT_NAMES if base.get(key)}
        unrounded["MaxHP"] = unrounded["HP"]
        stats = {key: f32(unrounded[key]) for key in STAT_NAMES if key in unrounded}
        for key in ("HP", "Attack", "Defence", "Speed"):
            stats[key] = int(stats[key]) if key in ("Attack", "Defence") else round(stats[key])
        stats["MaxHP"] = stats["HP"]
        slots = [part.split(":", 1)[0] for part in raw["SkillIDs"].split("~") if part]
        ai = [part for part in raw["AIs"].split("~") if part]
        match = re.fullmatch(r"Trial_(C\d{2}_(?:SSR|SR|R)_\d{3})(?:_\d+)?", rid)
        if not match or match.group(1) not in rows["role"]:
            raise ValueError(f"无法对应玩家角色：{rid}")
        return {
            "id": rid, "baseCardId": match.group(1), "name": translate(raw["NAME"]), "level": level,
            "element": raw["Element"], "job": raw["Job"], "isBoss": bool(entry.get("Boss", False)),
            "campPosition": position, "waveIndex": wave_index, "skills": slots, "skillSlots": slots[:],
            "hiddenSkills": [part.split(":", 1)[0] for part in raw["SkillIDs"].split("~") if ":Hide" in part],
            "unresolvedSkillIDs": [sid for sid in slots if sid not in rows["skill"]],
            "levelStats": [{"level": level, "stats": unrounded, "raw": base}],
            "stats": stats, "statsUnrounded": unrounded, "initialStatuses": [],
            "configs": configs(raw), "raw": raw, "ai": ai,
            "aiRules": [rule for rule in tables["aiaction"] if rule["ID"] in ai], "imprint": [], "ascend": [],
        }

    trials = {}
    actual_ids = {row["ID"] for row in tables["scene"] if re.fullmatch(r"Trial_\d+", row["ID"])}
    expected_ids = {f"Trial_{floor}" for floor in range(1, 51)}
    if actual_ids != expected_ids:
        raise ValueError(f"普通试炼场景集合异常，缺少 {sorted(expected_ids - actual_ids)}，多出 {sorted(actual_ids - expected_ids)}")
    for floor in range(1, 51):
        scene = rows["scene"][f"Trial_{floor}"]
        chapter = rows["chapter"][scene["Chapter"]]
        level, waves, enemies = int(scene["LV"]), [], []
        for field in ("WaveInfoJsonString", "WaveInfo2JsonString", "WaveInfo3JsonString"):
            if not scene[field]:
                continue
            raw = json5.loads(scene[field])
            wave = {"index": len(waves) + 1, "field": field, "raw": raw, "enemies": []}
            waves.append(wave)
            for position, entry in enumerate(raw.get("Ms", [])):
                enemy = make_enemy(entry, position, level, wave["index"])
                wave["enemies"].append(enemy["id"])
                enemies.append(enemy)
        if len(waves) != 1 or any(scene[key] for key in ("RoleStatusInfo1", "RoleStatusInfo2", "DynamicField1", "DynamicField2", "DynamicField3")):
            raise ValueError(f"第 {floor} 层存在尚需单独处理的波次或关卡附加配置。")
        selected_skills, selected_statuses, missing = closure(enemies)
        trials[str(floor)] = {
            "version": VERSION, "id": scene["ID"], "floor": floor, "name": f"试炼第{floor}层",
            "chapterName": translate(chapter["Name"]), "sceneName": translate(scene["Name"]),
            "sceneNum": translate(scene["SceneNum"]), "level": level,
            "serverBattle": scene["ServerBattle"].upper() == "TRUE", "scene": scene, "chapter": chapter,
            "waves": waves, "enemies": enemies, "skills": selected_skills, "statuses": selected_statuses,
            "unresolvedSkillIDs": missing,
        }

    # 同目录重建时核对旧50层；新资源目录更新时完全采用新表。
    generated_50 = trials["50"]
    for old, new in ([] if args.catalog else zip(baseline_50["enemies"], generated_50["enemies"], strict=True)):
        for key in ("id", "stats", "statsUnrounded", "raw", "configs", "skills", "ai", "aiRules"):
            if old[key] != new[key]:
                raise ValueError(f"既有第50层与源表不一致：{new['id']}，字段 {key}")
        if old["levelStats"][0]["stats"] != new["levelStats"][0]["stats"]:
            raise ValueError(f"既有第50层未取整数值不一致：{new['id']}")
    inherited_50 = copy.deepcopy(generated_50 if args.catalog else baseline_50)
    inherited_50.update({"floor": 50, "name": "试炼第50层"})
    for old, new in zip(inherited_50["enemies"], generated_50["enemies"], strict=True):
        old["baseCardId"] = new["baseCardId"]
    # 旧版备注保存在原有 DATA.tower50；新数据避免携带历史排版分隔符。
    for key in ("notes", "mechanics", "sourceTables"):
        inherited_50.pop(key, None)
    trials["50"] = inherited_50

    all_skills, all_statuses, all_missing = {}, {}, set()
    for trial in trials.values():
        all_skills.update(trial["skills"])
        all_statuses.update(trial["statuses"])
        all_missing.update(trial["unresolvedSkillIDs"])
        floor = trial["floor"]
        bosses = [enemy for enemy in trial["enemies"] if enemy["isBoss"]]
        if len(bosses) != 1:
            raise ValueError(f"第 {floor} 层首领数量异常。")
        expected_stack = "Trial_AttackStack" if floor <= 46 else "Trial_AttackStack_2"
        if expected_stack not in bosses[0]["skills"]:
            raise ValueError(f"第 {floor} 层叠攻技能不符。")
        for enemy in trial["enemies"]:
            if not enemy["aiRules"]:
                raise ValueError(f"敌方 AI 规则缺失：{enemy['id']}")
    if "Trial_C03_R_101S3" not in trials["28"]["enemies"][0]["skills"]:
        raise ValueError("第28层专属被动缺失。")
    if all_missing != {"C04_SR_003S4"} or "C04_SR_003S4" in all_skills:
        raise ValueError(f"悬空技能集合异常：{sorted(all_missing)}")
    for identifier, rate in (("Trial_AttackStack", 0.05), ("Trial_AttackStack_2", 0.15)):
        if not any(item["key"] == "AttackFinalRate" and item["value"] == rate for item in all_statuses[identifier]["configs"]):
            raise ValueError(f"叠攻状态数值异常：{identifier}")

    hashes = {f"{name}.txt": sha256(args.tables / f"{name}.txt") for name in TABLE_NAMES}
    hashes.update({f"locale/{path.name}": sha256(path) for path in locale_paths})
    result = {
        "version": VERSION, "sourceHashes": hashes, "trials": trials,
        "skills": dict(sorted(all_skills.items())), "statuses": dict(sorted(all_statuses.items())),
        "unresolvedSkillIDs": sorted(all_missing),
    }
    if args.catalog:
        result['catalog']=args.catalog
        for trial in trials.values():trial['catalog']=args.catalog
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = {
        "floors": len(trials), "enemies": sum(len(trial["enemies"]) for trial in trials.values()),
        "bosses": sum(enemy["isBoss"] for trial in trials.values() for enemy in trial["enemies"]),
        "minLevel": min(trial["level"] for trial in trials.values()), "maxLevel": max(trial["level"] for trial in trials.values()),
        "skills": len(all_skills), "statuses": len(all_statuses),
        "newSkills": sorted(set(all_skills) - published["skills"].keys()),
        "newStatuses": sorted(set(all_statuses) - published["statuses"].keys()),
        "unresolvedSkillIDs": sorted(all_missing), "sha256": sha256(args.output), "output": str(args.output),
    }
    if args.audit:
        write_audit(args.audit, result, summary, published)
    return summary


def write_audit(path, result, summary, published):
    lines = [
        "# 普通试炼数据提取核查", "", f"客户端版本：{VERSION}", "",
        f"覆盖普通试炼第1至50层，共 {summary['enemies']} 个敌方单位，其中首领 {summary['bosses']} 个，随从 {summary['enemies'] - summary['bosses']} 个。",
        f"等级范围 {summary['minLevel']} 至 {summary['maxLevel']}，每层均为单波，关卡 RoleStatusInfo1/2 和 DynamicField1/2/3 全部为空。", "",
        f"技能闭包 {summary['skills']} 个，状态闭包 {summary['statuses']} 个。相对既有 DATA.skills 新增 {len(summary['newSkills'])} 个技能，相对 DATA.statuses 新增 {len(summary['newStatuses'])} 个状态。",
        "", "## 关键断言", "",
        "- 第1至46层首领使用 Trial_AttackStack，每次自身行动前增加5%攻击加成。",
        "- 第47至50层首领使用 Trial_AttackStack_2，每次自身行动前增加15%攻击加成。",
        "- 第28层使用专属被动 Trial_C03_R_101S3。",
        "- 第50层各敌方角色原配置、AI规则、显示属性及引擎未取整属性均按本次源表重新生成。",
        "- C04_SR_003S4 在源技能表中缺失，保留悬空引用，未创建定义。",
        "- 全部敌方单位均保留玩家卡牌对应编号 baseCardId、原始配置、技能槽、隐藏技能、AI与属性。",
        "- HP与Speed先转float32再取偶数舍入，Attack与Defence先转float32再截断；levelStats.stats保留基表double乘float32系数的未取整数值。", "",
        "## 各层配置", "", "| 层数 | 等级 | 首领 | 随从 |", "|---:|---:|---|---|",
    ]
    for trial in result["trials"].values():
        boss = next(enemy for enemy in trial["enemies"] if enemy["isBoss"])
        companions = "、".join(enemy["name"] + "（" + enemy["id"] + "）" for enemy in trial["enemies"] if not enemy["isBoss"]) or "无"
        lines.append(f"| {trial['floor']} | {trial['level']} | {boss['name']}（{boss['id']}） | {companions} |")
    lines.extend(["", "## 新增定义", "", "技能：" + "、".join(summary["newSkills"]), "", "状态：" + "、".join(summary["newStatuses"]), "", "## 源表校验", ""])
    lines.extend(f"- {name}：`{value}`" for name, value in result["sourceHashes"].items())
    lines.extend(["", f"输出文件SHA256：`{summary['sha256']}`", ""])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tables", type=Path, default=DEFAULT_TABLES, help="客户端原始表目录")
    parser.add_argument("--locale", type=Path, default=DEFAULT_LOCALE, help="包含CHT和CHS的文本目录")
    parser.add_argument("--libs", type=Path, default=DEFAULT_LIBS, help="已有json5和opencc离线依赖目录")
    parser.add_argument("--baseline-html", type=Path, default=REPO / "docs" / "index.html", help="含既有DATA.tower50的计算器HTML")
    parser.add_argument("--output", type=Path, default=REPO / "src" / "calculator" / "trials.json")
    parser.add_argument("--audit", type=Path, help="可选核查报告输出路径")
    parser.add_argument("--catalog", help="更新资源目录时传入目录名，使用新表生成第50层")
    args = parser.parse_args()
    try:
        print(json.dumps(generate(args), ensure_ascii=False, indent=2))
    except (ValueError, OSError, KeyError) as error:
        parser.exit(1, f"提取失败：{error}\n")


if __name__ == "__main__":
    main()
