"""以客户端原文链接和效果引用生成两站共用的技能阅读数据。"""
import json
from copy import deepcopy
from pathlib import Path
import re
from client_text import fingerprint
from embedded import extract

STATUS_LINK = re.compile(r'\[([^\[\]:]+):+([^\[\]:]+):StatusFun\]')
REFERENCE_FIELDS = {'FID', 'FIDs', 'CheckID', 'PropertyID', 'GroupID'}
NATIVE_SCHEMA = extract((Path(__file__).resolve().parents[1] / 'src/calculator/config_engine.js').read_text('utf8'), 'NATIVE_FUNCTION_SCHEMA')


def project_native_value(value, typename='SkillFunctionInfo'):
    """按同一声明结构生成原生装载后的展示值，原始配置保留原样。"""
    if typename in NATIVE_SCHEMA['enums']:
        members = NATIVE_SCHEMA['enums'][typename]
        if isinstance(value, int) and not isinstance(value, bool):
            numeric = value
        elif isinstance(value, str):
            if re.fullmatch(r'[+-]?\d+', value.strip()):
                numeric = int(value)
            else:
                names = {name.lower(): number for name, number in members.items()}
                numeric = 0
                for part in value.split(','):
                    name = part.strip().lower()
                    if name not in names:
                        raise ValueError('unknown enum member')
                    numeric |= names[name]
        else:
            raise ValueError('enum requires Int32 or member name')
        if not -(2**31) <= numeric < 2**31:
            raise ValueError('enum integer outside Int32')
        return next((name for name, number in members.items() if number == numeric), numeric)
    if typename.startswith('List<'):
        if value is None:
            return None
        if not isinstance(value, list):
            raise ValueError('expected list')
        return [project_native_value(item, typename[5:-1]) for item in value]
    fields = NATIVE_SCHEMA['classes'].get(typename)
    if not fields or value is None:
        return deepcopy(value)
    if not isinstance(value, dict):
        raise ValueError('expected declared object')
    names = {name.lower(): name for name in fields}
    out = {}
    for supplied, item in value.items():
        key = supplied if supplied in fields else names.get(supplied.lower())
        if key is not None:
            out[key] = project_native_value(item, fields[key])
    return out


def valid_native_value(value, typename='SkillFunctionInfo'):
    try:
        project_native_value(value, typename)
        return True
    except ValueError:
        return False


def display_configs(configs):
    out = []
    for config in configs:
        if config['key'] == 'Fun':
            try:
                value = project_native_value(config['value'])
            except ValueError:
                continue
            if value is not None:
                out.append({**config, 'value': value})
        elif config['key'] in NATIVE_SCHEMA['enums']['EProperty']:
            out.append(deepcopy(config))
    return out


def walk(value):
    if isinstance(value, dict):
        yield value
        for item in value.values():
            yield from walk(item)
    elif isinstance(value, list):
        for item in value:
            yield from walk(item)


def percentage(value):
    return f'{float(value) * 100:g}%'


def damage_target(skill):
    raw = skill['raw']
    if raw.get('SkillType') == 'Passive' or (raw.get('TargetCamp') or 'Enemy') != 'Enemy' or not float(raw.get('Pow') or 0):
        return ''
    targets = {'': '一名敌人', 'One': '一名敌人', 'All': '全体敌人', 'RandomTwo': '两名敌人'}
    if raw.get('TargetTypeFun'):
        import json5
        conditional = json5.loads(raw['TargetTypeFun'])
        if conditional == {'TargetType': 'RandomTwo', 'Condition': {'CheckFun': 'CheckSkillNoUse', 'CheckID': skill['id'][:-1] + '2'}}:
            return '通常一名敌人，终结技冷却中为两名敌人'
        raise ValueError('需要补充条件选取范围的说明：' + skill['id'])
    if raw.get('TargetType', '') not in targets:
        raise ValueError('需要补充攻击选取范围的说明：' + skill['id'])
    return targets[raw.get('TargetType', '')]


