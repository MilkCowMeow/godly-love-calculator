"""Build a standalone motion preview without writing the published site."""
from pathlib import Path
import hashlib
import json
import subprocess
import argparse
from embedded import extract

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--out', type=Path, default=Path('D:/GodlyLove/output/html/神明恋爱放送中_伤害计算器_动画预览.html'))
args = parser.parse_args()
source = ROOT / 'docs/index.html'
before = hashlib.sha256(source.read_bytes()).hexdigest()
original = source.read_text('utf8')
css = '''.motion-preview-mark{display:inline-flex;align-items:center;gap:7px;font:10px/1.2 BookEN,var(--body);letter-spacing:.08em;color:var(--muted);margin:0 0 11px}
.motion-preview-mark::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--gold)}
@media(max-width:720px){.motion-preview-mark{font-size:9px;margin-bottom:9px}}'''
js = "const mark=document.createElement('span');mark.className='motion-preview-mark';mark.textContent='离线动画预览';document.querySelector('.intro>div').prepend(mark);"
if 'function seat(slot,focus=false)' not in original:
    raise RuntimeError('Build docs/index.html with build_calculator.py first')
subprocess.run(['node', '--check', str(ROOT / 'src/calculator/motion.js')], check=True)
preview = original.replace('</style>', '\n' + css + '\n</style>', 1)
preview = preview.replace('</body>', '<script>\n' + js + '\n</script></body>', 1)
preview = preview.replace('<title>伤害计算器 神明恋爱放送中</title>', '<title>动画预览 伤害计算器 神明恋爱放送中</title>', 1)
preview = preview.replace('href="catalog.html"', 'href="神明恋爱放送中_角色与活动图鉴.html"')
if preview == original:
    raise RuntimeError('No preview injected')
if args.out.resolve() == source.resolve():
    raise ValueError('Preview must not overwrite docs/index.html')
for name in ('DATA', 'ASSETS', 'SIM_WORKER_SOURCE'):
    if extract(original, name) != extract(preview, name):
        raise RuntimeError('Presentation-only invariant failed: ' + name)
    print(name + ': unchanged')
args.out.parent.mkdir(parents=True, exist_ok=True)
args.out.write_text(preview, 'utf8')
assert hashlib.sha256(source.read_bytes()).hexdigest() == before
print(json.dumps({'output': str(args.out), 'bytes': args.out.stat().st_size, 'published_html_sha256': before}, ensure_ascii=False))
