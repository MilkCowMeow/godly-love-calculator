"""同步已核验的官方日程，保留客户端源快照日期。"""
from copy import deepcopy
from datetime import date, datetime, time, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import parse_qs, urlsplit

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
    if schedule.get('checkedAtTime'):
        moment = datetime.fromisoformat(schedule['checkedAtTime'])
        if moment.utcoffset() != timedelta(hours=8) or moment.date().isoformat() != schedule['checkedAt']:
            raise ValueError('核查时刻须与UTC+8核查日期一致')
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
        if window_status(window, schedule.get('checkedAtTime', schedule['checkedAt'])) == 'current':
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
    for key in ('featuredCard', 'featuredDescription'):
        if key in schedule:
            data[key] = schedule[key]
    data.setdefault('eventDates', {}).update({window['cardId']: window['officialDates'] for window in schedule['windows']})
    notices = {str(notice['id']): notice for notice in data.get('notices', [])}
    for window in schedule['windows']:
        state = window_status(window, schedule.get('checkedAtTime', schedule['checkedAt']))
        for identifier in window['eventIds']:
            event = events[identifier]
            if event.get('card') != window['cardId']:
                raise ValueError('官方日程活动与卡牌关联错误：' + identifier)
            event.update({key: window[key] for key in ('officialId', 'newsId', 'openDate', 'openDescription', 'closeAt', 'officialDates')})
            event['status'] = state
            event.pop('openAt', None)
        if window['officialId'] in notices:
            notices[window['officialId']].update(url=window['url'], newsId=window['newsId'])
    uncovered = audit_announced_events(data.get('notices', []), data['cards'], schedule)
    if uncovered:
        raise ValueError('官方活动公告覆盖不完整：' + '；'.join(error['error'] for error in uncovered))
    return data


def audit_announced_events(news, cards=None, schedule=None):
    """从简体公告标题独立检查活动覆盖，包含尚未开放的公告。

    news接受规范化新闻数组、官方data.news响应或含notices/cards的图鉴对象。
    识别三类专门活动公告：纪事、通行证、限时心选或概率提升。
    历史bannerContent使用独立编号空间，其同名正式news由本检查覆盖。
    """
    schedule = schedule or load_schedule()
    if isinstance(news, dict):
        if 'notices' in news:
            cards = news.get('cards', cards)
            news = news['notices']
        else:
            news = news.get('data', news).get('news', [])
    if isinstance(cards, dict):
        cards = list(cards.values())
    cards = cards or []
    names = {}
    for card in cards:
        name = re.sub(r'\s+', '', str(card.get('name', '')))
        if len(name) >= 2 and name not in {'卡名缺失', '未公布卡名', '未命名'}:
            names.setdefault(name, set()).add(card['id'])
    errors = []
    seen = set()
    for index, notice in enumerate(news):
        title = re.sub(r'\s+', '', str(notice.get('name') or notice.get('title') or ''))
        url = urlsplit(str(notice.get('url', '')))
        identifier = notice.get('newsId')
        raw_id = str(notice.get('id', ''))
        if identifier is None and raw_id.startswith('news_'):
            identifier = raw_id[5:]
        if identifier is None and url.path.endswith('bannerContent'):
            continue
        if identifier is None:
            identifier = parse_qs(url.query).get('id', [notice.get('id')])[0]
        # 活动专门公告的标题把活动类别和卡名一起给出。
        if '通行证' in title:
            kind, prefix = '通行证', 'BattlePass'
        elif '纪事' in title:
            kind, prefix = '纪事', 'Branch'
        elif re.search(r'(?:概率|机率)(?:提升|UP)|(?:限时|限定)(?:心选|招募)|(?:心选|招募)(?:概率|机率)?提升', title, re.I):
            kind, prefix = '心选UP', 'ActivitySummon'
        else:
            continue
        matched = {name: ids for name, ids in names.items() if name in title}
        # quoted title names keep a newly announced card visible even when its
        # player definition has also been omitted from the imported card list.
        quoted = [part for group in re.findall(r'「([^」]+)」|《([^》]+)》|“([^”]+)”|"([^\"]+)"', title)
                  for part in group if part]
        quoted = [name for name in quoted if name not in {'神明恋爱放送中', '新手心选'}]
        if not matched and not quoted:
            continue
        path = 'announcements.' + str(identifier if identifier is not None else index)
        try:
            identifier = int(identifier)
        except (TypeError, ValueError):
            errors.append({'path': path, 'error': '活动公告缺少有效官方新闻编号：' + title})
            continue
        token = (identifier, title)
        if token in seen:
            continue
        seen.add(token)
        if not matched:
            errors.append({'path': path, 'error': '活动公告标题的卡牌尚未收录：' + title})
            continue
        for name, candidates in matched.items():
            windows = [window for window in schedule['windows'] if window.get('newsId') == identifier
                       and window.get('cardId') in candidates
                       and any(event_id.startswith(prefix) for event_id in window.get('eventIds', []))]
            if not windows:
                errors.append({'path': path, 'error': '已公告' + kind + '尚无对应日程关联：' + name + '，新闻' + str(identifier)})
                continue
            for window in windows:
                try:
                    # Future announcements require a complete window as well.
                    window_status(window, schedule.get('checkedAtTime', schedule['checkedAt']))
                    date.fromisoformat(window['openDate'])
                    if datetime.fromisoformat(window['closeAt']).date() < date.fromisoformat(window['openDate']):
                        raise ValueError('结束日期早于开始日期')
                except (KeyError, TypeError, ValueError) as error:
                    errors.append({'path': path, 'error': '已公告活动缺少完整有效档期：' + name + '，' + str(error)})
    return errors


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
            expected.update(card=window['cardId'], status=window_status(window, schedule.get('checkedAtTime', schedule['checkedAt'])))
            for key, value in expected.items():
                require(event.get(key) == value, 'catalog.events.' + identifier + '.' + key, '活动档期或公告关联与清单不同')
            require('openAt' not in event, 'catalog.events.' + identifier + '.openAt', '公告的开始钟点未提供，应保留开放日期')
        notice = notices.get(window['officialId'], {})
        require(bool(notice), 'catalog.notices.' + window['officialId'], '对应官方公告缺失')
        require(notice.get('url') == window['url'] and notice.get('newsId') == window['newsId'], 'catalog.notices.' + window['officialId'], '官方新闻阅读链接或编号不同')
    errors.extend(audit_announced_events(catalog.get('notices', []), catalog['cards'], schedule))
    return errors
