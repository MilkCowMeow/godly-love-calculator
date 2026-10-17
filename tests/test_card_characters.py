"""Card attribution follows client configuration, including the dual SR exceptions."""
from pathlib import Path
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
        for dataset in [self.catalog, self.calculator]:
            for card in dataset['cards']:
                with self.subTest(cid=card['id']):
                    self.assertEqual(len(card['characters']), len(raw[card['id']].split('~')))
                    self.assertEqual(card['pair'], ' / '.join(names[key] for key in card['characters']))
        self.assertEqual(sum(len(c['characters']) == 1 for c in self.catalog['cards']), 128)
        self.assertEqual(sum(len(c['characters']) == 1 for c in self.calculator['cards']), 128)
        self.assertEqual({c['id'] for c in self.catalog['cards']}, {c['id'] for c in self.calculator['cards']})

    def test_unknown_native_tokens_are_not_guessed(self):
        with self.assertRaises(ValueError):
            assign_characters({'id': 'unknown'}, 'Unknown', self.catalog['profiles'])


if __name__ == '__main__':
    unittest.main()
