"""Rebuild the self-contained catalog while retaining its embedded art and data."""
from pathlib import Path
import json
import re
import argparse
import base64
import hashlib
import io
import math
import struct
from embedded import extract
from card_characters import assign_characters
from web_analytics import inject_analytics

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'src/catalog'
TARGET = ROOT / 'docs/catalog.html'
old = TARGET.read_text('utf8')
data, assets = extract(old, 'DATA'), extract(old, 'ASSETS')
client = extract((ROOT / 'docs/index.html').read_text('utf8'), 'DATA')
client_assets = extract((ROOT / 'docs/index.html').read_text('utf8'), 'ASSETS')
parser = argparse.ArgumentParser()
parser.add_argument('--r-art-dir', type=Path, help='Optional local folder with the original R-card PNG sprites')
parser.add_argument('--font-dir', type=Path, help='Optional font folder when new text needs an expanded embedded subset')
parser.add_argument('--dataset-json', type=Path, help='本轮已同步的图鉴数据与原画字典')
args = parser.parse_args()
if args.dataset_json:
    current=json.loads(args.dataset_json.read_text('utf8'));data,assets=current['data'],current['assets']
item_rows = json.loads((SRC / 'r_card_items.json').read_text('utf8'))
previous = {card['id']: card for card in data['cards']}
elements = {'None':'无属性','Fire':'红璇','Ice':'蓝澈','Earth':'绿琉','Ground':'黄曜','Light':'光','Dark':'暗'}
jobs = {'Defender':'守护','Warrior':'戒律','Medic':'祈祷','Vanguard':'审判'}
levels = {int(row['level']) for row in data['cards'][0]['stats']}


def asset(key):
    if key and key not in assets:
        assets[key] = client_assets[key]
    return key


def r_art(card):
    old_card = previous.get(card['id'], {})
    if args.r_art_dir:
        from PIL import Image
        candidates = [args.r_art_dir / (card['id'] + suffix + '.png')
                      for suffix in ['_M_icon', '_icon', '_S_icon']]
        candidates = [path for path in candidates if path.exists()]
        if candidates:
            def area(path):
                with Image.open(path) as image:
                    return math.prod(image.size)
            path = max(candidates, key=area)
            with Image.open(path) as image:
                out = io.BytesIO()
                image.convert('RGBA').save(out, 'WEBP', quality=94, method=4)
            raw = out.getvalue()
            key = hashlib.sha256(raw).hexdigest()[:16]
            assets[key] = 'data:image/webp;base64,' + base64.b64encode(raw).decode()
            return key
    return old_card.get('art') or asset(card.get('thumb'))


def calculator_thumb(card):
    if args.r_art_dir:
        from PIL import Image
        path = args.r_art_dir / (card['id'] + '_S_icon.png')
        if path.exists():
            with Image.open(path) as image:
                out = io.BytesIO()
                image.convert('RGBA').save(out, 'WEBP', quality=94, method=4)
            raw = out.getvalue()
            key = hashlib.sha256(raw).hexdigest()[:16]
            assets[key] = 'data:image/webp;base64,' + base64.b64encode(raw).decode()
            return key
    return previous.get(card['id'], {}).get('calculatorThumb') or asset(card.get('thumb'))


def base_stats(row):
    stats = dict(row['stats'])
    # Same zero-star float32 rounding used by the calculator's baseStats.
    for key in ['HP', 'MaxHP', 'Attack', 'Defence', 'Speed']:
        value = struct.unpack('f', struct.pack('f', stats[key]))[0]
        stats[key] = round(value) if key in ['HP', 'MaxHP', 'Speed'] else math.trunc(value)
    return {'level': str(row['level']), **stats}


