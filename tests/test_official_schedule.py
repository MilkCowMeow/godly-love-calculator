"""已核实官方档期的时区、结束边界与双站同步保护。"""
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from official_schedule import (apply_calculator, apply_catalog, audit_announced_events,
                               audit_schedule, load_schedule, window_status)


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
        schedule = load_schedule()
        calc, cat = fixture()
        self.assertEqual(calc['asOf'], schedule['sourceAsOf'])
        self.assertEqual(cat['asof'], schedule['sourceAsOf'])
        self.assertEqual(calc['checkedAt'], schedule['checkedAt'])
        self.assertEqual(cat['checkedAt'], schedule['checkedAt'])
        self.assertEqual(audit_schedule(calc, cat), [])

    def test_rain_remains_available_in_the_permanent_pool_after_pickup(self):
        calc, cat = fixture()
        schedule = load_schedule()
        for data in (calc, cat):
            rain = next(card for card in data['cards'] if card['id'] == 'C03_SSR_001')
            stage = next(card for card in data['cards'] if card['id'] == 'C01_SSR_001')
            self.assertEqual(rain['availability'], 'current_base')
            self.assertEqual(stage['availability'], 'current_base')
            self.assertEqual(stage['status'], schedule['cards']['C01_SSR_001']['status'])
        self.assertEqual(cat['currentEventIds'], schedule['currentEventIds'])
        for window in schedule['windows']:
            for identifier in window['eventIds']:
                self.assertEqual(identifier in cat['currentEventIds'], window_status(window, schedule.get('checkedAtTime', schedule['checkedAt'])) == 'current')

    def test_end_time_is_exclusive_and_uses_utc8(self):
        window = load_schedule()['windows'][0]
        close = datetime.fromisoformat(window['closeAt'])
        open_day = date.fromisoformat(window['openDate'])
        self.assertEqual(window_status(window, close - timedelta(seconds=1)), 'current')
        self.assertEqual(window_status(window, close), 'past')
        self.assertEqual(window_status(window, close.astimezone(timezone.utc)), 'past')
        self.assertEqual(window_status(window, open_day - timedelta(days=1)), 'future')
        self.assertEqual(window_status(window, open_day), 'current')
        with self.assertRaisesRegex(ValueError, '时区'):
            window_status(window, close.replace(tzinfo=None))

    def test_source_snapshot_must_match_exactly(self):
        calc, cat = fixture()
        for data, field, apply in [(calc, 'asOf', apply_calculator), (cat, 'asof', apply_catalog)]:
            data[field] = (date.fromisoformat(data[field]) + timedelta(days=1)).isoformat()
            with self.assertRaisesRegex(ValueError, '源快照'):
                apply(data)

    def test_review_metadata_and_current_list_tampering_are_rejected(self):
        calc, cat = fixture()
        next_day = (date.fromisoformat(calc['checkedAt']) + timedelta(days=1)).isoformat()
        for changed in [('checkedAt', next_day), ('officialSchedule', {})]:
            other = deepcopy(calc)
            other[changed[0]] = changed[1]
            self.assertTrue(audit_schedule(other, cat))
        for ids in [cat['currentEventIds'][:-1], cat['currentEventIds'] + ['__UnknownEvent'], list(reversed(cat['currentEventIds']))]:
            other = deepcopy(cat)
            other['currentEventIds'] = ids
            self.assertTrue(audit_schedule(calc, other))

    def test_precise_news_card_and_window_associations_are_guarded(self):
        calc, cat = fixture()
        window = load_schedule()['windows'][0]
        altered_close = (datetime.fromisoformat(window['closeAt']) + timedelta(days=1)).isoformat()
        for key, value in [('newsId', -1), ('officialId', 'news_wrong'), ('card', '__WrongCard'),
                           ('closeAt', altered_close), ('openAt', window['openDate'] + 'T00:00:00+08:00')]:
            other = deepcopy(cat)
            event = next(event for event in other['events'] if event['id'] == window['eventIds'][0])
            event[key] = value
            self.assertTrue(audit_schedule(calc, other), key)

    def test_apply_rejects_missing_or_misassigned_events(self):
        _, cat = fixture()
        cat['events'].pop()
        with self.assertRaisesRegex(ValueError, '活动缺失'):
            apply_catalog(cat)
        _, cat = fixture()
        cat['events'][0]['card'] = '__WrongCard'
        with self.assertRaisesRegex(ValueError, '卡牌关联错误'):
            apply_catalog(cat)


