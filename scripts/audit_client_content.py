"""只读核查两站全部卡牌阅读数据，并可逐字段对照客户端原表。"""
from __future__ import annotations

import argparse
from copy import deepcopy
import csv
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import sys

from embedded import extract

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_014774 = {
    'cards': 192, 'playerSkills': 583, 'librarySkills': 586,
    'statuses': 97, 'imprintRows': 960, 'ascendRows': 260,
}
APPROVED_CONFIG_CORRECTIONS = {'C03_SSR_012S1'}
RESIDUAL = re.compile(r'\b(?:T|UI)_[A-Za-z0-9_]+|[\[\]\ufffd]|<[^>]+>|\\n')


def load_published(root=ROOT):
    return (
        extract((root / 'docs/index.html').read_text('utf8'), 'DATA'),
        extract((root / 'docs/catalog.html').read_text('utf8'), 'DATA'),
    )


def raw_config_view(configs):
    """图鉴把非Fun属性包入对象；转换后只比较实际字段与值。"""
    return [{'field': item['field'], 'value': item['value'] if item['key'] == 'Fun'
             else {item['key']: item['value']}} for item in configs]


def audit_published(calculator, catalog):
    """仅依赖已构建页面，可在无本地客户端原包的环境执行。"""
    errors = []

    def require(ok, path, detail):
        if not ok:
            errors.append({'path': path, 'error': detail})

    def text(value, path, required=True):
        require(isinstance(value, str), path, '正文须为字符串')
        if not isinstance(value, str):
            return
        require(bool(value.strip()) or not required, path, '正文为空')
        require(not RESIDUAL.search(value), path, '正文含内部索引、残余括号或未解析标记')

    cards = {card['id']: card for card in calculator['cards']}
    cat_cards = {card['id']: card for card in catalog['cards']}
    skills, statuses = calculator['skills'], calculator['statuses']
    facts = {
        'cards': len(cards), 'catalogCards': len(cat_cards),
        'playerSkills': sum(len(card['skills']) for card in calculator['cards']),
        'catalogSkills': sum(len(card['skills']) for card in catalog['cards']),
        'librarySkills': len(skills), 'statuses': len(statuses),
        'imprintRows': sum(len(card['imprint']) for card in calculator['cards']),
        'ascendRows': sum(len(card['ascend']) for card in calculator['cards']),
        'catalog': calculator.get('catalog'),
        'sourceEmptySkillDescriptions': sorted(sid for sid, skill in skills.items()
                                               if not skill['raw'].get('Description')),
        'enhanceSkillReferences': 0, 'enhanceSkillS4': [],
    }
    require(len(cards) == len(calculator['cards']), 'calculator.cards', '卡牌编号重复')
    require(len(cat_cards) == len(catalog['cards']), 'catalog.cards', '卡牌编号重复')
    require(cards.keys() == cat_cards.keys(), 'cards', '两站卡牌集合不同')
    require(calculator.get('catalog') == catalog.get('catalog'), 'catalog', '两站资源目录版本不同')
    require(calculator.get('asOf') == catalog.get('asof'), 'asOf', '两站数据日期不同')
    if facts['catalog'] == 'catalog_014774':
        for key, value in EXPECTED_014774.items():
            require(facts[key] == value, key, f'预期{value}，实际{facts[key]}')
    glossary = {row['id']: row for row in calculator.get('glossary', [])}
    cat_glossary = {row['id']: row for row in catalog.get('glossary', [])}
    require(bool(glossary), 'glossary', '共享词典为空')
    require(len(glossary) == len(calculator.get('glossary', [])), 'glossary', '词条编号重复')
    require(glossary == cat_glossary, 'glossary', '两站词典不同')
    for sid, entry in glossary.items():
        text(entry.get('name'), 'glossary.' + sid + '.name')
        text(entry.get('description'), 'glossary.' + sid + '.description')
    for sid, skill in skills.items():
        text(skill.get('name'), 'skills.' + sid + '.name')
        text(skill.get('description'), 'skills.' + sid + '.description')
        ids = skill.get('glossaryIds', [])
        require(ids == sorted(set(ids)), 'skills.' + sid + '.glossaryIds', '词条引用未排序或有重复')
        require(set(ids) <= glossary.keys(), 'skills.' + sid + '.glossaryIds', '引用了未定义词条')
        if not skill['raw'].get('Description'):
            require(skill.get('descriptionSource') == 'configuration', 'skills.' + sid,
                    '源空说明须明确来自配置生成')
    for sid, status in statuses.items():
        text(status.get('name'), 'statuses.' + sid + '.name', required=False)
        text(status.get('description'), 'statuses.' + sid + '.description', required=False)
        if not status.get('name') or not status.get('description'):
            require(sid not in glossary, 'glossary.' + sid, '内部空说明状态进入了正式词典')
    for cid, card in cards.items():
        other = cat_cards.get(cid)
        if other is None:
            continue
        path = 'cards.' + cid
        text(card.get('name'), path + '.name')
        require(card['name'] == other['name'], path + '.name', '两站卡名不同')
        item = card.get('itemRaw', {})
        require(item.get('ID') == cid, path + '.itemRaw', '卡牌道具原行缺失或错配')
        require(other.get('item_tags') == item.get('Tags', '').split('~'), path + '.item_tags', '图鉴道具标签与当前道具表不同')
        require(other.get('version_gate') == (card['raw'].get('VersionControl') or item.get('VersionControl', '')),
                path + '.version_gate', '图鉴版本门槛与当前原字段不同')
        require(card['skills'] == [skill['id'] for skill in other['skills']], path + '.skills',
                '两站技能范围或顺序不同')
        require(card.get('glossaryIds', []) == sorted(set(card.get('glossaryIds', []))),
                path + '.glossaryIds', '卡牌词条引用未排序或有重复')
        require(set(card.get('glossaryIds', [])) == set(other.get('statusIds', [])),
                path + '.statusIds', '两站卡牌词典范围不同')
        require(set(card.get('glossaryIds', [])) <= glossary.keys(), path + '.glossaryIds',
                '卡牌引用了未定义词条')
        for item in other['skills']:
            sid = item['id']
            require(sid in skills, path + '.skills.' + sid, '技能库缺少引用技能')
            if sid not in skills:
                continue
            expected = skills[sid]
            for key in ('name', 'description', 'damageTarget'):
                require(item.get(key) == expected.get(key), path + '.' + sid + '.' + key,
                        '两站技能正文不同')
            require(item.get('row') == expected['raw'], path + '.' + sid + '.row', '两站技能原字段不同')
            require(item.get('configs') == raw_config_view(expected['configs']),
                    path + '.' + sid + '.configs', '两站技能效果配置不同')
            require(item.get('displayConfigs') == raw_config_view(expected.get('displayConfigs', [])),
                    path + '.' + sid + '.displayConfigs', '两站有效配置展示不同')
        for kind in ('imprint', 'ascend'):
            source_stages = card[kind]
            target_stages = other[kind]
            require(len(source_stages) == len(target_stages), path + '.' + kind, '两站强化阶段数量不同')
            for stage, target in zip(source_stages, target_stages):
                here = path + '.' + kind + '.' + stage['LV']
                for key, value in stage.items():
                    if key not in ('description', 'configs'):
                        require(target.get(key) == value, here + '.' + key, '两站强化原字段不同')
                require(stage.get('description', '') == target.get('text', ''), here + '.text',
                        '两站强化正文不同')
                require(stage.get('configs', []) == target.get('configs', []), here + '.configs',
                        '两站强化配置不同')
                text(stage.get('description', ''), here + '.description', required=False)
                sid = stage.get('EnhanceSkill')
                if sid:
                    facts['enhanceSkillReferences'] += 1
                    require(sid in card['skills'], here + '.EnhanceSkill', '解锁技能不在本卡技能范围')
                    require(sid in skills and bool(skills[sid]['description']), here + '.EnhanceSkill',
                            '解锁技能缺少有效说明')
                    if sid.endswith('S4'):
                        facts['enhanceSkillS4'].append(sid)
    return {'facts': facts, 'errors': errors}


