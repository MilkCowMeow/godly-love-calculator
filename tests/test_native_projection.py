"""全部原生动态函数的 Python 展示投影与实际 JS 装载投影一致。"""
from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from embedded import extract
from client_presentation import display_configs, project_native_value


class NativeProjectionTests(unittest.TestCase):
    def test_all_function_projections_match_runtime_loader(self):
        data = extract((ROOT / 'docs/index.html').read_text('utf8'), 'DATA')
        functions = []

        def collect(configs):
            functions.extend(config['value'] for config in configs if config['key'] == 'Fun')

        for collection in ('skills', 'statuses'):
            for entry in data[collection].values():
                collect(entry['configs'])
        for card in data['cards']:
            collect(card['configs'])
            for kind in ('imprint', 'ascend'):
                for stage in card[kind]:
                    collect(stage['configs'])
        original = deepcopy(functions)
        program = "const C=require('./src/calculator/config_engine.js');let s='';process.stdin.on('data',v=>s+=v);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(s).map(v=>C.loadNativeFunction(v).value))));"
        result = subprocess.run(['node', '-e', program], input=json.dumps(functions), cwd=ROOT,
                                text=True, capture_output=True, check=True)
        expected = json.loads(result.stdout)
        self.assertGreater(len(functions), 900)
        for index, (value, native) in enumerate(zip(functions, expected)):
            try:
                projected = project_native_value(value)
            except ValueError:
                projected = None
            self.assertEqual(projected, native, index)
        self.assertEqual(functions, original)

    def test_unknown_fields_and_invalid_enums_do_not_become_effects(self):
        configs = [
            {'key': 'Fun', 'field': 'a', 'value': {'Fun': 'AddStatus', 'Target': 'TriggerTarget', 'FID': 'Shield'}},
            {'key': 'Fun', 'field': 'b', 'value': {'ValueConvert': {'Property': 'BuffCount', 'theValue': .08, 'CheckID': 'Bleed'}}},
            {'key': 'ResistRate', 'field': 'c', 'value': .35},
            {'key': 'ResistanceRate', 'field': 'd', 'value': .1},
            {'key': 'Fun', 'field': 'e', 'value': {'fun': 'addstatus', 'Target': '1', 'Who': 'unused'}},
        ]
        projected = display_configs(configs)
        self.assertEqual(projected, [
            {'key': 'Fun', 'field': 'b', 'value': {'ValueConvert': {'Property': 'BuffCount'}}},
            {'key': 'ResistanceRate', 'field': 'd', 'value': .1},
            {'key': 'Fun', 'field': 'e', 'value': {'Fun': 'AddStatus', 'Target': 'RandomTwo'}},
        ])
        self.assertEqual(configs[0]['value']['FID'], 'Shield')
        self.assertEqual(configs[1]['value']['ValueConvert']['theValue'], .08)


if __name__ == '__main__':
    unittest.main()
