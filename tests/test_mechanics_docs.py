from pathlib import Path
from html.parser import HTMLParser
import json
import re
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from embedded import extract


class Claims(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.claims = set()
        self.uncovered = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        claim = attrs.get('data-claim') or next((claim for _, claim, _ in reversed(self.stack) if claim), None)
        navigation = tag == 'nav' or any(nav for _, _, nav in self.stack)
        if attrs.get('data-claim'):
            self.claims.add(attrs['data-claim'])
        if tag in ['p', 'li', 'dt', 'dd', 'table', 'script'] and not claim and not navigation:
            self.uncovered.append((tag, self.getpos()))
        if tag not in ['br', 'img', 'input', 'meta', 'link', 'hr']:
            self.stack.append((tag, claim, navigation))

    def handle_endtag(self, tag):
        for index in range(len(self.stack)-1, -1, -1):
            if self.stack[index][0] == tag:
                self.stack = self.stack[:index]
                break


class MechanicsDocsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (ROOT / 'src/calculator/mechanics.html').read_text('utf8')
        cls.page = (ROOT / 'docs/index.html').read_text('utf8')
        cls.rendered = extract(cls.page, 'MECHANICS_HTML')
        cls.data = extract(cls.page, 'DATA')
        cls.catalog = extract((ROOT / 'docs/catalog.html').read_text('utf8'), 'DATA')

    def test_each_claim_has_checkable_sources(self):
        parser = Claims()
        parser.feed(self.source)
        self.assertEqual(parser.uncovered, [])
        evidence = json.loads((ROOT / 'evidence/mechanics_claims.json').read_text('utf8'))['claims']
        self.assertEqual(parser.claims, set(evidence))
        for claim, sources in evidence.items():
            self.assertTrue(sources, claim)
            for source in sources:
                text = (ROOT / source['file']).read_text('utf8')
                for anchor in source['anchors']:
                    self.assertTrue(anchor in text, (claim, source['file'], anchor))

    def test_latex_is_rendered_and_self_contained(self):
        count = self.source.count('type="math/tex; mode=display"')
        self.assertGreaterEqual(count, 15)
        self.assertEqual(self.rendered.count('class="katex-display"'), count)
        self.assertEqual(self.rendered.count('<math '), count)
        self.assertNotIn('katex-error', self.rendered)
        self.assertNotIn('type="math/tex', self.rendered)
        self.assertNotIn('data-claim', self.rendered)
        self.assertNotRegex(self.rendered, r'\{\{\w+\}\}')
        self.assertNotIn('url(fonts/', self.page)
        self.assertNotIn('未核实', self.rendered)
        self.assertNotIn('待核实', self.rendered)
        self.assertEqual(len(re.findall(r'<article id="rule-', self.rendered)), 12)

    def test_calculator_and_catalog_are_synchronized(self):
        cards = {card['id']: card for card in self.catalog['cards']}
        assets = extract(self.page, 'ASSETS')
        self.assertEqual(len(self.data['cards']), 192)
        for card in self.data['cards']:
            other = cards[card['id']]
            self.assertEqual(card['characters'], other['characters'])
            self.assertEqual(card['pair'], other['pair'])
            if other.get('calculatorThumb'):
                self.assertEqual(card['thumb'], other['calculatorThumb'])
            if card.get('thumb'):
                self.assertIn(card['thumb'], assets)
        self.assertEqual(sum(bool(c.get('thumb')) for c in self.data['cards'] if c['rarity'] == 'R'), 86)


if __name__ == '__main__':
    unittest.main()
