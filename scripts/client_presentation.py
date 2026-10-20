"""以客户端原文链接和效果引用生成两站共用的技能阅读数据。"""
import json
from pathlib import Path
import re
from client_text import fingerprint

STATUS_LINK = re.compile(r'\[([^\[\]:]+):+([^\[\]:]+):StatusFun\]')
REFERENCE_FIELDS = {'FID', 'FIDs', 'CheckID', 'PropertyID', 'GroupID'}


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
        for obj in walk(configs):
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
                ids.add(identifier)
            elif identifier != 'RandomAddStatus':
                unresolved.append({'skill': sid, 'id': identifier, 'label': label})
        skill['glossaryIds'] = sorted(closure(ids) & glossary.keys())

    for card in data['cards']:
        ids = references(card['configs'])
        for sid in card['skills']:
            ids.update(skills[sid]['glossaryIds'])
        for kind in ('imprint', 'ascend'):
            ids.update(references([row['configs'] for row in card[kind]]))
        card['glossaryIds'] = sorted(closure(ids) & glossary.keys())
    if unresolved:
        raise ValueError('客户端术语链接没有定义：' + repr(unresolved))
    data['glossary'] = list(glossary.values())
    return data
