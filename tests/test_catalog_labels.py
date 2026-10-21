from copy import deepcopy
import json
from pathlib import Path
import re
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from embedded import extract
from catalog_labels import label_errors
from client_presentation import NATIVE_SCHEMA


class CatalogLabelsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = extract((ROOT / 'docs/catalog.html').read_text('utf8'), 'DATA')

    def test_all_displayed_fields_and_typed_enums_are_translated(self):
        self.assertEqual(label_errors(self.data), [])

    def test_published_labels_match_the_current_reviewed_pack(self):
        labels = json.loads((ROOT / 'src/catalog/presentation_labels.json').read_text('utf8'))
        self.assertEqual(self.data['enumLabels'], labels['enums'])
        for key, value in labels['keys'].items():
            self.assertEqual(self.data['keys'].get(key), value, key)

    def test_enum_labels_use_real_native_members_and_readable_chinese(self):
        for enum_type, labels in self.data['enumLabels'].items():
            self.assertIn(enum_type, NATIVE_SCHEMA['enums'])
            self.assertTrue(set(labels) <= set(NATIVE_SCHEMA['enums'][enum_type]), enum_type)
            for member, label in labels.items():
                self.assertIsNotNone(re.search(r'[\u4e00-\u9fff]', label), (enum_type, member, label))

    def test_missing_translation_stops_release(self):
        data = deepcopy(self.data)
        del data['enumLabels']['EFunction']['RemoveDeBuf']
        self.assertTrue(any('RemoveDeBuf' in message for message in label_errors(data)))
        data = deepcopy(self.data)
        data['keys'].pop('TargetInfo', None)
        self.assertTrue(any('TargetInfo' in message for message in label_errors(data)))
        data = deepcopy(self.data)
        data['enumLabels']['EProperty'].pop('AntiStun')
        self.assertTrue(any('AntiStun' in message for message in label_errors(data)))


if __name__ == '__main__':
    unittest.main()