class AnnouncedEventCoverageTests(unittest.TestCase):
    @staticmethod
    def sample():
        schedule = deepcopy(load_schedule())
        window = schedule['windows'][0]
        kind = ('纪事活动' if any(i.startswith('Branch') for i in window['eventIds']) else
                '通行证' if any(i.startswith('BattlePass') for i in window['eventIds']) else '限时心选')
        cards = [{'id': window['cardId'], 'name': '测试羁绊'}]
        news = [{'newsId': window['newsId'], 'name': kind + '「测试羁绊」正式开始！'}]
        return schedule, cards, news

    def test_existing_covered_news_accepts_both_api_and_catalog_shapes(self):
        schedule, cards, news = self.sample()
        self.assertEqual(audit_announced_events(news, cards, schedule), [])
        self.assertEqual(audit_announced_events({'data': {'news': news}}, cards, schedule), [])
        notice = {'id': 'news_' + str(news[0]['newsId']), 'name': news[0]['name']}
        self.assertEqual(audit_announced_events({'notices': [notice], 'cards': cards}, schedule=schedule), [])

    def test_new_announcement_for_existing_card_requires_its_own_window(self):
        schedule, cards, news = self.sample()
        news.append({'newsId': max(window['newsId'] for window in schedule['windows']) + 100,
                     'name': 'SSR羁绊「测试羁绊」限时概率提升！'})
        errors = audit_announced_events(news, cards, schedule)
        self.assertEqual(len(errors), 1)
        self.assertIn('尚无对应日程关联', errors[0]['error'])

    def test_heat_chronicle_omission_is_detected(self):
        schedule = deepcopy(load_schedule())
        schedule['windows'] = [window for window in schedule['windows'] if window['cardId'] != 'C03_SSR_006']
        cards = [{'id': 'C03_SSR_006', 'name': '热汗缠绵'}]
        news = [{'newsId': 3677, 'name': '限时纪事活动「热汗缠绵」正式开始！'}]
        errors = audit_announced_events(news, cards, schedule)
        self.assertEqual(len(errors), 1)
        self.assertIn('热汗缠绵', errors[0]['error'])

    def test_future_announcement_requires_a_complete_future_window(self):
        schedule, cards, _ = self.sample()
        identifier = max(window['newsId'] for window in schedule['windows']) + 101
        news = [{'newsId': identifier, 'name': '通行证「测试羁绊」即将开启！'}]
        self.assertTrue(audit_announced_events(news, cards, schedule))
        open_day = date.fromisoformat(schedule['checkedAt']) + timedelta(days=7)
        window = {'newsId': identifier, 'cardId': cards[0]['id'], 'eventIds': ['BattlePass_QA'],
                  'openDate': open_day.isoformat(), 'closeAt': (open_day + timedelta(days=28)).isoformat() + 'T14:00:00+08:00'}
        schedule['windows'].append(window)
        self.assertEqual(window_status(window, schedule.get('checkedAtTime', schedule['checkedAt'])), 'future')
        self.assertEqual(audit_announced_events(news, cards, schedule), [])
        del window['closeAt']
        self.assertTrue(audit_announced_events(news, cards, schedule))

    def test_card_and_event_category_are_both_required(self):
        schedule, cards, news = self.sample()
        identifier = news[0]['newsId']
        wrong = deepcopy(schedule)
        for window in wrong['windows']:
            if window['newsId'] == identifier:
                window['cardId'] = '__WrongCard'
        self.assertTrue(audit_announced_events(news, cards, wrong))
        self.assertTrue(audit_announced_events([{'newsId': identifier, 'name': '通行证「测试羁绊」正式开始！'}], cards,
                                             {**schedule, 'windows': [{**schedule['windows'][0], 'eventIds': ['Branch_QA']}]}))

    def test_omitted_player_definition_is_reported_for_named_event(self):
        schedule, _, _ = self.sample()
        errors = audit_announced_events([{'newsId': 99999, 'name': '限时纪事活动「全新羁绊」即将开启！'}], [], schedule)
        self.assertEqual(len(errors), 1)
        self.assertIn('卡牌尚未收录', errors[0]['error'])

    def test_general_news_and_legacy_banner_id_space_are_separate(self):
        schedule, cards, news = self.sample()
        news += [{'id': 25689, 'name': '限时纪事活动「测试羁绊」正式开始！',
                  'url': 'https://ann-gloa-labs.godly-love.com/bannerContent?gameId=gloa_cn&id=25689'},
                 {'newsId': 88888, 'name': '《神明恋爱放送中》开发者日志Vol.03', 'intro': '测试羁绊活动筹备中。'},
                 {'newsId': 88889, 'name': 'BL手游《神明恋爱放送中》正式上线 限时活动《测试羁绊》同步开启'}]
        self.assertEqual(audit_announced_events(news, cards, schedule), [])

    def test_production_audit_and_catalog_sync_reject_uncovered_notice(self):
        calc, cat = fixture()
        name = '覆盖测试羁绊'
        cat['cards'][0]['name'] = name
        cat['notices'].append({'id': 'news_99998', 'name': '通行证「' + name + '」即将开启！'})
        self.assertTrue(any('尚无对应日程关联' in error['error'] for error in audit_schedule(calc, cat)))
        with self.assertRaisesRegex(ValueError, '官方活动公告覆盖不完整'):
            apply_catalog(cat)


if __name__ == '__main__':
    unittest.main()
