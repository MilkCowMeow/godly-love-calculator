"""图鉴参数按字段语境翻译；当前使用的参数缺少译名时停止构建。"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENUM_FIELDS = {'Fun': 'EFunction', 'Who': 'EFunctionWho', 'Target': 'ETargetType',
               'TargetType': 'ETargetType', 'TargetCamp': 'ETargetCamp', 'Property': 'EProperty',
               'CheckFun': 'ECheckCondition', 'Comparer': 'EComparer', 'Trigger': 'EFunctionTrigger',
               'TargetScope': 'ETargetScope'}


def label_errors(data):
    errors = []

    def check(value, path, field=''):
        if isinstance(value, dict):
            for key, item in value.items():
                if not data['keys'].get(key):
                    errors.append(path + '.' + key + ': 参数名没有中文译名')
                check(item, path + '.' + key, key)
        elif isinstance(value, list):
            for index, item in enumerate(value):
                check(item, path + '[' + str(index) + ']', field)
        elif field in ENUM_FIELDS:
            if str(value) not in data.get('enumLabels', {}).get(ENUM_FIELDS[field], {}):
                errors.append(path + ': 枚举没有中文译名 ' + str(value))
        elif field == 'AntiList' and isinstance(value, str):
            for member in value.split('~'):
                if member and member not in data.get('enumLabels', {}).get('EProperty', {}):
                    errors.append(path + ': 免疫列表成员没有中文译名 ' + member)

    extras = ['Pow', 'IsInitCoolDown', 'Soul', 'SkillSoulCost', 'SP',
              'SoulSkillDescription', 'SoulSkillFunc', 'ReferanceSkillID', 'LevelSkillID', 'TwinSkill']
    for card in data['cards']:
        for skill in card['skills']:
            for index, config in enumerate(skill.get('displayConfigs', skill['configs'])):
                check(config['value'], card['id'] + '.' + skill['id'] + '.effect.' + str(index))
            check({key: skill['row'][key] for key in extras if skill['row'].get(key)}, card['id'] + '.' + skill['id'] + '.extras')
            check({key: skill['row'][key] for key in ('TargetType', 'TargetCamp') if skill['row'].get(key)}, card['id'] + '.' + skill['id'] + '.targets')
        for kind in ('imprint', 'ascend'):
            for row in card[kind]:
                check(row.get('displayPatches', row.get('patches', [])), card['id'] + '.' + kind + '.' + row['LV'])
    return errors


def apply_labels(data):
    labels = json.loads((ROOT / 'src/catalog/presentation_labels.json').read_text('utf8'))
    data['keys'].update(labels['keys'])
    data['enumLabels'] = labels['enums']
    errors = label_errors(data)
    if errors:
        raise ValueError('图鉴参数译名不完整：\n' + '\n'.join(errors[:30]))
    return data
