"""当前中文优先；历史中文仅在关联配置指纹一致时回退。"""
from pathlib import Path
import csv
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
FALLBACKS = ROOT / 'src/client_text_fallbacks.json'
TEXT_KEY = re.compile(r'\b(?:T|UI)_[A-Za-z0-9_]+')
LINK = re.compile(r'\[([^\[\]:]+):[^\[\]]+\]')
SKILL_PRESENTATION = {
    'NAME', 'Description', 'Icon', 'StartEffect', 'EndEffect', 'HitEffect',
    'PerHitEffect', 'PerHitEffectDelayTime', 'CutIn', 'AnimationName',
    'CutinSound', 'ConstSound', 'Sounds', 'VersionControl',
}
TEXT_FIELDS = {
    'skill': ('NAME', 'Description'), 'status': ('Name', 'Description'),
    'role': ('NAME',), 'item': ('Name',), 'scene': ('Name',),
    'roleimprint': ('Description',), 'roleascend': ('Description',),
}


def read_rows(path):
    with Path(path).open(encoding='utf-8-sig', newline='') as stream:
        return list(csv.DictReader(stream, delimiter='@', quoting=csv.QUOTE_NONE))


def row_key(table, row):
    if table in ('roleimprint', 'roleascend'):
        return row['RoleID'] + '@' + row['LV']
    return row['ID']


def fingerprint(table, row):
    if table in ('role', 'item', 'scene'):
        fields = ('ID', 'NAME' if table == 'role' else 'Name')
        semantic = {key: row.get(key, '') for key in fields}
    else:
        excluded = SKILL_PRESENTATION if table == 'skill' else {'Name', 'Description', 'Icon'}
        semantic = {key: value for key, value in row.items() if key not in excluded}
    raw = json.dumps(semantic, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(raw.encode('utf8')).hexdigest()


def load_chinese(directory):
    mapping = {}
    for language in ('CHT', 'CHS'):
        for line in (Path(directory) / language).read_text('utf-8-sig').splitlines()[1:]:
            if '@' in line:
                key, value = line.split('@', 1)
                if value.strip() and not TEXT_KEY.search(value):
                    mapping[key] = value
    return mapping


def clean_text(value, convert=lambda value: value):
    value = re.sub(r'<br\s*/?>', '\n', value or '', flags=re.I)
    value = re.sub(r'<[^>]+>', '', value).replace('\\n', '\n')
    return convert(LINK.sub(r'\1', value))


class ClientText:
    def __init__(self, locale, tables, convert=lambda value: value, fallback_file=FALLBACKS):
        self.current = load_chinese(locale)
        self.tables, self.convert = Path(tables), convert
        self.cached_tables, self.fallbacks = {}, {}
        self.used_fallbacks, self.missing = set(), set()
        path = Path(fallback_file)
        if path.exists():
            for key, record in json.loads(path.read_text('utf8'))['records'].items():
                if record['guards'] and all(self.matches(guard) for guard in record['guards']):
                    self.fallbacks[key] = record['text']

    def matches(self, guard):
        table = guard['table']
        if table not in self.cached_tables:
            path = self.tables / (table + '.txt')
            self.cached_tables[table] = {
                row_key(table, row): fingerprint(table, row) for row in read_rows(path)
            } if path.exists() else {}
        return self.cached_tables[table].get(guard['key']) == guard['fingerprint']

    def __call__(self, value):
        value = value or ''
        if not TEXT_KEY.search(value):
            return clean_text(value, self.convert)
        if value in self.current:
            return clean_text(self.current[value], self.convert)
        if value in self.fallbacks:
            self.used_fallbacks.add(value)
            return clean_text(self.fallbacks[value], self.convert)
        self.missing.add(value)
        return ''


def validate_visible_text(data):
    """阻止构建含内部索引的可见说明；原始配置字段照常保留。"""
    visible = {'name', 'description', 'text', 'title', 'pair', 'summary',
               'availability_evidence', 'limited_kind', 'featuredDescription'}
    skip = {'raw', 'row', 'configs', 'patches', 'sourceHashes'}
    errors = []

    def check(value, path):
        if isinstance(value, str):
            if TEXT_KEY.search(value) or LINK.search(value):
                errors.append(path + ': ' + value[:100])
        elif isinstance(value, list):
            for index, item in enumerate(value):
                check(item, f'{path}[{index}]')

    def walk(value, path='DATA'):
        if isinstance(value, dict):
            for key, item in value.items():
                if key in skip:
                    continue
                here = path + '.' + key
                if key in visible:
                    check(item, here)
                if key == 'items' and isinstance(item, dict):
                    for identifier, name in item.items():
                        check(name, here + '.' + identifier)
                walk(item, here)
        elif isinstance(value, list):
            for index, item in enumerate(value):
                walk(item, f'{path}[{index}]')
    walk(data)
    if errors:
        raise ValueError('可见文本含未解析的客户端标记：\n' + '\n'.join(errors[:20]))
