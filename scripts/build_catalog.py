"""Rebuild the self-contained catalog while retaining its embedded art and data."""
from pathlib import Path
import json
import re
from embedded import extract
from card_characters import assign_characters

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'src/catalog'
TARGET = ROOT / 'docs/catalog.html'
old = TARGET.read_text('utf8')
data, assets = extract(old, 'DATA'), extract(old, 'ASSETS')
client = extract((ROOT / 'docs/index.html').read_text('utf8'), 'DATA')
roles = {card['id']: card['raw'] for card in client['cards']}
for card in data['cards']:
    card['represents'] = roles[card['id']]['Represents']
    assign_characters(card, card['represents'], data['profiles'])

fonts = '\n'.join(re.findall(r'@font-face\{[^}]*\}', old))
safe = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
html = (SRC / 'template.html').read_text('utf8')
for token, value in {
    'STYLE': fonts + (SRC / 'style.css').read_text('utf8'),
    'DATA': 'const DATA=' + safe(data) + ';\nconst ASSETS=' + safe(assets) + ';',
    'APP': (SRC / 'app.js').read_text('utf8'),
}.items():
    html = html.replace('/*' + token + '*/', value)
TARGET.write_text(html, 'utf8')
print(f'Built docs/catalog.html: {len(data["cards"])} cards, '
      f'{sum(len(c["characters"]) == 1 for c in data["cards"])} solo cards')
