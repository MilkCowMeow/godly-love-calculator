from pathlib import Path
import shutil,json,subprocess,sys
from embedded import extract
ROOT=Path(__file__).resolve().parents[1];TMP=ROOT/'.tmp/tests';TMP.mkdir(parents=True,exist_ok=True)
subprocess.run([sys.executable,str(ROOT/'tests/test_card_characters.py')],check=True)
subprocess.run([sys.executable,str(ROOT/'tests/test_mechanics_docs.py')],check=True)
for p in (ROOT/'src/calculator').glob('*.js'):shutil.copy2(p,TMP/p.name)
for p in (ROOT/'tests').glob('*.cjs'):shutil.copy2(p,TMP/p.name)
for p in (ROOT/'tests').glob('*.json'):shutil.copy2(p,TMP/p.name)
data=extract((ROOT/'docs/index.html').read_text('utf8'),'DATA');encoded=json.dumps(data,ensure_ascii=False)
for name in ['calculator_data.json','simulation_data.json']:(TMP/name).write_text(encoded,'utf8')
(TMP/'catalog_data.json').write_text(json.dumps(extract((ROOT/'docs/catalog.html').read_text('utf8'),'DATA'),ensure_ascii=False),'utf8')
shutil.copy2(ROOT/'src/catalog/app.js',TMP/'catalog_app.js')
(TMP/'research').mkdir(exist_ok=True)
for name in ['test_battle_core.cjs','test_config_engine.cjs','test_native_turn_rules.cjs','test_native_status_rules.cjs','test_native_complex_rules.cjs','test_native_ai_rules.cjs','test_timeline.cjs','test_live_client.cjs','test_custom_characters.cjs','test_combat_reporting.cjs','test_table_inputs.cjs','test_catalog_controls.cjs','test_mechanics_formulas.cjs']:
 subprocess.run(['node',name],cwd=TMP,check=True)
