"""发布前统一入口：检查原表、完整回归及构建文件一致性。"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

from audit_client_content import audit_sources, load_published

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', type=Path)
    parser.add_argument('--locale', type=Path)
    parser.add_argument('--report', type=Path, default=ROOT / '.tmp/release-report.json')
    args = parser.parse_args()
    if bool(args.tables) != bool(args.locale):
        parser.error('--tables 与 --locale 需同时传入')
    report = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'checks': {}, 'ok': False}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    try:
        if args.tables:
            calculator, catalog = load_published()
            source = audit_sources(calculator, catalog, args.tables, args.locale)
            report['sourceAudit'] = source
            report['checks']['sourceData'] = not source['errors']
            if source['errors']:
                raise RuntimeError('原表审计失败：' + json.dumps(source['errors'][:10], ensure_ascii=False))
            del calculator, catalog
        environment = os.environ.copy()
        if args.tables:
            environment['GL_CLIENT_TABLES'] = str(args.tables.resolve())
            environment['GL_CLIENT_LOCALE'] = str(args.locale.resolve())
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/run_tests.py')], cwd=ROOT, env=environment)
        report['checks']['fullRegression'] = result.returncode == 0
        if result.returncode:
            raise RuntimeError('完整回归未通过')
        report['publishedFiles'] = {name: hashlib.sha256((ROOT / 'docs' / name).read_bytes().replace(b'\r\n', b'\n')).hexdigest()
                                    for name in ('index.html', 'catalog.html')}
        report['ok'] = True
    except Exception as error:
        report['error'] = str(error)
        print(str(error), file=sys.stderr)
    finally:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'ok': report['ok'], 'checks': report['checks'], 'report': str(args.report)}, ensure_ascii=False))
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
