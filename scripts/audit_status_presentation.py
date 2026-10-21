"""输出状态、成长、词典及字段翻译的独立覆盖矩阵，不修改页面。"""
from pathlib import Path
import argparse
from collections import Counter, defaultdict
import csv
import json
import sys

from embedded import extract

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TABLES = ROOT.parents[1] / '_工作目录/update_20261020/tables'


def rows(path):
    with path.open(encoding='utf-8-sig', newline='') as stream:
        return list(csv.DictReader(stream, delimiter='@', quoting=csv.QUOTE_NONE))


def walk(value, path='$'):
    if isinstance(value, dict):
        for key, item in value.items():
            yield path + '.' + key, key, item
            yield from walk(item, path + '.' + key)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from walk(item, path + '[' + str(index) + ']')


def audit(tables):
    calculator = extract((ROOT / 'docs/index.html').read_text('utf8'), 'DATA')
    catalog = extract((ROOT / 'docs/catalog.html').read_text('utf8'), 'DATA')
    statuses = calculator['statuses']
    source_statuses = {row['ID']: row for row in rows(tables / 'status.txt')}
    source_growth = {kind: {(row['RoleID'], row['LV']): row for row in rows(tables / (table + '.txt'))}
                     for kind, table in (('imprint', 'roleimprint'), ('ascend', 'roleascend'))}
    glossary = {row['id']: row for row in calculator['glossary']}
    references = defaultdict(set)
    who_target = []
    growth = []
    dropped_properties = []
    untranslated = Counter()
    for card in calculator['cards']:
        configs = list(card['configs'])
        for identifier in card['skills']:
            skill = calculator['skills'][identifier]
            configs += skill['configs']
            for path, key, value in walk(skill['configs']):
                if key == 'Who' and value == 'Target':
                    who_target.append({'card': card['id'], 'skill': identifier, 'path': path,
                                       'unscopedLookup': catalog['values'].get(value)})
                if isinstance(value, str) and value and key not in ('field', 'raw', 'ID', 'key'):
                    if value not in catalog['values']:
                        untranslated[(key, value)] += 1
        for kind, table_name in (('imprint', 'roleimprint'), ('ascend', 'roleascend')):
            originals = source_growth[kind]
            for row in card[kind]:
                raw = originals[(card['id'], row['LV'])]
                configs += row['configs']
                growth.append({'card': card['id'], 'kind': kind, 'level': row['LV'],
                               'sourceFieldsMatch': all(row.get(key) == value for key, value in raw.items()),
                               'hasDescription': bool(row['description']), 'unlock': row['EnhanceSkill'],
                               'configCount': len(row['configs'])})
                for config in row['configs']:
                    if config['key'] != 'Fun':
                        dropped_properties.append({'card': card['id'], 'kind': kind, 'level': row['LV'],
                                                   'property': config['key'], 'value': config['value']})
        for path, key, value in walk(configs):
            if key in ('FID', 'FIDs', 'PropertyID', 'CheckID', 'GroupID'):
                identifiers = value if isinstance(value, list) else str(value).split('~')
                for identifier in identifiers:
                    if identifier in statuses:
                        references[identifier].add(card['id'])
    status_matrix = []
    for identifier, status in statuses.items():
        status_matrix.append({'id': identifier, 'name': status['name'],
                              'sourceFieldsMatch': status['raw'] == source_statuses.get(identifier),
                              'hasDescription': bool(status['description']),
                              'dictionaryContains': identifier in glossary,
                              'referencedPlayerCards': sorted(references[identifier])})
    source_empty_used = [row for row in status_matrix if row['name'] and not row['hasDescription']
                         and row['referencedPlayerCards']]
    return {
        'catalog': calculator.get('catalog'),
        'coverage': {
            'cards': len(calculator['cards']), 'skills': len(calculator['skills']),
            'statuses': len(status_matrix),
            'statusRawMatches': sum(row['sourceFieldsMatch'] for row in status_matrix),
            'statusOfficialDescriptions': sum(row['hasDescription'] for row in status_matrix),
            'statusOfficialDescriptionsInDictionary': sum(row['hasDescription'] and row['dictionaryContains']
                                                         for row in status_matrix),
            'uiDictionaryEntries': len(set(glossary) - set(statuses)),
            'imprintRows': sum(row['kind'] == 'imprint' for row in growth),
            'ascendRows': sum(row['kind'] == 'ascend' for row in growth),
            'growthRawMatches': sum(row['sourceFieldsMatch'] for row in growth),
            'whoTargetOccurrences': len(who_target),
            'whoTargetSkills': len({row['skill'] for row in who_target}),
            'namedSourceEmptyStatusesUsedByPlayers': len(source_empty_used),
        },
        'statusMatrix': status_matrix, 'growthMatrix': growth,
        'whoTargetContexts': who_target,
        'staticGrowthProperties': dropped_properties,
        'namedSourceEmptyStatusesUsedByPlayers': source_empty_used,
        'unscopedUntranslatedValues': [{'field': key, 'value': value, 'occurrences': count}
                                       for (key, value), count in untranslated.most_common()],
        'notes': [
            'unscopedLookup记录历史通用字典的碰撞；实际是否已修复由界面执行回归确认。',
            '源空的内部计数标记无需虚构正文。功能值状态可按原配置提供摘要。',
            'ascend的源Description本轮全部缺中文定义，已有配置与属性仍应完整呈现。',
        ],
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', type=Path, default=DEFAULT_TABLES)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = audit(args.tables)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', 'utf8')
    print(json.dumps(result['coverage'], ensure_ascii=False))
