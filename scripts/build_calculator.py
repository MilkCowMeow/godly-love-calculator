from pathlib import Path
import re,json,subprocess,html as html_lib
from embedded import extract
from card_characters import assign_characters
from web_analytics import inject_analytics
ROOT=Path(__file__).resolve().parents[1];SRC=ROOT/'src/calculator';TARGET=ROOT/'docs/index.html'
old=TARGET.read_text('utf8');data=extract(old,'DATA');assets=extract(old,'ASSETS')
trials=json.loads((SRC/'trials.json').read_text('utf8'))
if set(trials['trials'])!={str(i) for i in range(1,51)}:raise ValueError('试炼数据须完整覆盖1至50层')
data['trials']=trials['trials']
for sid,skill in trials['skills'].items():data['skills'].setdefault(sid,skill)
for sid,status in trials['statuses'].items():data['statuses'].setdefault(sid,status)
for card in data['cards']:assign_characters(card,card['raw']['Represents'],data['profiles'])
catalog_html=(ROOT/'docs/catalog.html').read_text('utf8');catalog=extract(catalog_html,'DATA');catalog_assets=extract(catalog_html,'ASSETS');catalog_cards={c['id']:c for c in catalog['cards']}
for card in data['cards']:
 source=catalog_cards.get(card['id'],{});thumb=source.get('calculatorThumb') if card['rarity']=='R' else source.get('thumb')
 if thumb:card['thumb']=thumb;assets[thumb]=catalog_assets[thumb]
fonts='\n'.join(face for face in re.findall(r'@font-face\{[^}]*\}',old) if re.search(r'font-family:(?:BookCN|BookEN|TitleCN)(?:;|,)',face))
if not fonts:raise ValueError('Missing embedded reading fonts')
math=json.loads(subprocess.run(['node',str(ROOT/'scripts/render_mechanics.cjs')],cwd=ROOT,capture_output=True,text=True,encoding='utf8',check=True).stdout)
boss=next(e for e in data['tower50']['enemies'] if e['isBoss']);minion=next(e for e in data['tower50']['enemies'] if not e['isBoss'])
replacements={'version':data['version'],'cards':len(data['cards']),'skills':len(data['skills']),'statuses':len(data['statuses'])}
for label,unit in [('boss',boss),('minion',minion)]:
 for key in ['HP','Attack','Defence','Speed']:replacements[label+key]=format(unit['stats'][key],',.0f')
mechanics_html=math['html']
for key,value in replacements.items():mechanics_html=mechanics_html.replace('{{'+key+'}}',html_lib.escape(str(value)))
if re.search(r'\{\{\w+\}\}',mechanics_html):raise ValueError('Unfilled mechanics placeholder')
icon=re.search(r'<link rel="icon" href="([^"]+)"',old).group(1)
read=lambda n:(SRC/n).read_text('utf8')
core=read('battle_core.js');config=read('config_engine.js');timeline=read('timeline_engine.js')
names=['native_status_rules.js','native_turn_rules.js','native_complex_rules.js','simulation_rules.js','native_ai_rules.js','custom_characters.js','combat_reporting.js']
modules='\n'.join(read(n) for n in names)+'\nGLNativeStatus.install(GLTimeline.Simulation);GLNativeTurns.install(GLTimeline.Simulation);GLNativeComplex.install(GLTimeline.Simulation);GLSimulationRules.install(GLTimeline.Simulation);GLNativeAI.install(GLTimeline.Simulation);GLCustom.install(GLTimeline.Simulation);GLReports.install(GLTimeline);\n'
worker=core+'\n'+config+'\n'+timeline+'\n'+modules+'''
self.onmessage=function(e){try{const {data,plan,samples,seed}=e.data,results=[];for(let i=0;i<samples;i++){const r=GLTimeline.run(data,plan,((seed>>>0)+Math.imul(i,2654435761))>>>0);if(!r.ok){postMessage({type:'result',result:r});return;}if(i){delete r.events;for(const row of r.rows)delete row.events;}results.push(r);if((i+1)%8===0)postMessage({type:'progress',done:i+1,total:samples});}postMessage({type:'result',result:samples===1?results[0]:GLTimeline.aggregate(results,plan.rounds)});}catch(err){postMessage({type:'error',error:err.message});}};
'''
safe=lambda x:json.dumps(x,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
app='const MECHANICS_HTML='+safe(mechanics_html)+';\nconst SIM_WORKER_SOURCE='+safe(worker)+';\n'+read('custom_ui.js')+'\n'+read('reporting_ui.js')+'\n'+read('table_app.js')+'\n'+read('motion.js')
html=read('table_template.html')
for token,value in {'ICON':icon,'STYLE':fonts+math['css']+read('table_style.css')+read('custom_style.css')+read('reporting_style.css')+read('mechanics_style.css')+read('motion.css')+read('trial_style.css'),'DATA':'const DATA='+safe(data)+';\nconst ASSETS='+safe(assets)+';','CORE':core,'CONFIG':config,'TIMELINE':timeline,'MODULES':modules,'APP':app}.items():html=html.replace('/*'+token+'*/',value)
TARGET.write_text(inject_analytics(html),'utf8');print('Built docs/index.html:',TARGET.stat().st_size,'bytes')
