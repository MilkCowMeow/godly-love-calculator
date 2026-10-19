(function(root){'use strict';
let view='damage';
const views={damage:'伤害',direct:'技能与追加伤害',dot:'状态伤害',healing:'治疗量',shield:'施加护盾',damageTaken:'实际受伤'};
const colors=['#498d81','#c29854','#9683ac','#7295b0'];
const isHealing=key=>key==='totalHealing'||key==='totalReceivedHealing';
function mean(){return result?.samples>1;}
function digits(){return mean()?1:0;}
function pair(effective,overheal){return fmt(effective,digits())+'（'+fmt(overheal,digits())+'）';}
function pairHTML(effective,overheal){return fmt(effective,digits())+'<span class="stat-overheal">（'+fmt(overheal,digits())+'）</span>';}
function value(row,slot,key=view){return key==='healing'?GLReports.healingParts(row?.report,slot).total:['damage','direct','dot'].includes(key)?row?.members[slot]?.[key]||0:row?.report?.members[slot]?.[key]||0;}
function name(slot){return cards.get(plan.members[slot]?.cardId)?.name||'空位';}
function partyFlows(report,kind){return (report?.flows||[]).filter(f=>f.kind===kind&&f.source?.startsWith('0_')&&f.target?.startsWith('0_'));}
function sumHealing(rows,slot=null){
 const sum={effective:0,overheal:0,total:0};
 for(const row of rows)for(const i of slot===null?[0,1,2,3]:[slot]){const p=GLReports.healingParts(row.report,i);for(const k of Object.keys(sum))sum[k]+=p[k];}
 return sum;
}
function displayRows(rows,slot=null,key=view){
 if(key==='healing'){const p=sumHealing(rows,slot);return pair(p.effective,p.overheal);}
 return fmt(rows.reduce((sum,row)=>sum+(slot===null?plan.members.reduce((n,_,i)=>n+value(row,i,key),0):value(row,slot,key)),0),digits());
}
function header(){const th=$$('#roster-row th');if(th.length)th.at(-1).innerHTML='<b>累计'+views[view]+'</b><small>CUMULATIVE</small>';}
function markDead(cell,active){
 const amount=cell.querySelector('.cell-damage'),label=document.createElement('span');
 cell.classList.add('member-dead');
 if(!active){if(view==='healing')amount.innerHTML=pairHTML(0,0);else amount.textContent=fmt(0,digits());}
 label.className='cell-death-label';label.textContent='（已死亡）';amount.append(label);
}
function updateTable(){
 header();const rows=result?.ok?result.rows:[],by=new Map(rows.map(r=>[r.round,r])),processed=[],snapshots=new Map();
 for(const tr of $$('#battle-body tr')){
  const round=Number(tr.querySelector('[data-log]')?.dataset.log),r=by.get(round),cells=[...tr.children];
  for(const state of r?.report?.snapshot||r?.teamHP||[])snapshots.set(state.slot,state);
  if(!r||tr.classList.contains('ended')){if(result?.ok){cells[6].textContent=displayRows(processed);for(let i=0;i<4;i++)if(plan.members[i].cardId&&Number(snapshots.get(i)?.alive)===0)markDead(cells[i+1],false);}continue;}
  processed.push(r);
  for(let i=0;i<4;i++){
   if(!plan.members[i].cardId)continue;
   const cell=cells[i+1],n=value(r,i),stats=r.report?.members[i],snapshot=snapshots.get(i),bits=[],amount=cell.querySelector('.cell-damage');
   amount.textContent=fmt(n,digits());
   if(['healing','shield'].includes(view)){
    const b=document.createElement('button');b.className='cell-stat-button';
    if(view==='healing'){const p=GLReports.healingParts(r.report,i);b.innerHTML=pairHTML(p.effective,p.overheal);b.title='总治疗量 '+fmt(p.total,digits());}
    else b.textContent=fmt(n,digits());
    b.setAttribute('aria-label','查看第'+round+'轮'+name(i)+'的'+views[view]+'去向');b.onclick=()=>openSource(round,i,view);amount.replaceChildren(b);
   }
   if(view==='healing'){if(stats?.blocked)bits.push('封愈阻止 '+fmt(stats.blocked,digits()));}
   else if(view==='shield')bits.push('获得 '+fmt(stats?.receivedShield||0,digits()));
   else if(view==='damageTaken'){const p=GLReports.healingParts(r.report,i,true);bits.push('护盾吸收 '+fmt(stats?.absorbed||0,digits()));bits.push('受到治疗 '+pair(p.effective,p.overheal));}
   else {const p=GLReports.healingParts(r.report,i);bits.push(fmt(mean()?r.members[i].actionCount:r.members[i].actions.length,digits())+' 次出手');if(p.total)bits.push('治疗 '+pair(p.effective,p.overheal));if(stats?.shield)bits.push('护盾 '+fmt(stats.shield,digits()));}
   if(snapshot){bits.push((mean()?'平均余血 ':'余血 ')+fmt(snapshot.hp,digits()));if(mean()&&snapshot.alive>0&&snapshot.alive<1)bits.push('存活率 '+fmt(snapshot.alive*100,1)+'%');}cell.querySelector('.cell-detail').textContent=bits.join('，');
   if(Number(snapshot?.alive)===0)markDead(cell,true);
  }
  cells[5].textContent=displayRows([r]);cells[6].textContent=displayRows(processed);
 }
 const foot=$$('#battle-foot td');if(foot.length){foot[0].textContent='总'+views[view];for(let i=0;i<4;i++)foot[i+1].textContent=result?.ok&&plan.members[i].cardId?displayRows(rows,i):'—';for(const i of [5,6])foot[i].textContent=result?.ok?displayRows(rows):'—';}
 $('#export-csv').textContent='导出'+views[view]+'表';
}
function openSource(round,slot,kind){
 const row=result.rows.find(r=>r.round===round),flows=partyFlows(row?.report,kind).filter(f=>f.source==='0_'+slot);
 showDetail('SUPPORT / ROUND '+round,'第'+round+'轮 '+name(slot)+'的'+views[kind]+'去向',`<p class="log-note">${mean()?'以下为全部独立场次的平均值。':'以下为本场实际结算。'}${kind==='healing'?'治疗数字为有效治疗（溢出）；总治疗量为两者之和，封愈阻止另计。':'施盾值按成功施加的护盾实例记录，重复施盾可能刷新或合并，不等于实际吸收伤害。'}</p>${flowTable(flows,kind)}`);
}
function flowTable(flows,kind){return flows.length?`<div class="report-scroll"><table class="report-table"><thead><tr><th>来源</th><th>目标</th><th>${kind==='healing'?'治疗量':'施加护盾'}</th>${kind==='healing'?'<th>总治疗量</th><th>封愈阻止</th>':''}</tr></thead><tbody>${flows.map(f=>`<tr><td>${esc(unitName(f.source))}</td><td>${esc(unitName(f.target))}</td><td>${kind==='healing'?pair(f.amount,f.overheal):fmt(f.amount,digits())}</td>${kind==='healing'?`<td>${fmt(f.amount+f.overheal,digits())}</td><td>${fmt(f.blocked,digits())}</td>`:''}</tr>`).join('')}</tbody></table></div>`:'<p class="empty-report">这一轮没有对应事件。</p>';}
const chartSpecs=[['damage','造成伤害','damage'],['damageTaken','实际受伤','damage'],['totalHealing','治疗量','healing'],['totalReceivedHealing','受到治疗量','healing'],['shield','施加护盾','shield'],['receivedShield','获得护盾','shield'],['absorbed','护盾吸收','shield'],['hp','剩余生命','hp']];
const chartVisible=new Set([0,1,2,3]);
function axisNumber(n){return n>=1e8?fmt(n/1e8,1)+'亿':n>=1e4?fmt(n/1e4,1)+'万':fmt(n,n<10?1:0);}
function renderChart(){
 const el=$('#trend-report');el.hidden=!result?.ok;if(!result?.ok)return;
 const cumulative=$('#trend-mode').value==='cumulative',group=$('#chart-group').value,occupied=plan.members.map((m,i)=>m.cardId?i:-1).filter(i=>i>=0);
 if(!occupied.some(i=>chartVisible.has(i)))chartVisible.add(occupied[0]);
 const indices=occupied.filter(i=>chartVisible.has(i));
 $('#chart-stat-note').textContent=(mean()?'曲线取全部 '+result.samples+' 场独立战斗的平均值。':'曲线取本场实际结算。')+'治疗数字为有效治疗（溢出），曲线按两者之和绘制；封愈阻止另计。点击角色可显示或隐藏曲线，悬停节点或展开数据表可查看数值。实际受伤是扣除生命的量，护盾吸收另列。';
 $('#chart-legend').innerHTML=occupied.map(i=>`<button type="button" data-chart-slot="${i}" aria-pressed="${chartVisible.has(i)}"><i style="background:${colors[i]}"></i>${esc(name(i))}</button>`).join('');
 for(const b of $$('[data-chart-slot]'))b.onclick=()=>{const i=Number(b.dataset.chartSlot);if(chartVisible.has(i)&&indices.length===1){toast('请至少显示一位成员');return;}chartVisible.has(i)?chartVisible.delete(i):chartVisible.add(i);renderChart();};
 $('#chart-grid').innerHTML=chartSpecs.filter(s=>group==='all'||s[2]===group).map(([key,title])=>{
  const raw=GLReports.series(result,key),acc={},rows=raw.map(r=>{
   const row={round:r.round};for(const field of ['values','effectiveValues','overhealValues'])if(r[field]){acc[field]??=Array(4).fill(0);row[field]=r[field].map((v,i)=>{acc[field][i]+=v;return cumulative&&key!=='hp'?acc[field][i]:v;});}return row;
  });
  const text=(r,i)=>isHealing(key)?pair(r.effectiveValues[i],r.overhealValues[i]):fmt(r.values[i],digits());
  const maxValue=Math.max(1,...rows.flatMap(r=>indices.map(i=>r.values[i]))),magnitude=10**Math.floor(Math.log10(maxValue)),max=Math.ceil(maxValue/magnitude)*magnitude,W=500,H=245,left=62,top=20,right=18,bottom=36,n=rows.length,x=i=>left+(W-left-right)*(n===1?.5:i/(n-1)),y=v=>H-bottom-(H-top-bottom)*v/max;
  const label=(key==='hp'?'轮末':cumulative?'累计':'每轮')+title;
  return `<article class="stat-chart"><h3>${esc(label)}</h3><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${Array.from({length:5},(_,i)=>{const val=max*i/4,Y=y(val);return `<line x1="${left}" x2="${W-right}" y1="${Y}" y2="${Y}" stroke="var(--line)"/><text x="${left-8}" y="${Y+4}" text-anchor="end">${axisNumber(val)}</text>`;}).join('')}${rows.filter((r,i)=>i===0||i===n-1||n<=6||r.round%Math.ceil(n/5)===0).map(r=>`<text x="${x(rows.indexOf(r))}" y="${H-13}" text-anchor="middle">${r.round}</text>`).join('')}${indices.map(index=>`<polyline fill="none" stroke="${colors[index]}" stroke-width="2.8" stroke-linejoin="round" points="${rows.map((r,i)=>x(i)+','+y(r.values[index])).join(' ')}"/>${rows.map((r,i)=>`<circle cx="${x(i)}" cy="${y(r.values[index])}" r="3.5" fill="${colors[index]}"><title>第${r.round}轮 ${esc(name(index))}：${text(r,index)}${isHealing(key)?'，总治疗量 '+fmt(r.values[index],digits()):''}</title></circle>`).join('')}`).join('')}</svg><details class="chart-data"><summary>查看逐轮数值</summary><div class="report-scroll"><table class="report-table"><thead><tr><th>轮次</th>${indices.map(i=>`<th>${esc(name(i))}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td>${r.round}</td>${indices.map(i=>`<td>${text(r,i)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details></article>`;
 }).join('');
}
function exportCharts(){
 if(!result?.ok)return;const rows=[['轮次','指标','角色','每轮数值（治疗含溢出）','有效治疗','溢出治疗','统计场次']];
 for(const [key,title]of chartSpecs)for(const row of GLReports.series(result,key))for(let i=0;i<4;i++)if(plan.members[i].cardId)rows.push([row.round,title,name(i),row.values[i],row.effectiveValues?.[i]??'',row.overhealValues?.[i]??'',result.samples||1]);
 csv(rows,'神恋_战斗统计数据.csv');
}
function renderRecords(){
 const el=$('#records-report');el.hidden=!saved.length;
 el.innerHTML=saved.length?`<div class="report-heading"><div><p class="eyebrow">TEAM COMPARISON</p><h2>配队记录</h2></div></div><p class="report-note">结果为保存时的快照；更换配置或版本后，载入配队再重新计算。治疗数字为有效治疗（溢出）。</p><div class="report-scroll"><table class="report-table"><thead><tr><th>方案</th><th>对手 / 轮数</th><th>总伤害</th><th>治疗量</th><th>施加护盾</th><th></th></tr></thead><tbody>${saved.map((s,i)=>`<tr><th title="${esc(s.plan.members.filter(m=>m.cardId).map(m=>(cards.get(m.cardId)?.name||m.cardId)+' Lv.'+m.level+' '+m.imprint+'星').join('，'))}">${esc(s.name)}<small>${s.record?esc((s.record.samples>1?s.record.samples+'场平均':'随机单场')+'，种子 '+s.plan.seed):'尚无结果快照'}</small></th><td>${s.plan.target==='tower50'?'试炼第'+(s.plan.trialFloor??50)+'层':'战斗人偶'}<small>${s.plan.rounds}轮</small></td><td>${s.record?fmt(s.record.damage,1):'—'}</td><td>${s.record?Number.isFinite(s.record.overheal)?fmt(s.record.healing,1)+'（'+fmt(s.record.overheal,1)+'）':'有效 '+fmt(s.record.healing,1)+'<small>旧记录未保存溢出，请重新计算</small>':'—'}</td><td>${s.record?fmt(s.record.shield,1):'—'}</td><td><button class="text-button" data-load-record="${i}">载入</button></td></tr>`).join('')}</tbody></table></div>`:'';
 for(const b of $$('[data-load-record]'))b.onclick=()=>{try{applyPlan(saved[Number(b.dataset.loadRecord)].plan);toast('配队已载入，请重新计算');}catch(e){toast(e.message);}};
}
function exportTable(){
 if(!result?.ok)return;
 if(view==='healing'){
  const rows=[['轮次',...plan.members.flatMap((_,i)=>['有效治疗','溢出治疗','总治疗量'].map(label=>name(i)+' '+label)),'本轮有效治疗','本轮溢出治疗','本轮总治疗量','累计有效治疗','累计溢出治疗','累计总治疗量']],processed=[];
  for(const row of result.rows){processed.push(row);const current=sumHealing([row]),sum=sumHealing(processed);rows.push([row.round,...plan.members.flatMap((_,i)=>{const p=GLReports.healingParts(row.report,i);return[p.effective,p.overheal,p.total];}),current.effective,current.overheal,current.total,sum.effective,sum.overheal,sum.total]);}
  csv(rows,'神恋_逐轮治疗量.csv');return;
 }
 const rows=[['轮次',...plan.members.map(m=>cards.get(m.cardId)?.name||'空位'),'本轮合计','累计'+views[view]]];let sum=0;
 for(const row of result.rows){const ns=plan.members.map((_,i)=>value(row,i)),total=ns.reduce((a,b)=>a+b,0);sum+=total;rows.push([row.round,...ns,total,sum]);}csv(rows,'神恋_逐轮'+views[view]+'.csv');
}
function csv(rows,file){const q=x=>'"'+String(x??'').replace(/"/g,'""')+'"';download('\ufeff'+rows.map(r=>r.map(q).join(',')).join('\r\n'),'text/csv;charset=utf-8',file);}
function initialize(){
 const bar=document.createElement('div');bar.className='result-views';bar.innerHTML=`<label>表格显示<select id="output-view">${options(views,'damage')}</select></label><details class="quick-setup"><summary>全队快速设置</summary><div><label>等级<input id="quick-level" type="number" min="1" max="80" value="80"></label><label>升星<select id="quick-stars">${Array.from({length:6},(_,i)=>`<option ${i===5?'selected':''}>${i}</option>`).join('')}</select></label><label>策略<select id="quick-mode">${options(policies,'auto')}</select></label><button id="apply-quick" class="secondary">应用到全队</button></div></details>`;$('.table-shell').before(bar);
 const section=document.createElement('div');section.className='reporting-panels';section.innerHTML=`<section id="trend-report" class="report-panel" hidden><div class="report-heading"><div><p class="eyebrow">COMBAT ANALYTICS</p><h2 id="trend-title">战斗统计图</h2></div><div class="report-selects"><label>指标<select id="chart-group"><option value="all">全部图表</option><option value="damage">伤害与承伤</option><option value="healing">治疗</option><option value="shield">护盾</option><option value="hp">生命</option></select></label><label>口径<select id="trend-mode"><option value="round">每轮</option><option value="cumulative">累计</option></select></label><button type="button" class="secondary" id="export-charts">导出统计数据</button></div></div><p class="report-note" id="chart-stat-note"></p><div id="chart-legend"></div><div id="chart-grid" class="chart-grid"></div></section><section id="records-report" class="report-panel" hidden></section>`;$('.bottom-tools').after(section);
 const teamName=document.createElement('label');teamName.className='team-name-field';teamName.innerHTML='方案名称<input id="team-name" maxlength="60" placeholder="保存时可自定义名称">';$('.saved-teams').before(teamName);
 const oldRows=rowsView;rowsView=function(){oldRows();updateTable();renderChart();};const oldRoster=roster;roster=function(){oldRoster();header();};const oldSave=saveList;saveList=function(){oldSave();renderRecords();};
 const oldSummary=summary;summary=function(){oldSummary();const totals=result.report?.members||[],h=sumHealing(result.rows);$('#summary').insertAdjacentHTML('beforeend',`<div class="metric healing-metric"><small>治疗量</small><strong>${pairHTML(h.effective,h.overheal)}</strong><em>总治疗量 ${fmt(h.total,digits())}</em></div><div class="metric"><small>施加护盾</small><strong>${fmt(totals.reduce((a,m)=>a+m.shield,0),digits())}</strong><em>实际吸收 ${fmt(totals.reduce((a,m)=>a+m.absorbed,0),digits())}</em></div>`);};
 $('#output-view').onchange=e=>{view=e.target.value;rowsView();};$('#trend-mode').onchange=renderChart;$('#chart-group').onchange=renderChart;$('#export-charts').onclick=exportCharts;
 $('#apply-quick').onclick=()=>{const level=Math.max(1,Math.min(80,Math.trunc(Number($('#quick-level').value)||80))),imprint=Number($('#quick-stars').value),mode=$('#quick-mode').value;for(const m of plan.members)if(m.cardId)Object.assign(m,{level,imprint,mode});roster();dirty();toast('已应用到全部上阵成员');};
 const job=document.createElement('select');job.id='job-filter';job.setAttribute('aria-label','定位筛选');job.innerHTML='<option value="">全部定位</option>'+Object.entries(jobs).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');$('.card-filters').append(job);job.onchange=renderCardList;
}
function bind(){
 $('#export-csv').onclick=exportTable;
 $('#save-team').onclick=()=>{const h=result?.ok?sumHealing(result.rows):null,record=h?{damage:result.total,healing:h.effective,overheal:h.overheal,healingTotal:h.total,shield:result.report.members.reduce((a,m)=>a+m.shield,0),version:DATA.version,savedAt:Date.now(),samples:result.samples||1}:null;saved.unshift({name:$('#team-name').value.trim()||plan.members.filter(m=>m.cardId).map(m=>cards.get(m.cardId)?.name).join(' / '),plan:GLCustomUI.snapshotPlan(),record});saved=saved.slice(0,12);saveList();toast('配队'+(record?'与结果':'')+'已保存');};
}
root.GLReportingUI={initialize,bind,renderChart};
})(typeof globalThis!=='undefined'?globalThis:this);
