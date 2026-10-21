"""核对活动真实归属、开放依据和图片语义配对，补充只检查能渲染的盲区。"""
from collections import defaultdict
import base64
import csv
import io
import os
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from embedded import extract


class CatalogIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = extract((ROOT / 'docs/catalog.html').read_text('utf8'), 'DATA')
        cls.calculator = extract((ROOT / 'docs/index.html').read_text('utf8'), 'DATA')
        cls.cards = {card['id']: card for card in cls.data['cards']}
        cls.events = {event['id']: event for event in cls.data['events']}
        cls.native = {card['id']: card for card in cls.calculator['cards']}
        cls.tables = Path(os.environ.get('GL_CLIENT_TABLES', ROOT.parents[1] / '_工作目录/update_20261020/tables'))

    def rows(self, name):
        path = self.tables / (name + '.txt')
        if not path.exists():
            self.skipTest('当前执行环境没有随附官方原表，发布数据检查仍独立运行')
        with path.open(encoding='utf-8-sig', newline='') as stream:
            return list(csv.DictReader(stream, delimiter='@', quoting=csv.QUOTE_NONE))

    @staticmethod
    def belongs(row, identifier):
        return identifier in (row.get('ActivityID', '') + '~' + row.get('ActivityIDs', '')).split('~')

    def test_all_activity_relations_have_real_targets(self):
        self.assertEqual(len(self.cards), 192)
        self.assertEqual(len(self.events), 120)
        for event in self.events.values():
            with self.subTest(event=event['id']):
                if event.get('card'):
                    self.assertIn(event['card'], self.cards)
                for scene in event['scenes']:
                    self.assertEqual(scene['chapter'], event['id'])
                if event['type'] in ('SignIn', 'SummonPickUp'):
                    self.assertEqual(event['scenes'], [], '同卡纪事关卡应归在纪事活动')
                self.assertEqual(event['quest_count'], len(event['questIds']))
                self.assertEqual(len(event['storeIds']), len(event['stores']))
                for row in event['sign_in_rows'] + event['pass_rewards']:
                    self.assertEqual(row['ActivityID'], event['id'])
                for row in event['commodities']:
                    self.assertTrue(self.belongs(row, event['id']))
                    self.assertNotEqual(row['OutList'], 'TRUE')
                    self.assertTrue(row['displayName'])
        for identifier, card in self.cards.items():
            expected = {event['id'] for event in self.events.values() if event.get('card') == identifier}
            self.assertEqual(set(card.get('related_activities', [])), expected, identifier)

    def test_activity_membership_is_rebuilt_from_official_relations(self):
        scene_rows, quest_rows, store_rows = self.rows('scene'), self.rows('quest'), self.rows('store')
        commodity_rows, sign_rows, pass_rows = self.rows('commodity'), self.rows('signinreward'), self.rows('battlepass')
        for identifier, event in self.events.items():
            with self.subTest(event=identifier):
                self.assertEqual([scene['id'] for scene in event['scenes']],
                                 [row['ID'] for row in scene_rows if row['Chapter'] == identifier])
                self.assertEqual(event['questIds'], [row['ID'] for row in quest_rows if self.belongs(row, identifier)])
                self.assertEqual(event['storeIds'], [row['ID'] for row in store_rows if self.belongs(row, identifier)])
                expected = [row for row in commodity_rows if self.belongs(row, identifier) and row['OutList'] != 'TRUE']
                self.assertEqual([row['ID'] for row in event['commodities']], [row['ID'] for row in expected])
                for published, raw in zip(event['commodities'], expected):
                    self.assertEqual({key: published[key] for key in raw}, raw, raw['ID'])
                self.assertEqual(event['sign_in_rows'], [row for row in sign_rows if row['ActivityID'] == identifier])
                self.assertEqual(event['pass_rewards'], [row for row in pass_rows if row['ActivityID'] == identifier])

    def test_publication_status_keeps_pool_gates_and_announced_dates(self):
        current = set(self.data['currentEventIds'])
        self.assertTrue(current <= self.events.keys())
        for identifier, card in self.cards.items():
            raw, item = self.native[identifier]['raw'], self.native[identifier]['itemRaw']
            if card['availability'] == 'current_base':
                self.assertFalse(raw['VersionControl'], identifier)
                self.assertFalse(item['VersionControl'], identifier)
                self.assertIn('Normal' + card['rarity'], item['Tags'].split('~'), identifier)
                self.assertFalse(any(token.startswith('Version_') for token in
                                     (item.get('ActivityID', '') + '~' + item.get('ActivityIDs', '')).split('~')))
            if card['availability'] == 'current_announced':
                self.assertTrue(any(self.events[event].get('card') == identifier for event in current), identifier)
                self.assertIn(identifier, self.data['eventDates'])
            if card['availability'] == 'past_announced':
                self.assertIn('已结束', self.data['eventDates'][identifier])
                self.assertFalse(any(self.events[event].get('card') == identifier for event in current))
        expected = {'C02_SSR_006': ('10.20', '11.03 14:00'),
                    'C01_SR_005': ('10.06', '11.03 14:00'),
                    'C03_SSR_001': ('10.13', '10.27 05:00'),
                    'C04_SSR_006': ('10.06', '10.20 14:00')}
        for identifier, endpoints in expected.items():
            for endpoint in endpoints:
                self.assertIn(endpoint, self.data['eventDates'][identifier])

    def test_all_fixed_and_grouped_rewards_retain_original_fields(self):
        source = defaultdict(list)
        for row in self.rows('drop'):
            source[row['DropID']].append(row)
        self.assertEqual(dict(source), self.data['drops'])
        direct = [row for event in self.events.values() for row in event['commodities']
                  if row.get('ItemID') and row.get('ItemCount') and not row.get('Drops')]
        self.assertEqual(len(direct), 75)
        paired = [row for event in self.events.values() for row in event['commodities']
                  if row.get('PriceItemID2') and row.get('Price2')]
        self.assertEqual(len(paired), 40)
        self.assertEqual([row['GroupWeight'] for row in self.data['drops']['ActivitySummonC02_SSR_006']],
                         ['0.005', '0.005', '0.07', '0.92'])

    def test_repeated_native_slots_are_explained_and_extra_art_has_no_role(self):
        repeated = defaultdict(list)
        for card in self.cards.values():
            if card.get('art'):
                repeated[card['art']].append(card)
        for records in repeated.values():
            if len(records) > 1:
                self.assertGreaterEqual(sum('重复预置图' in card.get('artNote', '') for card in records), len(records) - 1,
                                        [card['id'] for card in records])
        self.assertTrue({record['id'] for record in self.data['extraArt']}.isdisjoint(self.cards))
        expected_missing = {f'C03_SR_{number:03}' for number in range(6, 12)}
        self.assertTrue({card['id'] for card in self.cards.values() if not card.get('art')} <= expected_missing)

    def test_98_non_r_art_and_thumbnail_pairs_show_the_same_art(self):
        from PIL import Image, ImageChops, ImageStat

        assets = extract((ROOT / 'docs/catalog.html').read_text('utf8'), 'ASSETS')
        small = {}

        def reduced(identifier):
            if identifier not in small:
                with Image.open(io.BytesIO(base64.b64decode(assets[identifier].split(',', 1)[1]))) as opened:
                    image = opened.convert('RGBA')
                image = Image.alpha_composite(Image.new('RGBA', image.size, 'white'), image).convert('RGB')
                image.thumbnail((64, 64), Image.Resampling.LANCZOS)
                small[identifier] = image.resize((64, 64), Image.Resampling.LANCZOS)
            return small[identifier]

        count = 0
        for card in self.cards.values():
            # 21张升级后的R卡大图保留官方近景缩图，构图不同但已逐组核实人物/衣装。
            if card['rarity'] == 'R' or not card.get('art') or not card.get('thumb'):
                continue
            difference = ImageChops.difference(reduced(card['art']), reduced(card['thumb']))
            self.assertLess(sum(ImageStat.Stat(difference).mean) / 3, 5, card['id'])
            count += 1
        self.assertEqual(count, 98)


if __name__ == '__main__':
    unittest.main()