def auxiliary_description(skill, statuses):
    """仅为源Description为空的辅助动作，按完整已知配置生成说明。"""
    raw = skill['raw']
    if raw.get('Description') or float(raw.get('AttRate') or 0) <= 0:
        raise ValueError('辅助动作说明超出支持范围：' + skill['id'])
    target = '全体敌人' if raw.get('TargetType') == 'All' else '选定敌人'
    parts = [f'攻击{target}，攻击系数{percentage(raw["AttRate"])}。']
    for config in skill['configs']:
        value = config['value']
        if config['key'] != 'Fun':
            raise ValueError('辅助动作含未知属性：' + skill['id'])
        if value.get('Fun') == 'AddStatus' and set(value) <= {'Fun', 'Target', 'FID', 'Rate', 'StatusRound'}:
            name = statuses[value['FID']]['name']
            chance = f'以{percentage(value["Rate"])}的基础概率' if 'Rate' in value else ''
            scope = '全体敌人' if value.get('Target') == 'All' else target
            parts.append(f'{chance}使{scope}附加{name}，持续{value["StatusRound"]}回合。')
        elif value.get('Fun') == 'AddTime' and value.get('Target') == 'Self' and set(value) <= {'Fun', 'TargetCamp', 'Target', 'Value'}:
            parts.append(f'自身行动值提高{percentage(value["Value"])}。')
        elif set(value) == {'ConditionAttack'} and value['ConditionAttack'].get('Property') == 'LastHPRate' and set(value['ConditionAttack']) == {'Rate', 'Property'}:
            parts.append(f'自身每损失1%的生命，伤害加成提高{percentage(value["ConditionAttack"]["Rate"])}。')
        else:
            raise ValueError('辅助动作含待解析效果：' + skill['id'])
    return ''.join(parts)


def enrich(data, text):
    """数值/raw保持原样；单独生成词典、辅助动作说明与引用关系。"""
    statuses, skills = data['statuses'], data['skills']
    corrections = json.loads((Path(__file__).resolve().parents[1] / 'src/client_text_corrections.json').read_text('utf8'))['records']
    glossary = {sid: {'id': sid, 'name': st['name'], 'description': st['description']}
                for sid, st in statuses.items() if st['name'] and st['description']}
    for key in text.current:
        prefix = 'UI_SkillFunction_Description_'
        if key.startswith(prefix):
            sid = key[len(prefix):]
            name, description = text('UI_SkillFunction_' + sid), text(key)
            if name and description:
                glossary[sid] = {'id': sid, 'name': name, 'description': description}

    def references(configs):
        found = set()
        eligible = display_configs(configs) if isinstance(configs,list) and all(isinstance(item,dict) and 'key' in item for item in configs) else configs
        for obj in walk(eligible):
            for field in REFERENCE_FIELDS:
                value = obj.get(field, [])
                for item in value if isinstance(value, list) else str(value).split('~'):
                    if item in statuses:
                        found.add(item)
        return found

    def closure(found):
        todo = list(found)
        while todo:
            sid = todo.pop()
            if sid not in statuses:
                continue
            more = references(statuses[sid]['configs']) - found
            found.update(more)
            todo.extend(more)
        return found

    unresolved = []
    for sid, skill in skills.items():
        skill['damageTarget'] = damage_target(skill)
        skill['displayConfigs'] = display_configs(skill['configs'])
        correction = corrections.get(sid)
        if correction and fingerprint('skill', skill['raw']) == correction['fingerprint'] and text(skill['raw']['Description']) == correction['clientDescription']:
            skill['clientDescription'] = correction['clientDescription']
            skill['description'] = correction['description']
            skill['descriptionSource'] = 'verifiedConfiguration'
        if not skill['description'] and not skill['raw'].get('Description'):
            skill['description'] = auxiliary_description(skill, statuses)
            skill['descriptionSource'] = 'configuration'
        ids = references(skill['configs'])
        for label, identifier in STATUS_LINK.findall(text.source(skill['raw'].get('Description', ''))):
            if identifier in glossary:
                if skill.get('descriptionSource') != 'verifiedConfiguration' or label in skill['description'] or glossary[identifier]['name'] in skill['description']:
                    ids.add(identifier)
            elif identifier != 'RandomAddStatus':
                unresolved.append({'skill': sid, 'id': identifier, 'label': label})
        if skill.get('descriptionSource') == 'verifiedConfiguration':
            ids.update(identifier for identifier, definition in statuses.items() if len(definition['name']) >= 2 and definition['name'] in skill['description'] and identifier in glossary)
        skill['glossaryIds'] = sorted(closure(ids) & glossary.keys())

    for card in data['cards']:
        ids = references(card['configs'])
        for sid in card['skills']:
            ids.update(skills[sid]['glossaryIds'])
        for kind in ('imprint', 'ascend'):
            for row in card[kind]:
                row['displayConfigs'] = display_configs(row['configs'])
                ids.update(references(row['configs']))
        card['glossaryIds'] = sorted(closure(ids) & glossary.keys())
    if unresolved:
        raise ValueError('客户端术语链接没有定义：' + repr(unresolved))
    data['glossary'] = list(glossary.values())
    return data
