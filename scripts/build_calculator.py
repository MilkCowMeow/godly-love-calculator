from pathlib import Path
import re,json
from embedded import extract
ROOT=Path(__file__).resolve().parents[1];SRC=ROOT/'src/calculator';TARGET=ROOT/'docs/index.html'
old=TARGET.read_text('utf8');data=extract(old,'DATA');assets=extract(old,'ASSETS')
fonts='\n'.join(re.findall(r'@font-face\{[^}]*\}',old))
icon=re.search(r'<link rel="icon" href="([^"]+)"',old).group(1)
read=lambda n:(SRC/n).read_text('utf8')
core=read('battle_core.js');config=read('config_engine.js');timeline=read('timeline_engine.js')
names=['native_status_rules.js','native_turn_rules.js','native_complex_rules.js','simulation_rules.js','native_ai_rules.js','custom_characters.js','combat_reporting.js']
modules='\n'.join(read(n) for n in names)+'\nGLNativeStatus.install(GLTimeline.Simulation);GLNativeTurns.install(GLTimeline.Simulation);GLNativeComplex.install(GLTimeline.Simulation);GLSimulationRules.install(GLTimeline.Simulation);GLNativeAI.install(GLTimeline.Simulation);GLCustom.install(GLTimeline.Simulation);GLReports.install(GLTimeline);\n'
worker=core+'\n'+config+'\n'+timeline+'\n'+modules+'''
self.onmessage=function(e){try{const {data,plan,samples,seed}=e.data,results=[];for(let i=0;i<samples;i++){const r=GLTimeline.run(data,plan,((seed>>>0)+Math.imul(i,2654435761))>>>0);if(!r.ok){postMessage({type:'result',result:r});return;}if(i){delete r.events;for(const row of r.rows)delete row.events;}results.push(r);if((i+1)%8===0)postMessage({type:'progress',done:i+1,total:samples});}postMessage({type:'result',result:samples===1?results[0]:GLTimeline.aggregate(results,plan.rounds)});}catch(err){postMessage({type:'error',error:err.message});}};
'''
safe=lambda x:json.dumps(x,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
app='const SIM_WORKER_SOURCE='+safe(worker)+';\n'+read('custom_ui.js')+'\n'+read('reporting_ui.js')+'\n'+read('table_app.js')
html=read('table_template.html')
for token,value in {'ICON':icon,'STYLE':fonts+read('table_style.css')+read('custom_style.css')+read('reporting_style.css'),'DATA':'const DATA='+safe(data)+';\nconst ASSETS='+safe(assets)+';','CORE':core,'CONFIG':config,'TIMELINE':timeline,'MODULES':modules,'APP':app}.items():html=html.replace('/*'+token+'*/',value)
TARGET.write_text(html,'utf8');print('Built docs/index.html:',TARGET.stat().st_size,'bytes')
