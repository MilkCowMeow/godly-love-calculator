"""已核实官方档期的时区、结束边界与双站同步保护。"""
from copy import deepcopy
from datetime import datetime
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from official_schedule import apply_calculator, apply_catalog, audit_schedule, load_schedule, window_status


def fixture():
    schedule = load_schedule()
    cards = [{'id': identifier} for identifier in schedule['cards']]
    calc = {'catalog': schedule['catalog'], 'asOf': schedule['sourceAsOf'], 'cards': deepcopy(cards)}
    cat = {'catalog': schedule['catalog'], 'asof': schedule['sourceAsOf'], 'cards': deepcopy(cards),
           'events': [{'id': identifier, 'card': window['cardId']} for window in schedule['windows'] for identifier in window['eventIds']],
           'notices': [{'id': window['officialId']} for window in schedule['windows']]}
    apply_calculator(calc)
    apply_catalog(cat)
    return calc, cat


class OfficialScheduleTests(unittest.TestCase):
    def test_explicit_source_date_and_review_date_are_separate(self):
        calc, cat = fixture()
        self.assertEqual(calc['asOf'], '2026-10-23')
        self.assertEqual(cat['asof'], '2026-10-23')
        self.assertEqual(calc['checkedAt'], '2026-10-31')
        self.assertEqual(cat['checkedAt'], '2026-10-31')
        self.assertEqual(audit_schedule(calc, cat), [])

    def test_rain_remains_available_in_the_permanent_pool_after_pickup(self):
        calc, cat = fixture()
        for data in (calc, cat):
            rain = next(card for card in data['cards'] if card['id'] == 'C03_SSR_001')
            stage = next(card for card in data['cards'] if card['id'] == 'C01_SSR_001')
            self.assertEqual(rain['availability'], 'current_base')
            self.assertEqual(stage['availability'], 'current_base')
            self.assertIn('当前限时UP', stage['status'])
        self.assertNotIn('ActivitySummonC03_SSR_001', cat['currentEventIds'])
        self.assertIn('ActivitySummonC01_SSR_001', cat['currentEventIds'])

    def test_end_time_is_exclusive_and_uses_utc8(self):
        rain = next(window for window in load_schedule()['windows'] if window['cardId'] == 'C03_SSR_001')
        self.assertEqual(window_status(rain, '2026-10-27T04:59:59+08:00'), 'current')
        self.assertEqual(window_status(rain, '2026-10-27T05:00:00+08:00'), 'past')
        self.assertEqual(window_status(rain, '2026-10-26T21:00:00+00:00'), 'past')
        self.assertEqual(window_status(rain, '2026-10-12'), 'future')
        self.assertEqual(window_status(rain, '2026-10-13'), 'current')
        with self.assertRaisesRegex(ValueError, '时区'):
            window_status(rain, datetime(2026, 10, 27, 5))

    def test_source_snapshot_must_match_exactly(self):
        calc, cat = fixture()
        for data, field, apply in [(calc, 'asOf', apply_calculator), (cat, 'asof', apply_catalog)]:
            data[field] = '2026-10-31'
            with self.assertRaisesRegex(ValueError, '源快照'):
                apply(data)

    def test_review_metadata_and_current_list_tampering_are_rejected(self):
        calc, cat = fixture()
        for changed in [('checkedAt', '2026-11-01'), ('officialSchedule', {})]:
            other = deepcopy(calc)
            other[changed[0]] = changed[1]
            self.assertTrue(audit_schedule(other, cat))
        for ids in [cat['currentEventIds'][:-1], cat['currentEventIds'] + ['ActivitySummonC03_SSR_001'], list(reversed(cat['currentEventIds']))]:
            other = deepcopy(cat)
            other['currentEventIds'] = ids
            self.assertTrue(audit_schedule(calc, other))

    def test_precise_news_card_and_window_associations_are_guarded(self):
        calc, cat = fixture()
        for key, value in [('newsId', 3598), ('officialId', 'news_3598'), ('card', 'C03_SSR_001'),
                           ('closeAt', '2026-11-11T05:00:00+08:00'), ('openAt', '2026-10-27T00:00:00+08:00')]:
            other = deepcopy(cat)
            event = next(event for event in other['events'] if event['id'] == 'ActivitySummonC01_SSR_001')
            event[key] = value
            self.assertTrue(audit_schedule(calc, other), key)

    def test_apply_rejects_missing_or_misassigned_events(self):
        _, cat = fixture()
        cat['events'].pop()
        with self.assertRaisesRegex(ValueError, '活动缺失'):
            apply_catalog(cat)
        _, cat = fixture()
        cat['events'][0]['card'] = 'C03_SSR_001'
        with self.assertRaisesRegex(ValueError, '卡牌关联错误'):
            apply_catalog(cat)


if __name__ == '__main__':
    unittest.main()
