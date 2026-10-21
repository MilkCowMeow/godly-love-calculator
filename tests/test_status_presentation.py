"""独立验证状态词典、成长参数及原生展示投影，原始证据保持完整。"""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from embedded import extract
from client_text import ClientText, fingerprint

WORK = ROOT / '.tmp/status-presentation'


def walk(value):
    if isinstance(value, dict):
        yield value
        for item in value.values():
            yield from walk(item)
    elif isinstance(value, list):
        for item in value:
            yield from walk(item)


class StatusPresentationAudit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.calculator = extract((ROOT / 'docs/index.html').read_text('utf8'), 'DATA')
        cls.catalog = extract((ROOT / 'docs/catalog.html').read_text('utf8'), 'DATA')
        cls.catalog_cards = {card['id']: card for card in cls.catalog['cards']}

    def test_standard_status_percentages(self):
        # 独立列明有精确百分数原文的属性状态，避免源文与界面同错仍通过。
        cases = {
            'AddAttack': ('AttackFinalRate', .2, '20%'),
            'AddAttackBig': ('AttackFinalRate', .3, '30%'),
            'ReduceAttack': ('AttackFinalRate', -.2, '20%'),
            'AddDefence': ('DefenceFinalRate', .2, '20%'),
            'ReduceDef': ('DefenceFinalRate', -.2, '20%'),
            'IncreaseSpeed': ('SpeedFinalRate', .3, '30%'),
            'ReduceSpeed': ('SpeedFinalRate', -.3, '30%'),
            'IncreaseCriticalHitChance': ('CriticalRate', .5, '50%'),
            'IncreaseCriticalHitDamage': ('CriticalDamageRate', .5, '50%'),
            'IncreaseCriticalHitResistance': ('DeCriticalRate', .5, '50%'),
            'IncreaseEvasion': ('DodgeRate', .5, '50%'),
            'DecreaseHitChance': ('HitRate', -.35, '35%'),
            'IncreaseResistance': ('ResistanceRate', .5, '50%'),
        }
        glossary = {item['id']: item for item in self.calculator['glossary']}
        for identifier, (key, value, percentage) in cases.items():
            with self.subTest(identifier=identifier):
                status = self.calculator['statuses'][identifier]
                self.assertIn({'key': key, 'value': value}, [
                    {'key': config['key'], 'value': config['value']} for config in status['configs']])
                self.assertIn(percentage, glossary[identifier]['description'])

    def test_all_960_imprint_stages_have_matching_attribute_amounts(self):
        total = 0
        for card in self.calculator['cards']:
            totals = [0., 0., 0.]
            for row in card['imprint']:
                total += 1
                if row['EnhanceSkill']:
                    for identifier in row['EnhanceSkill'].split('~'):
                        self.assertIn(identifier, self.calculator['skills'])
                else:
                    amounts = [float(row.get(key) or 0) for key in ('HPRate', 'AttackRate', 'DefenceRate')]
                    self.assertEqual(len(set(amounts)), 1, card['id'])
                    amount = f'{amounts[0] * 100:g}%'
                    self.assertIn(amount, row['description'], card['id'] + '@' + row['LV'])
                totals = [before + float(row.get(key) or 0) for before, key in
                          zip(totals, ('HPRate', 'AttackRate', 'DefenceRate'))]
            for amount in totals:
                self.assertAlmostEqual(amount, 1., msg=card['id'])
        self.assertEqual(total, 960)

    def test_all_official_status_descriptions_are_in_shared_dictionary(self):
        glossary = {item['id']: item for item in self.calculator['glossary']}
        with_text = 0
        for identifier, status in self.calculator['statuses'].items():
            if status['name'] and status['description']:
                with_text += 1
                self.assertEqual(glossary[identifier]['name'], status['name'])
                self.assertEqual(glossary[identifier]['description'], status['description'])
        self.assertEqual(with_text, 58)

    def test_compound_statuses_and_periodic_life_changes_match_numeric_descriptions(self):
        cases = {
            'Rage': {'AttackFinalRate': .12, 'SpeedFinalRate': .12},
            'Vigor': {'AttackFinalRate': .12, 'DefenceFinalRate': .12},
            'Enrage': {'DefenceFinalRate': .12, 'SpeedFinalRate': .12},
            'Knowledge': {'CriticalRate': .18, 'AttackFinalRate': .12},
            **{identifier: {'AttackFinalRate': rate, 'HPFinalRate': rate} for identifier, rate in (
                ('ActivityBuff', .1), ('ActivityBuff_1', .15), ('ActivityBuff_2', .2),
                ('ActivityBuff_3', .3), ('ActivityBuff_4', .4), ('ActivityBuff_5', .5))},
        }
        for identifier, properties in cases.items():
            status = self.calculator['statuses'][identifier]
            actual = {config['key']: config['value'] for config in status['configs']}
            for key, value in properties.items():
                self.assertEqual(actual[key], value, identifier + '.' + key)
                self.assertIn(f'{value * 100:g}%', status['description'])
        for identifier, function, rate in [('Poison', 'AddHP', -.05), ('Hypertoxic', 'AddHPWithInjury', -.1)]:
            status = self.calculator['statuses'][identifier]
            value = status['configs'][0]['value']
            self.assertEqual(value['Trigger'], 'BuffRound')
            self.assertEqual(value['Fun'], function)
            self.assertEqual(value['ValueConvert'], {'Rate': rate, 'Property': 'MaxHP'})
            self.assertIn(f'{-rate * 100:g}%', status['description'])

    def test_invalid_native_functions_stay_raw_and_leave_effect_details(self):
        invalid = ('C02_SSR_013S1', 'C02_SSR_013S2', 'C04_SSR_013S1',
                   'C04_SSR_013S2', 'C01_SR_006S3', 'C02_SR_007S3')
        for identifier in invalid:
            with self.subTest(identifier=identifier):
                skill = self.calculator['skills'][identifier]
                self.assertTrue(skill['configs'], '原始配置必须保留')
                self.assertTrue('displayConfigs' in skill, identifier + ' 缺少原生展示投影')
                values = list(walk(skill['displayConfigs']))
                self.assertFalse(any(value.get('Fun') == 'ForceConquer' for value in values))
                self.assertFalse(any(value.get('Target') == 'TriggerTarget' for value in values))
        skill = self.calculator['skills']['C03_SR_011S1']
        self.assertIn('theValue', json.dumps(skill['configs']))
        self.assertNotIn('theValue', json.dumps([config['value'] for config in skill['displayConfigs']]))
        for identifier in ('C02_SSR_011S3', 'C03_SSR_011S3'):
            self.assertTrue(any(config['key'] == 'ResistRate' for config in self.calculator['skills'][identifier]['configs']))
            self.assertFalse(any(config['key'] == 'ResistRate' for config in self.calculator['skills'][identifier]['displayConfigs']))

    def test_growth_static_properties_keep_their_identity(self):
        for identifier, key, value in [('C04_SSR_003', 'MustCritical', 1), ('C04_SR_005', 'PinchRate', .08)]:
            row = next(row for row in self.catalog_cards[identifier]['ascend'] if row['LV'] == '3')
            self.assertIn({key: value}, row['displayPatches'])

    def test_numeric_fields_and_who_target_have_contextual_labels(self):
        # 执行真正的界面格式化函数；Source/Target对象与状态ID分别验证。
        app = (ROOT / 'src/catalog/app.js').read_text('utf8')
        code = app[:app.index('function renderPager(')]
        script = r'''const fs=require('fs'),vm=require('vm');let input=JSON.parse(fs.readFileSync(0,'utf8'));
const ctx={DATA:input.data,document:{querySelector:()=>({})}};vm.createContext(ctx);vm.runInContext(input.code,ctx);
process.stdout.write(JSON.stringify([ctx.config({Who:'Target'}),ctx.config({FID:'Target'}),ctx.config({StatusRound:2,Pow:1})]));'''
        process = subprocess.run(['node', '-e', script], input=json.dumps({'data': {
            'keys': self.catalog['keys'], 'values': self.catalog['values'], 'cards': [], 'events': [],
            'profiles': [], 'glossary': self.catalog['glossary']}, 'code': code}),
            cwd=ROOT, text=True, encoding='utf8', capture_output=True, check=True)
        who, status, numeric = json.loads(process.stdout)
        self.assertNotIn('破息', who)
        self.assertIn('目标', who)
        self.assertIn('破息', status)
        self.assertNotIn('木桩', numeric)
        self.assertIn('2', numeric)
        self.assertIn('1', numeric)

    def test_fallback_guard_rejects_changed_effect_and_current_text_takes_priority(self):
        WORK.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='fallback_guard_', dir=WORK) as directory:
            path = Path(directory)
            source = {'ID': 'S', 'NAME': 'T_Name_S', 'Description': 'T_Description_S', 'DynamicField1': 'AttackFinalRate#0.2'}
            (path / 'skill.txt').write_text('@'.join(source) + '\n' + '@'.join(source.values()) + '\n', 'utf8')
            (path / 'CHT').write_text('key@text\n', 'utf8')
            (path / 'CHS').write_text('key@text\n', 'utf8')
            fallback = path / 'fallback.json'
            fallback.write_text(json.dumps({'records': {'T_Description_S': {'text': '历史说明', 'guards': [{
                'table': 'skill', 'key': 'S', 'fingerprint': fingerprint('skill', source)}]}}}), 'utf8')
            self.assertEqual(ClientText(path, path, fallback_file=fallback)('T_Description_S'), '历史说明')
            (path / 'skill.txt').write_text('@'.join(source) + '\n' + '@'.join(
                value.replace('#0.2', '#0.3') for value in source.values()) + '\n', 'utf8')
            self.assertEqual(ClientText(path, path, fallback_file=fallback)('T_Description_S'), '')
            (path / 'CHS').write_text('key@text\nT_Description_S@当前说明\n', 'utf8')
            self.assertEqual(ClientText(path, path, fallback_file=fallback)('T_Description_S'), '当前说明')


if __name__ == '__main__':
    unittest.main()
