"""同步已核验的官方日程，保留客户端源快照日期。"""
from copy import deepcopy
from datetime import date, datetime, time, timedelta, timezone
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'src/shared/official_schedule.json'
UTC8 = timezone(timedelta(hours=8))


def window_status(window, at):
    """结束时刻为排他边界；未公布开始钟点的活动按开放日期归类。"""
    if isinstance(at, str):
        at = datetime.fromisoformat(at) if 'T' in at else date.fromisoformat(at)
    if isinstance(at, datetime):
        if at.tzinfo is None:
            raise ValueError('日程时刻须带时区')
        moment = at.astimezone(UTC8)
    elif isinstance(at, date):
        moment = datetime.combine(at, time.min, UTC8)
    else:
        raise TypeError('日程时刻须为日期或带时区的时间')
    close = datetime.fromisoformat(window['closeAt'])
    if close.utcoffset() != timedelta(hours=8):
        raise ValueError('官方日程须使用UTC+8')
    if moment >= close:
        return 'past'
    if moment.date() < date.fromisoformat(window['openDate']):
        return 'future'
    return 'current'


def load_schedule():
    schedule = json.loads(MANIFEST.read_text('utf8'))
    if schedule.get('schema') != 1:
        raise ValueError('官方日程版本无对应解析规则')
    if date.fromisoformat(schedule['checkedAt']) < date.fromisoformat(schedule['sourceAsOf']):
        raise ValueError('核查日期早于源快照日期')
    ids = [identifier for window in schedule['windows'] for identifier in window['eventIds']]
    if len(ids) != len(set(ids)):
        raise ValueError('官方日程含重复活动编号')
    expected = set()
    for window in schedule['windows']:
        if window['officialId'] != 'news_' + str(window['newsId']):
            raise ValueError('官方新闻编号关联错误')
        if window['url'] != 'https://game.ero-labs.global/zh/news.html?id=' + str(window['newsId']):
            raise ValueError('官方新闻链接关联错误')
        if window['openDescription'] != '活动开启后' or 'openAt' in window:
            raise ValueError('本批公告开放钟点须保留原始日期口径')
        if date.fromisoformat(window['openDate']) >= datetime.fromisoformat(window['closeAt']).astimezone(UTC8).date():
            raise ValueError('活动时间窗为空')
        if window_status(window, schedule['checkedAt']) == 'current':
            expected.update(window['eventIds'])
    if len(schedule['currentEventIds']) != len(set(schedule['currentEventIds'])) or set(schedule['currentEventIds']) != expected:
        raise ValueError('当前活动集合与核查日期对应的时间窗不同')
    return schedule


def review_metadata(schedule):
    encoded = json.dumps(schedule, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf8')
    return {key: schedule[key] for key in ('catalog', 'sourceAsOf', 'checkedAt', 'catalogSHA256')} | {
        'manifestSHA256': hashlib.sha256(encoded).hexdigest()
    }


def _apply_shared(data, source_field):
    schedule = load_schedule()
    if data.get('catalog') != schedule['catalog'] or data.get(source_field) != schedule['sourceAsOf']:
        raise ValueError('官方日程与客户端源快照不匹配')
    cards = {card['id']: card for card in data['cards']}
    missing = set(schedule['cards']) - set(cards)
    if missing:
        raise ValueError('官方日程关联卡牌缺失：' + ','.join(sorted(missing)))
    data['checkedAt'] = schedule['checkedAt']
    data['officialSchedule'] = review_metadata(schedule)
    for identifier, fields in schedule['cards'].items():
        cards[identifier].update(deepcopy(fields))
    return schedule


def apply_calculator(data):
    """原位更新计算器开放状态与核查元数据，返回原对象。"""
    _apply_shared(data, 'asOf')
    return data


def apply_catalog(data):
    """原位更新图鉴日程、公告关联和开放状态，返回原对象。"""
    schedule = _apply_shared(data, 'asof')
    events = {event['id']: event for event in data['events']}
    missing = {identifier for window in schedule['windows'] for identifier in window['eventIds']} - set(events)
    if missing:
        raise ValueError('官方日程关联活动缺失：' + ','.join(sorted(missing)))
    data['currentEventIds'] = schedule['currentEventIds'][:]
    data.setdefault('eventDates', {}).update({window['cardId']: window['officialDates'] for window in schedule['windows']})
    notices = {str(notice['id']): notice for notice in data.get('notices', [])}
    for window in schedule['windows']:
        state = window_status(window, schedule['checkedAt'])
        for identifier in window['eventIds']:
            event = events[identifier]
            if event.get('card') != window['cardId']:
                raise ValueError('官方日程活动与卡牌关联错误：' + identifier)
            event.update({key: window[key] for key in ('officialId', 'newsId', 'openDate', 'openDescription', 'closeAt', 'officialDates')})
            event['status'] = state
            event.pop('openAt', None)
        if window['officialId'] in notices:
            notices[window['officialId']].update(url=window['url'], newsId=window['newsId'])
    return data


def audit_schedule(calculator, catalog):
    """返回与已核验清单逐项比较的错误，不修改输入。"""
    schedule = load_schedule()
    errors = []

    def require(ok, path, message):
        if not ok:
            errors.append({'path': path, 'error': message})

    for name, data, field in [('calculator', calculator, 'asOf'), ('catalog', catalog, 'asof')]:
        require(data.get('catalog') == schedule['catalog'], name + '.catalog', '资源目录与已核查日程不同')
        require(data.get(field) == schedule['sourceAsOf'], name + '.' + field, '客户端源快照日期与已核查日程不同')
        require(data.get('checkedAt') == schedule['checkedAt'], name + '.checkedAt', '核查日期与明确日程清单不同')
        require(data.get('officialSchedule') == review_metadata(schedule), name + '.officialSchedule', '官方日程元数据与清单不同')
        cards = {card['id']: card for card in data['cards']}
        for identifier, fields in schedule['cards'].items():
            for key, value in fields.items():
                require(cards.get(identifier, {}).get(key) == value, name + '.cards.' + identifier + '.' + key, '卡牌开放状态与已核验记录不同')
    require(catalog.get('currentEventIds') == schedule['currentEventIds'], 'catalog.currentEventIds', '当前活动集合与已核验清单不同')
    events = {event['id']: event for event in catalog['events']}
    notices = {str(notice['id']): notice for notice in catalog.get('notices', [])}
    for window in schedule['windows']:
        require(catalog.get('eventDates', {}).get(window['cardId']) == window['officialDates'], 'catalog.eventDates.' + window['cardId'], '活动档期与已核验公告不同')
        for identifier in window['eventIds']:
            event = events.get(identifier, {})
            expected = {key: window[key] for key in ('officialId', 'newsId', 'openDate', 'openDescription', 'closeAt', 'officialDates')}
            expected.update(card=window['cardId'], status=window_status(window, schedule['checkedAt']))
            for key, value in expected.items():
                require(event.get(key) == value, 'catalog.events.' + identifier + '.' + key, '活动档期或公告关联与清单不同')
            require('openAt' not in event, 'catalog.events.' + identifier + '.openAt', '公告的开始钟点未提供，应保留开放日期')
        notice = notices.get(window['officialId'], {})
        require(bool(notice), 'catalog.notices.' + window['officialId'], '对应官方公告缺失')
        require(notice.get('url') == window['url'] and notice.get('newsId') == window['newsId'], 'catalog.notices.' + window['officialId'], '官方新闻阅读链接或编号不同')
    return errors
