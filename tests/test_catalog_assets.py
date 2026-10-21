"""图鉴每一项图片引用及已找回/升级R卡大图的发布检查。"""
import base64
import io
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from embedded import extract
from PIL import Image


class CatalogAssetsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        page = (ROOT / 'docs/catalog.html').read_text('utf8')
        cls.data, cls.assets = extract(page, 'DATA'), extract(page, 'ASSETS')

    def test_all_references_and_images_decode(self):
        fields = {
            'cards': ('art', 'thumb', 'calculatorThumb', 'elementIcon', 'jobIcon'),
            'profiles': ('avatar', 'portrait'), 'otherProfiles': ('portrait',),
            'events': ('art', 'thumb'), 'banners': ('art', 'thumb'),
            'extraArt': ('art', 'thumb'),
        }
        for collection, names in fields.items():
            for record in self.data[collection]:
                for name in names:
                    if record.get(name):
                        self.assertIn(record[name], self.assets, (collection, record.get('id'), name))
        for identifier, url in self.assets.items():
            with self.subTest(asset=identifier):
                self.assertTrue(url.startswith('data:image/'))
                with Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1], validate=True))) as image:
                    self.assertGreater(min(image.size), 0)
                    image.verify()

    def test_recovered_r_cards_and_full_art_resolution(self):
        identifiers = [
            'C01_R_009', 'C01_R_010', 'C01_R_109', 'C01_R_110',
            'C02_R_008', 'C02_R_009', 'C02_R_010', 'C02_R_108', 'C02_R_109', 'C02_R_110',
            'C03_R_009', 'C03_R_010', 'C03_R_108', 'C03_R_109', 'C03_R_110',
            'C04_R_008', 'C04_R_009', 'C04_R_010', 'C04_R_108', 'C04_R_109', 'C04_R_110',
        ]
        cards = {card['id']: card for card in self.data['cards']}
        for identifier in identifiers:
            with self.subTest(card=identifier):
                card = cards[identifier]
                self.assertTrue(card['thumb'])
                self.assertTrue(card['calculatorThumb'])
                url = self.assets[card['art']]
                with Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))) as image:
                    self.assertGreaterEqual(image.width, 576)
                    self.assertGreaterEqual(image.height, 1024)


if __name__ == '__main__':
    unittest.main()
