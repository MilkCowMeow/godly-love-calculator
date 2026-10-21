"""从客户端原表生成纪事最终战斗关，档期由官方公告核验后的清单提供。"""
from collections import deque
from pathlib import Path
import argparse
import hashlib
import json
import re

from extract_trials import read_rows, load_dependencies, f32, STAT_NAMES
from client_text import ClientText

ROOT = Path(__file__).resolve().parents[1]
TABLES = ('scene', 'chapter', 'activity', 'role', 'roleproperty', 'skill', 'status', 'aiaction')


def generate(args):
    json5, convert = load_dependencies(args.libs)
    translate = ClientText(args.locale, args.tables, convert)
    locale_paths = [args.locale / language for language in ('CHT', 'CHS')]
    registry = json.loads(args.manifest.read_text('utf8'))
    tables = {name: read_rows(args.tables / (name + '.txt')) for name in TABLES}
    indexed = {name: {row['ID']: row for row in rows} for name, rows in tables.items()
               if name not in ('roleproperty', 'aiaction')}
    properties = {(row['ID'], int(row['LV'])): row for row in tables['roleproperty']}

    def configs(row):
        result = []
        for field, raw in row.items():
            if not raw or '#' not in raw or not field.startswith(('DynamicField', 'PassiveProp.DynamicField')):
                continue
            key, value = raw.split('#', 1)
            try:
                value = json5.loads(value)
            except (ValueError, TypeError):
                pass
            result.append({'key': key, 'value': value, 'raw': raw, 'field': field})
        return result

    def definition(kind, identifier):
        raw = indexed[kind][identifier]
        return {'id': identifier, 'name': translate(raw['NAME' if kind == 'skill' else 'Name']),
                'description': translate(raw.get('Description', '')), 'raw': raw, 'configs': configs(raw)}

    stages = {}
    for schedule in registry['stages']:
        scene = indexed['scene'][schedule['id']]
        chapter = indexed['chapter'][scene['Chapter']]
        activity = indexed['activity'][scene['Chapter']]
        battles = [row for row in tables['scene'] if row['Chapter'] == scene['Chapter'] and row['WaveInfoJsonString']]
        terminal = max(battles, key=lambda row: int(re.search(r'_(\d+)$', row['ID']).group(1)))
        if terminal['ID'] != scene['ID']:
            raise ValueError('清单关卡并非本纪事最后战斗关：' + scene['ID'])
        if any(scene[key] for key in ('WaveInfo2JsonString', 'WaveInfo3JsonString', 'DynamicField1', 'DynamicField2', 'DynamicField3')):
            raise ValueError('纪事新增波次或场景字段须先核验：' + scene['ID'])
        wave = json5.loads(scene['WaveInfoJsonString'])
        infos = [json5.loads(scene[key]) for key in ('RoleStatusInfo1', 'RoleStatusInfo2') if scene[key]]
        enemies = []
        for position, entry in enumerate(wave['Ms']):
            if entry.get('ArtifactID') or entry.get('ImprintLV'):
                raise ValueError('纪事怪物携带新增装备或升星配置须先核验')
            raw = indexed['role'][entry['M']]
            level = int(entry.get('LV', scene['LV']))
            base = properties[(raw['RolePropertyID'], level)]
            unrounded = {key: float(base[key]) * f32(float(raw[key]) if raw.get(key) else 1)
                         for key in STAT_NAMES if base.get(key)}
            unrounded['MaxHP'] = unrounded['HP']
            stats = {key: f32(value) for key, value in unrounded.items()}
            for key in ('HP', 'MaxHP', 'Attack', 'Defence', 'Speed'):
                stats[key] = int(stats[key]) if key in ('Attack', 'Defence') else round(stats[key])
            slots = [part.split(':', 1)[0] for part in raw['SkillIDs'].split('~') if part]
            ai = [part for part in raw['AIs'].split('~') if part]
            art = re.search(r'\[([^\]]+)\]', raw.get('HeadS', ''))
            enemies.append({'id': raw['ID'], 'name': translate(raw['NAME']), 'level': level,
                            'element': raw['Element'], 'job': raw['Job'], 'isBoss': bool(entry.get('Boss')),
                            'campPosition': int(entry.get('Pos', position)), 'waveIndex': 1,
                            'skills': slots, 'skillSlots': slots[:],
                            'hiddenSkills': [part.split(':', 1)[0] for part in raw['SkillIDs'].split('~') if ':Hide' in part],
                            'thumb': 'chronicle/' + art.group(1) if art else '',
                            'levelStats': [{'level': level, 'stats': unrounded, 'raw': base}],
                            'stats': stats, 'statsUnrounded': unrounded, 'initialStatuses': [],
                            'configs': configs(raw), 'raw': raw, 'ai': ai,
                            'aiRules': [row for row in tables['aiaction'] if row['ID'] in ai],
                            'imprint': [], 'ascend': []})
        queue = deque(('skill', sid) for enemy in enemies for sid in enemy['skills'])
        for info in infos:
            queue.extend(('status', condition['ID']) for condition in info['Conditions'])
        selected = {'skill': {}, 'status': {}}

        def collect(value):
            if isinstance(value, dict):
                for part in value.values():
                    collect(part)
            elif isinstance(value, list):
                for part in value:
                    collect(part)
            elif isinstance(value, str):
                for part in value.split('~'):
                    identifier = part.split(':', 1)[0]
                    for kind in selected:
                        if identifier in indexed[kind]:
                            queue.append((kind, identifier))
        for enemy in enemies:
            collect(enemy['configs'])
        while queue:
            kind, identifier = queue.popleft()
            if identifier in selected[kind]:
                continue
            record = selected[kind][identifier] = definition(kind, identifier)
            collect(record['configs'])
            if kind == 'skill':
                for field in ('TwinSkill', 'ReferanceSkillID', 'LevelSkillID'):
                    collect(record['raw'].get(field, ''))
        rules = []
        for info in infos:
            for card_id in info['RoleIDs']:
                tiers = []
                for condition in info['Conditions']:
                    if not re.fullmatch(r'ActivityBuff(?:_\d+)?', condition['ID']):
                        continue
                    props = {record['key']: record['value'] for record in selected['status'][condition['ID']]['configs']}
                    tiers.append({'imprint': int(condition['Value1']), 'statusId': condition['ID'],
                                  'attackRate': props['AttackFinalRate'], 'hpRate': props['HPFinalRate']})
                rules.append({'cardId': card_id, 'maxLevel': 80, 'promotionStatus': 'Activity_Main', 'tiers': tiers})
        activity_name = translate(chapter['Name'])
        stages[scene['ID']] = {'catalog': registry['catalog'], 'id': scene['ID'], 'activityId': scene['Chapter'],
            'activityName': activity_name, 'name': activity_name + ' ' + translate(scene['SceneNum']),
            'chapterName': activity_name, 'sceneName': translate(scene['Name']), 'sceneNum': translate(scene['SceneNum']),
            'level': int(scene['LV']), 'serverBattle': scene['ServerBattle'].upper() == 'TRUE',
            'openAt': schedule['openDate'] + 'T00:00:00+08:00', 'openPrecision': 'day', 'closeAt': schedule['closeAt'],
            'availability': schedule, 'scene': scene, 'chapter': chapter, 'activity': activity,
            'waves': [{'index': 1, 'field': 'WaveInfoJsonString', 'raw': wave, 'enemies': [enemy['id'] for enemy in enemies]}],
            'enemies': enemies, 'skills': selected['skill'], 'statuses': selected['status'],
            'roleStatusInfos': infos, 'sceneRules': rules, 'unresolvedSkillIDs': []}
    sources = {name + '.txt': hashlib.sha256((args.tables / (name + '.txt')).read_bytes()).hexdigest() for name in TABLES}
    sources.update({'locale/' + path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in locale_paths})
    result = {'catalog': registry['catalog'], 'sourceHashes': sources, 'chronicles': stages}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', 'utf8')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', type=Path, required=True)
    parser.add_argument('--locale', type=Path, required=True)
    parser.add_argument('--libs', type=Path, default=Path(r'D:\GodlyLove\_工作目录\角色活动图鉴\libs'))
    parser.add_argument('--manifest', type=Path, default=ROOT / 'src/calculator/chronicle_manifest.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'src/calculator/chronicles.json')
    result = generate(parser.parse_args())
    print(json.dumps({'stages': list(result['chronicles']), 'catalog': result['catalog']}, ensure_ascii=False))
