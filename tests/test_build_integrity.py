"""发布文件须包含当前源码、独立计算线程和当前资料所需字形。"""
import base64
import io
from pathlib import Path
import re
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from embedded import extract
from fontTools.ttLib import TTFont


def missing_sources(page, paths):
    return [path.relative_to(ROOT).as_posix() for path in paths if path.read_text('utf8') not in page]


class BuildIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pages = {name: (ROOT / 'docs' / name).read_text('utf8')
                     for name in ('index.html', 'catalog.html')}

    def test_all_published_code_and_styles_match_current_sources(self):
        for filename, directory in [('index.html', 'calculator'), ('catalog.html', 'catalog')]:
            paths = [path for pattern in ('*.js', '*.css') for path in (ROOT / 'src' / directory).glob(pattern)]
            self.assertEqual(missing_sources(self.pages[filename], paths), [], filename)
            self.assertNotRegex(self.pages[filename], r'/\*(?:ICON|STYLE|DATA|CORE|CONFIG|TIMELINE|MODULES|APP)\*/')

    def test_worker_uses_the_same_current_battle_modules(self):
        worker = extract(self.pages['index.html'], 'SIM_WORKER_SOURCE')
        modules = ['battle_core.js', 'config_engine.js', 'timeline_engine.js',
                   'native_status_rules.js', 'native_turn_rules.js', 'native_complex_rules.js',
                   'simulation_rules.js', 'native_ai_rules.js', 'custom_characters.js', 'combat_reporting.js']
        self.assertEqual(missing_sources(worker, [ROOT / 'src/calculator' / name for name in modules]), [])
        for name in ('GLNativeStatus', 'GLNativeTurns', 'GLNativeComplex', 'GLSimulationRules', 'GLNativeAI', 'GLCustom'):
            self.assertIn(name + '.install(GLTimeline.Simulation)', worker)

    def test_missing_rebuild_is_detected(self):
        path = ROOT / 'src/catalog/motion.js'
        page = self.pages['catalog.html']
        self.assertEqual(missing_sources(page, [path]), [])
        stale = page.replace(path.read_text('utf8'), '/* older motion */')
        self.assertEqual(missing_sources(stale, [path]), ['src/catalog/motion.js'])
        worker = extract(self.pages['index.html'], 'SIM_WORKER_SOURCE')
        path = ROOT / 'src/calculator/config_engine.js'
        self.assertTrue(missing_sources(worker.replace(path.read_text('utf8'), ''), [path]))

    def test_embedded_fonts_cover_all_visible_chinese_data(self):
        visible = {'name', 'description', 'text', 'title', 'pair', 'summary',
                   'availability_evidence', 'limited_kind', 'featuredDescription', 'damageTarget'}
        skip = {'raw', 'row', 'configs', 'patches', 'sourceHashes'}

        def values(obj):
            if isinstance(obj, dict):
                for key, value in obj.items():
                    if key in skip:
                        continue
                    if key in visible:
                        yield str(value)
                    yield from values(value)
            elif isinstance(obj, list):
                for value in obj:
                    yield from values(value)

        for filename, page in self.pages.items():
            required = {ord(char) for text in values(extract(page, 'DATA'))
                        for char in text if '\u4e00' <= char <= '\u9fff'}
            for family in ('BookCN', 'TitleCN'):
                match = re.search(r'@font-face\{font-family:' + family + r';[^}]*?base64,([^)]*)\)', page)
                self.assertIsNotNone(match, (filename, family))
                with TTFont(io.BytesIO(base64.b64decode(match.group(1)))) as font:
                    available = set(font.getBestCmap())
                missing = required - available
                self.assertEqual(missing, set(), (filename, family, ''.join(map(chr, sorted(missing)))))


if __name__ == '__main__':
    unittest.main()
