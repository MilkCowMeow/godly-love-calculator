"""验证中文表删条目、空简体条目及未来配置变化的发布保护。"""
from pathlib import Path
import csv
import json
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from client_text import ClientText, TEXT_KEY, clean_text, fingerprint, validate_visible_text
from embedded import extract


class ClientTextTests(unittest.TestCase):
    def test_source_priority_and_fingerprint_gate(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            key = 'T_Skill_Description_test'
            row = {'ID': 'test', 'NAME': '战技', 'Description': key,
                   'AttRate': '0.8', 'CoolDown': '1', 'DynamicField1': ''}

            def write_table():
                with (root / 'skill.txt').open('w', encoding='utf8', newline='') as stream:
                    writer = csv.DictWriter(stream, row.keys(), delimiter='@', quoting=csv.QUOTE_NONE)
                    writer.writeheader()
                    writer.writerow(row)

            write_table()
            fallback = root / 'fallback.json'
            fallback.write_text(json.dumps({'records': {key: {
                'text': '历史中文',
                'guards': [{'table': 'skill', 'key': 'test',
                            'fingerprint': fingerprint('skill', row)}],
            }}}), 'utf8')
            (root / 'CHT').write_text('Key@Value\n', 'utf8')
            (root / 'CHS').write_text('Key@Value\n', 'utf8')
            resolve = lambda: ClientText(root, root, fallback_file=fallback)(key)
            self.assertEqual(resolve(), '历史中文')
            # 当前文本始终先于历史文本；空简体不能覆盖有效繁体。
            (root / 'CHT').write_text('Key@Value\n' + key + '@当前繁体\n', 'utf8')
            (root / 'CHS').write_text('Key@Value\n' + key + '@\n', 'utf8')
            self.assertEqual(resolve(), '当前繁体')
            (root / 'CHS').write_text('Key@Value\n' + key + '@当前简体\n', 'utf8')
            self.assertEqual(resolve(), '当前简体')
            # 数值改变且当前文字缺失时，历史说明停止回退。
            (root / 'CHT').write_text('Key@Value\n', 'utf8')
            (root / 'CHS').write_text('Key@Value\n', 'utf8')
            row['AttRate'] = '1.2'
            write_table()
            self.assertEqual(resolve(), '')

    def test_markup_and_release_gate(self):
        self.assertEqual(clean_text('<b>攻击</b><br>附加[炽燃::Burn:StatusFun]\\n结束'),
                         '攻击\n附加炽燃\n结束')
        validate_visible_text({'skills': {'x': {'description': '攻击敌人',
                                               'raw': {'Description': 'T_Skill_Description_x'}}}})
        with self.assertRaisesRegex(ValueError, '内部|客户端标记'):
            validate_visible_text({'cards': [{'skills': [{'description': 'T_Skill_Description_x'}]}]})
        with self.assertRaises(ValueError):
            validate_visible_text({'skills': {'x': {'description': '[炽燃::Burn:StatusFun]'}}})

    def test_all_published_text_and_reported_card(self):
        calculator = extract((ROOT / 'docs/index.html').read_text('utf8'), 'DATA')
        catalog = extract((ROOT / 'docs/catalog.html').read_text('utf8'), 'DATA')
        validate_visible_text(calculator)
        validate_visible_text(catalog)
        card = next(card for card in catalog['cards'] if card['id'] == 'C03_SSR_003')
        expected = {
            'C03_SSR_003S1': ('75%', '攻击下降', '20%', '2 倍'),
            'C03_SSR_003S2': ('攻击全体敌人', '攻击提升', '防御提升'),
            'C03_SSR_003S3': ('攻击提升 15%', '强化状态数量', '4 次'),
        }
        for sid, phrases in expected.items():
            description = next(skill for skill in card['skills'] if skill['id'] == sid)['description']
            self.assertEqual(description, calculator['skills'][sid]['description'])
            for phrase in phrases:
                self.assertIn(phrase, description)
            self.assertIsNone(TEXT_KEY.search(description))
        # 本轮已更新的实际数值继续使用最新配置。
        self.assertEqual(calculator['skills']['C02_SSR_006S2']['raw']['CoolDown'], '4')
        heal = next(config['value'] for config in calculator['skills']['C02_SSR_006S1']['configs']
                    if config['key'] == 'Fun' and config['value'].get('Fun') == 'AddHP')
        self.assertEqual(heal['ValueConvert']['Rate'], .08)


if __name__ == '__main__':
    unittest.main()