def make_r_card(card):
    item = item_rows[card['id']]
    tags = item['Tags'].split('~')
    base = not card['raw']['VersionControl'] and not item['VersionControl'] and 'NormalR' in tags
    skills = []
    for sid in card['skills']:
        source = client['skills'][sid]
        skills.append({'id': sid, 'name': source['name'], 'description': source['description'],
                       'hidden': sid in card.get('hiddenSkills', []),
                       'passive': source['raw']['SkillType'] == 'Passive',
                       'row': source['raw'], 'configs': source['configs']})
    status_ids = set()

    def collect(value):
        if isinstance(value, str):
            status_ids.update(token for token in value.split('~') if token in client['statuses'])
        elif isinstance(value, list):
            for entry in value: collect(entry)
        elif isinstance(value, dict):
            for entry in value.values(): collect(entry)

    collect([skill['configs'] for skill in skills])
    art = r_art(card)
    stages = [{**row, 'text': row.get('description', ''),
               'patches': [config['value'] for config in row.get('configs', [])]}
              for row in card['imprint']]
    return {'id': card['id'], 'name': card['name'], 'rarity': 'R',
            'element': elements[card['element']], 'job': jobs[card['job']],
            'availability': 'current_base' if base else 'client_config',
            'availability_evidence': '角色与道具均无版本门槛，道具配置含 NormalR 常驻标签。'
                if base else '客户端已配置此卡，但未取得对应的开放公告或常驻池标签。',
            'item_tags': tags, 'version_gate': item['VersionControl'] or card['raw']['VersionControl'],
            'limited_kind': '常驻 R 卡' if base else 'R 卡', 'related_activities': [],
            'art': art, 'thumb': art, 'calculatorThumb': calculator_thumb(card), 'artNote': '',
            'elementIcon': asset(client['elementIcons'][card['element']]),
            'jobIcon': asset(client['jobIcons'][card['job']]),
            'stats': [base_stats(row) for row in card['levelStats'] if row['level'] in levels],
            'skills': skills, 'imprint': stages, 'ascend': [], 'statusIds': sorted(status_ids)}


data['cards'] = [card for card in data['cards'] if card['rarity'] != 'R'] + [
    make_r_card(card) for card in client['cards'] if card['rarity'] == 'R']
roles = {card['id']: card['raw'] for card in client['cards']}
for card in data['cards']:
    card['represents'] = roles[card['id']]['Represents']
    assign_characters(card, card['represents'], data['profiles'])

fonts = '\n'.join(re.findall(r'@font-face\{[^}]*\}', old))
if args.font_dir:
    from fontTools import subset
    from fontTools.ttLib import TTFont
    fonts = ''
    content = json.dumps(data, ensure_ascii=False) + ''.join(path.read_text('utf8') for path in SRC.glob('*.html')) + (SRC / 'app.js').read_text('utf8')
    for name, filename in [('BookCN', 'STSONG.TTF'), ('TitleCN', 'STZHONGS.TTF'), ('BookEN', 'times.ttf')]:
        font = TTFont(args.font_dir / filename)
        sub = subset.Subsetter(options=subset.Options())
        sub.populate(text=content)
        sub.subset(font)
        font.flavor = 'woff2'
        out = io.BytesIO()
        font.save(out)
        fonts += '@font-face{font-family:' + name + ';src:url(data:font/woff2;base64,' + base64.b64encode(out.getvalue()).decode() + ') format("woff2");font-display:swap;}\n'
safe = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
html = (SRC / 'template.html').read_text('utf8')
for token, value in {
    'STYLE': fonts + (SRC / 'style.css').read_text('utf8') + (SRC / 'motion.css').read_text('utf8'),
    'DATA': 'const DATA=' + safe(data) + ';\nconst ASSETS=' + safe(assets) + ';',
    'APP': (SRC / 'app.js').read_text('utf8') + '\n' + (SRC / 'motion.js').read_text('utf8'),
}.items():
    html = html.replace('/*' + token + '*/', value)
TARGET.write_text(inject_analytics(html), 'utf8')
print(f'Built docs/catalog.html: {len(data["cards"])} cards, '
      f'{sum(len(c["characters"]) == 1 for c in data["cards"])} solo cards')
