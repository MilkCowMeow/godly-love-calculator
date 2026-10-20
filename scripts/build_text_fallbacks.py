"""为当前中文表省略的条目生成有配置指纹保护的历史中文补充。"""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
from client_text import FALLBACKS, TEXT_FIELDS, TEXT_KEY, fingerprint, load_chinese, read_rows, row_key

p = argparse.ArgumentParser(description=__doc__)
for field in ('current-tables', 'current-locale', 'previous-tables', 'previous-locale'):
    p.add_argument('--' + field, type=Path, required=True)
p.add_argument('--output', type=Path, default=FALLBACKS)
args = p.parse_args()
current, previous = load_chinese(args.current_locale), load_chinese(args.previous_locale)
references, rejected, sources = defaultdict(list), set(), {}
for table, fields in TEXT_FIELDS.items():
    new_path, old_path = args.current_tables / (table + '.txt'), args.previous_tables / (table + '.txt')
    old_rows = {row_key(table, row): row for row in read_rows(old_path)}
    for label, path in (('current', new_path), ('previous', old_path)):
        sources[f'{label}/{table}.txt'] = hashlib.sha256(path.read_bytes()).hexdigest()
    for row in read_rows(new_path):
        identity, old = row_key(table, row), old_rows.get(row_key(table, row))
        for field in fields:
            key = row[field]
            if not TEXT_KEY.fullmatch(key or '') or key in current or key not in previous:
                continue
            if not old or old[field] != key or fingerprint(table, row) != fingerprint(table, old):
                rejected.add(key)
                continue
            references[key].append({'table': table, 'key': identity, 'fingerprint': fingerprint(table, row)})
for label, root in (('current', args.current_locale), ('previous', args.previous_locale)):
    for language in ('CHT', 'CHS'):
        sources[f'{label}/{language}'] = hashlib.sha256((root / language).read_bytes()).hexdigest()
records = {key: {'text': previous[key], 'guards': guards}
           for key, guards in sorted(references.items()) if key not in rejected}
payload = {'note': '补充当前中文表缺失且关联配置未变的历史中文；当前中文优先，指纹变化即停止回退。',
           'sourceHashes': sources, 'records': records}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', 'utf8')
print(json.dumps({'fallbackKeys': len(records), 'rejectedKeys': sorted(rejected), 'output': str(args.output)}, ensure_ascii=False))