def read_table(directory, name):
    """原表读取独立于同步脚本，以全部CSV字段作逐项比较。"""
    with (directory / (name + '.txt')).open(encoding='utf-8-sig', newline='') as stream:
        return list(csv.DictReader(stream, delimiter='@', quoting=csv.QUOTE_NONE))


def local_dependencies():
    # 正常环境可安装OpenCC与json5；此项目同时保留已有离线依赖目录。
    local = ROOT.parents[1] / '_工作目录/角色活动图鉴/libs'
    if local.exists():
        sys.path.insert(0, str(local))
    import json5
    from opencc import OpenCC
    return json5, OpenCC('t2s').convert


def audit_sources(calculator, catalog, tables, locale):
    from client_text import ClientText
    from client_presentation import enrich

    result = audit_published(calculator, catalog)
    errors = result['errors']
    json5, convert = local_dependencies()
    text = ClientText(locale, tables, convert)
    source = {name: read_table(tables, name) for name in
              ('role', 'skill', 'status', 'roleimprint', 'roleascend', 'item', 'roleproperty')}
    maps = {name: {row['ID']: row for row in source[name]} for name in ('role', 'skill', 'status')}
    item_map = {row['ID']: row for row in source['item']}
    property_rows = {}
    for row in source['roleproperty']:
        property_rows.setdefault(row['ID'], []).append(row)
    expected = deepcopy(calculator)

    def require(ok, path, detail):
        if not ok:
            errors.append({'path': path, 'error': detail})

    player_ids = {identifier for identifier in maps['role'] if re.fullmatch(r'C\d+_(?:SSR|SR|R)_\d+', identifier)}
    require(player_ids == {card['id'] for card in calculator['cards']}, 'cards.sourceCoverage',
            '官方玩家卡集合与发布卡牌集合不同')

    inactive_source_orphans = []

    def check_effect_references(value, path, inactive=False):
        if isinstance(value, list):
            for index, item in enumerate(value):
                check_effect_references(item, f'{path}[{index}]', inactive)
        elif isinstance(value, dict):
            if value.get('Fun') in ('AddStatus', 'RandomAddStatus'):
                identifiers = ([value['FID']] if value.get('FID') and value['FID'] != 'RandomAddStatus' else []) + value.get('FIDs', [])
                for identifier in identifiers:
                    require(identifier in calculator['statuses'], path + '.status.' + identifier,
                            '效果引用状态未纳入计算器状态库')
            if value.get('Fun') in ('ReplaceSkill', 'AdditionSkill') and value.get('FID'):
                if inactive and value['FID'] not in maps['skill']:
                    inactive_source_orphans.append({'path': path, 'skill': value['FID']})
                else:
                    require(value['FID'] in calculator['skills'], path + '.skill.' + value['FID'],
                            '辅助动作引用未纳入技能库')
            for key, item in value.items():
                check_effect_references(item, path + '.' + key, inactive)

    for identifier, skill in calculator['skills'].items():
        check_effect_references(skill['configs'], 'skills.' + identifier)
    for card in calculator['cards']:
        check_effect_references(card['configs'], 'cards.' + card['id'])
        for kind in ('imprint', 'ascend'):
            check_effect_references([r['configs'] for r in card[kind]], 'cards.' + card['id'] + '.' + kind, kind == 'ascend')

    def configs(raw, prefix='DynamicField'):
        found = []
        for field, value in raw.items():
            if not value or '#' not in value:
                continue
            if not (field.startswith(prefix) or prefix == 'DynamicField' and field.startswith('PassiveProp.DynamicField')):
                continue
            key, payload = value.split('#', 1)
            try:
                payload = json5.loads(payload)
            except (ValueError, TypeError):
                pass
            found.append({'key': key, 'value': payload, 'raw': value, 'field': field})
        return found

    unresolved_names = []
    checked_level_rows = 0
    checked_display_rows = 0
    for kind in ('skills', 'statuses'):
        table, name_field = ('skill', 'NAME') if kind == 'skills' else ('status', 'Name')
        for identifier, published in calculator[kind].items():
            raw = maps[table].get(identifier)
            require(raw is not None, kind + '.' + identifier, '官方原表缺少本条目')
            if raw is None:
                continue
            require(published['raw'] == raw, kind + '.' + identifier + '.raw', '发布原字段与官方原表不一致')
            translated_name, translated_description = text(raw[name_field]), text(raw['Description'])
            if translated_name:
                require(published['name'] == translated_name, kind + '.' + identifier + '.name', '正文与受保护中文来源不一致')
            elif raw[name_field]:
                unresolved_names.append({'table': table, 'id': identifier,
                                         'key': raw[name_field], 'published': published['name']})
            if raw['Description']:
                require(bool(translated_description), kind + '.' + identifier + '.description', '原文索引缺少受保护的中文定义')
            item = expected[kind][identifier]
            item.update(raw=raw, description=translated_description)
            if translated_name or kind == 'statuses':
                item['name'] = translated_name
            parsed = configs(raw)
            if identifier not in APPROVED_CONFIG_CORRECTIONS:
                require(published['configs'] == parsed, kind + '.' + identifier + '.configs', '解析效果与官方原字段不一致')
                item['configs'] = parsed
    for card in expected['cards']:
        cid = card['id']
        raw = maps['role'].get(cid)
        require(raw is not None, 'cards.' + cid, '官方角色表缺少卡牌')
        if raw is None:
            continue
        require(card['raw'] == raw, 'cards.' + cid + '.raw', '角色原字段不一致')
        require(card.get('itemRaw') == item_map.get(cid), 'cards.' + cid + '.itemRaw', '卡牌道具原行与当前源表不同')
        require(card['skills'] == [value.split(':')[0] for value in raw['SkillIDs'].split('~') if value],
                'cards.' + cid + '.skills', '技能槽与官方角色表不一致')
        require(card.get('hiddenSkills') == [value.split(':')[0] for value in raw['SkillIDs'].split('~') if ':Hide' in value],
                'cards.' + cid + '.hiddenSkills', '隐藏技能标记与原表不同')
        require(card.get('ai') == (raw['AIs'].split('~') if raw['AIs'] else []),
                'cards.' + cid + '.ai', '行动规则引用与原表不同')
        originals = property_rows.get(raw['RolePropertyID'], [])
        levels = {row['level']: row for row in card.get('levelStats', [])}
        require(len(levels) == len(card.get('levelStats', [])) == len(originals),
                'cards.' + cid + '.levelStats', '等级属性行缺失或重复')
        cat_card = next((item for item in catalog['cards'] if item['id'] == cid), {})
        display_levels = {int(row['level']): row for row in cat_card.get('stats', [])}
        for base in originals:
            level = int(base['LV'])
            here = 'cards.' + cid + '.levelStats.' + str(level)
            actual = levels.get(level)
            require(actual is not None, here, '缺少原表等级')
            if actual is None:
                continue
            require(actual.get('raw') == base, here + '.raw', '等级属性原行与源表不同')
            expected_stats = {}
            for key in ('HP', 'Attack', 'Defence', 'Speed', 'CriticalRate',
                        'CriticalDamageRate', 'EffectHitRate', 'ResistanceRate', 'PinchRate'):
                if base.get(key):
                    multiplier = struct.unpack('<f', struct.pack('<f', float(raw[key]) if raw.get(key) else 1))[0]
                    expected_stats[key] = float(base[key]) * multiplier
            expected_stats['MaxHP'] = expected_stats.get('HP', 0)
            require(actual.get('stats') == expected_stats, here + '.stats', '等级属性与原表及角色倍率不同')
            checked_level_rows += 1
            if level in display_levels:
                displayed = display_levels[level]
                for key, number in expected_stats.items():
                    if key in ('HP', 'MaxHP', 'Attack', 'Defence', 'Speed'):
                        number = struct.unpack('<f', struct.pack('<f', number))[0]
                        number = round(number) if key in ('HP', 'MaxHP', 'Speed') else math.trunc(number)
                    require(displayed.get(key) == number, here + '.display.' + key, '图鉴基础面板数值错误')
                checked_display_rows += 1
        parsed_card_configs = configs(raw)
        require(card['configs'] == parsed_card_configs, 'cards.' + cid + '.configs',
                '角色效果解析与官方原字段不一致')
        card['configs'] = parsed_card_configs
        localized_name = text(raw['NAME']) or text(item_map.get(cid, {}).get('Name',''))
        if localized_name:
            require(card['name'] == localized_name, 'cards.' + cid + '.name', '卡名与中文原文不同')
        for kind, table in (('imprint', 'roleimprint'), ('ascend', 'roleascend')):
            originals = [row for row in source[table] if row['RoleID'] == cid]
            require(len(card[kind]) == len(originals), 'cards.' + cid + '.' + kind, '强化阶段与官方表数量不同')
            stages = {row['LV']: row for row in card[kind]}
            for raw_stage in originals:
                stage = stages.get(raw_stage['LV'])
                here = 'cards.' + cid + '.' + kind + '.' + raw_stage['LV']
                require(stage is not None, here, '缺少官方强化阶段')
                if stage is None:
                    continue
                require(all(stage.get(key) == value for key, value in raw_stage.items()), here, '强化原字段与官方表不一致')
                localized = text(raw_stage['Description'])
                require(stage.get('description', '') == localized, here + '.description', '强化说明与中文原文不同')
                parsed = configs(raw_stage, 'SkillProp.')
                require(stage.get('configs', []) == parsed, here + '.configs', '强化效果解析与原表不一致')
                stage.update(description=localized, configs=parsed)
    try:
        enrich(expected, text)
    except (ValueError, KeyError, TypeError) as error:
        errors.append({'path': 'expected.presentation', 'error': str(error)})
        return result
    for sid, skill in expected['skills'].items():
        actual = calculator['skills'][sid]
        for field in ('description', 'glossaryIds', 'damageTarget', 'displayConfigs'):
            require(actual.get(field) == skill.get(field), 'skills.' + sid + '.' + field,
                    '说明或术语闭包与原文链接及原效果不一致')
    for original, actual in zip(expected['cards'], calculator['cards']):
        require(original['glossaryIds'] == actual.get('glossaryIds'), 'cards.' + original['id'] + '.glossaryIds',
                '卡牌词典没有覆盖技能、升星、预置强化及状态递归引用')
    require(expected['glossary'] == calculator.get('glossary'), 'glossary', '共享词典与官方状态/功能中文定义不一致')
    result['facts'].update(
        localizedFallbackKeysUsed=len(text.used_fallbacks),
        missingSourceTextKeys=sorted(text.missing),
        sourceMissingNameDefinitions=unresolved_names,
        sourceDescriptionEmptyStatusIds=sorted(row['ID'] for row in source['status'] if not row['Description']),
        approvedConfigCorrections=sorted(APPROVED_CONFIG_CORRECTIONS),
        inactiveSourceOrphanReferences=inactive_source_orphans,
        checkedLevelRows=checked_level_rows,
        checkedDisplayRows=checked_display_rows,
    )
    result['sources'] = {name: hashlib.sha256((tables / (name + '.txt')).read_bytes()).hexdigest()
                         for name in source}
    result['sources'].update({language: hashlib.sha256((locale / language).read_bytes()).hexdigest()
                              for language in ('CHT', 'CHS')})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', type=Path, required=True)
    parser.add_argument('--locale', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    calculator, catalog = load_published()
    report = audit_sources(calculator, catalog, args.tables, args.locale)
    report['ok'] = not report['errors']
    report['errorCount'] = len(report['errors'])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', 'utf8')
    print(json.dumps({'ok': report['ok'], 'errors': report['errorCount'], 'facts': {k:v for k,v in report['facts'].items() if isinstance(v,(int,str))},
                      'output': str(args.output)}, ensure_ascii=False))
    return int(bool(report['errors']))


if __name__ == '__main__':
    raise SystemExit(main())
