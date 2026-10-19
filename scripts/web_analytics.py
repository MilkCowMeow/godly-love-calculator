"""Add the public Cloudflare beacon to production pages only."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / 'src/web_analytics.json'


def inject_analytics(html):
    if not CONFIG.exists():
        return html
    config = json.loads(CONFIG.read_text('utf8'))
    token = config['site_token']
    if not re.fullmatch(r'[a-f0-9]{32}', token):
        raise ValueError('Expected a public Cloudflare Web Analytics site token')
    snippet = '''<script id="production-web-analytics">
(function () {
  if (location.protocol !== 'https:' || location.hostname !== 'milkcowmeow.github.io' ||
      !/^\\/godly-love-calculator(?:\\/|$)/.test(location.pathname) ||
      document.getElementById('cloudflare-web-analytics')) return;
  var beacon = document.createElement('script');
  beacon.id = 'cloudflare-web-analytics';
  beacon.defer = true;
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.setAttribute('data-cf-beacon', JSON.stringify({token: TOKEN}));
  document.head.appendChild(beacon);
})();
</script>'''.replace('TOKEN', json.dumps(token))
    if html.count('</body>') != 1:
        raise ValueError('Expected one closing body tag')
    return html.replace('</body>', snippet + '</body>')
