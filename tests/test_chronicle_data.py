"""纪事源表快照、最终关与公告档期的一致性。"""
from pathlib import Path
import argparse
import json
import os
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from embedded import extract
from extract_chronicles import generate


class ChronicleDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snapshot = json.loads((ROOT / 'src/calculator/chronicles.json').read_text('utf8'))
        cls.stage = cls.snapshot['chronicles']['C02_SSR_006_14']
        cls.data = extract((ROOT / 'docs/index.html').read_text('utf8'), 'DATA')

    def test_published_closure_and_original_scene(self):
        self.assertEqual(self.data['chronicles'], self.snapshot['chronicles'])
        stage = self.stage
        self.assertEqual(stage['scene']['Chapter'], 'BranchC02_SSR_006')
        self.assertEqual(stage['sceneNum'], 'S14')
        self.assertEqual(stage['level'], 80)
        self.assertEqual(len(stage['waves']), 1)
        self.assertEqual([enemy['id'] for enemy in stage['enemies']], ['MB004_1_C02_SSR_006'])
        self.assertEqual(set(stage['skills']), {'MB004_1_C02_SSR_006S1', 'MB004_1_C02_SSR_006S2', 'MB004_1_C02_SSR_006S3', 'Ac_AttackStack'})
        self.assertEqual(stage['unresolvedSkillIDs'], [])
        self.assertIn(stage['enemies'][0]['thumb'], extract((ROOT / 'docs/index.html').read_text('utf8'), 'ASSETS'))
        self.assertEqual([tier['hpRate'] for tier in stage['sceneRules'][0]['tiers']], [.1, .15, .2, .3, .4, .5])

    def test_official_period(self):
        catalog = extract((ROOT / 'docs/catalog.html').read_text('utf8'), 'DATA')
        notice = next(row for row in catalog['notices'] if row['id'] == 'news_3617')
        self.assertIn('2026年11月3日 14:00', notice['text'])
        self.assertEqual(self.stage['closeAt'], '2026-11-03T14:00:00+08:00')
        self.assertEqual(self.stage['openPrecision'], 'day')

    def test_rebuild_from_client_tables_when_available(self):
        tables, locale = os.getenv('GL_CLIENT_TABLES'), os.getenv('GL_CLIENT_LOCALE')
        if not tables or not locale:
            self.skipTest('原始客户端表仅在本地发布检查中提供')
        with tempfile.TemporaryDirectory(dir=ROOT / '.tmp') as folder:
            rebuilt = generate(argparse.Namespace(tables=Path(tables), locale=Path(locale),
                libs=Path(r'D:\GodlyLove\_工作目录\角色活动图鉴\libs'),
                manifest=ROOT / 'src/calculator/chronicle_manifest.json', output=Path(folder) / 'chronicles.json'))
        self.assertEqual(rebuilt, self.snapshot)


if __name__ == '__main__':
    unittest.main()
