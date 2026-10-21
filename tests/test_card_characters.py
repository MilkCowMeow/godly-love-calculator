"""Card attribution follows client configuration, including the dual SR exceptions."""
from pathlib import Path
import base64
import io
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from embedded import extract
from card_characters import assign_characters


class CardCharactersTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = extract((ROOT / 'docs/catalog.html').read_text('utf8'), 'DATA')
        cls.calculator = extract((ROOT / 'docs/index.html').read_text('utf8'), 'DATA')
        cls.cards = {c['id']: c for c in cls.catalog['cards']}

    def test_named_single_cards(self):
        for cid, key, name in [
            ('C01_SR_001', 'ryut', '琉斗'), ('C01_SR_002', 'asahi', '旭'),
            ('C02_SR_001', 'somer', '夏暮'), ('C02_SR_002', 'psion', '塞恩'),
            ('C03_SR_001', 'ignas', '稻彦'), ('C03_SR_002', 'towa', '渡司'),
            ('C04_SR_001', 'luce', '柳生'), ('C04_SR_002', 'gaen', '玄泽'),
        ]:
            with self.subTest(cid=cid):
                self.assertEqual(self.cards[cid]['characters'], [key])
                self.assertEqual(self.cards[cid]['pair'], name)

    def test_dual_sr_cards_remain_dual(self):
        for prefix, names in [('C01', '旭 / 琉斗'), ('C02', '塞恩 / 夏暮'),
                              ('C03', '渡司 / 稻彦'), ('C04', '玄泽 / 柳生')]:
            card = self.cards[prefix + '_SR_003']
            self.assertEqual(len(card['characters']), 2)
            self.assertEqual(card['pair'], names)

    def test_all_cards_match_native_representatives(self):
        names = {p['key']: p['name'] for p in self.catalog['profiles']}
        raw = {c['id']: c['raw']['Represents'] for c in self.calculator['cards']}
        animal_keys = {
            'Dog': 'asahi', 'Cat': 'ryut', 'Octopus': 'psion', 'Human': 'somer',
            'Crow': 'towa', 'Sparrow': 'ignas', 'Snake': 'gaen', 'Fox': 'luce',
        }
        for dataset in [self.catalog, self.calculator]:
            for card in dataset['cards']:
                with self.subTest(cid=card['id']):
                    self.assertEqual(len(card['characters']), len(raw[card['id']].split('~')))
                    self.assertEqual(set(card['characters']),
                                     {animal_keys[token] for token in raw[card['id']].split('~')})
                    self.assertEqual(card['pair'], ' / '.join(names[key] for key in card['characters']))
        self.assertEqual(sum(len(c['characters']) == 1 for c in self.catalog['cards']), 128)
        self.assertEqual(sum(len(c['characters']) == 1 for c in self.calculator['cards']), 128)
        self.assertEqual({c['id'] for c in self.catalog['cards']}, {c['id'] for c in self.calculator['cards']})

    def test_item_names_fill_empty_role_names(self):
        # 014774的同ID角色道具已有中文名称，Role.NAME空白仍须保留这些正式名字。
        expected = {
            'C01_SSR_013': '微温新绿', 'C01_SSR_014': '凛冬双舞',
            'C01_SSR_015': '彩帷狂想', 'C02_SSR_013': '时间铭刻',
            'C03_SSR_015': '靡澜长夜',
        }
        for dataset in (self.calculator, self.catalog):
            cards = {card['id']: card for card in dataset['cards']}
            for identifier, name in expected.items():
                with self.subTest(cid=identifier):
                    self.assertEqual(cards[identifier]['name'], name)

    def test_rarity_element_and_job_follow_native_fields(self):
        rarity = {'5': 'SSR', '4': 'SR', '3': 'R'}
        elements = {'Fire': '红璇', 'Ice': '蓝澈', 'Earth': '绿琉',
                    'Ground': '黄曜', 'Light': '光', 'Dark': '暗', 'None': '无属性'}
        jobs = {'Defender': '守护', 'Warrior': '戒律', 'Medic': '祈祷', 'Vanguard': '审判'}
        native = {card['id']: card for card in self.calculator['cards']}
        for identifier, source in native.items():
            raw, displayed = source['raw'], self.cards[identifier]
            with self.subTest(cid=identifier):
                self.assertEqual(source['rarity'], rarity[raw['RarityLV']])
                self.assertEqual(displayed['rarity'], rarity[raw['RarityLV']])
                self.assertEqual(source['element'], raw['Element'])
                self.assertEqual(source['job'], raw['Job'])
                self.assertEqual(displayed['element'], elements[raw['Element']])
                self.assertEqual(displayed['job'], jobs[raw['Job']])

    def test_all_role_icons_match_their_native_enum(self):
        from PIL import Image, ImageChops, ImageStat

        def selected_assets(filename, keys):
            assets = extract((ROOT / 'docs' / filename).read_text('utf8'), 'ASSETS')
            return {key: assets[key] for key in keys}

        catalog_keys = {card[field] for card in self.catalog['cards']
                        for field in ('elementIcon', 'jobIcon')}
        calculator_keys = set(self.calculator['elementIcons'].values()) | set(self.calculator['jobIcons'].values())
        catalog_assets = selected_assets('catalog.html', catalog_keys)
        calculator_assets = selected_assets('index.html', calculator_keys)

        def rendered(value):
            raw = base64.b64decode(value.split(',', 1)[1])
            image = Image.open(io.BytesIO(raw)).convert('RGBA')
            return Image.alpha_composite(Image.new('RGBA', image.size, 'white'), image).convert('RGB')

        checked = set()
        for native in self.calculator['cards']:
            displayed = self.cards[native['id']]
            for kind in ('element', 'job'):
                expected_key = self.calculator[kind + 'Icons'][native['raw']['Element' if kind == 'element' else 'Job']]
                actual_key = displayed[kind + 'Icon']
                pair = (actual_key, expected_key)
                if pair in checked:
                    continue
                checked.add(pair)
                expected, actual = rendered(calculator_assets[expected_key]), rendered(catalog_assets[actual_key])
                with self.subTest(cid=native['id'], kind=kind):
                    self.assertEqual(actual.size, expected.size)
                    # 两站使用不同压缩封装，按实际显示像素核对，允许轻微WebP量化误差。
                    difference = ImageStat.Stat(ImageChops.difference(expected, actual))
                    self.assertLess(max(difference.mean), 3.0)

    def test_unknown_native_tokens_are_not_guessed(self):
        with self.assertRaises(ValueError):
            assign_characters({'id': 'unknown'}, 'Unknown', self.catalog['profiles'])


if __name__ == '__main__':
    unittest.main()
