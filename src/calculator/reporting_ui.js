(function(root){'use strict';
let view='damage';
const views={damage:'伤害',direct:'技能与追加伤害',dot:'状态伤害',healing:'有效治疗',shield:'施加护盾',damageTaken:'实际受伤'};
const colors=['#498d81','#c29854','#9683ac','#7295b0'];
function value(row,slot,key=view){return ['damage','direct','dot'].includes(key)?row?.members[slot]?.[key]||0:row?.report?.members[slot]?.[key]||0;}
function mean(){return result?.samples>1;}
function name(slot){return cards.get(plan.members[slot]?.cardId)?.name||'空位';}
function partyFlows(report,kind){return (report?.flows||[]).filter(f=>f.kind===kind&&f.source?.startsWith('0_')&&f.target?.startsWith('0_'));}
function header(){const th=$$('#roster-row th');if(th.length)th.at(-1).innerHTML='<b>累计'+views[view]+'</b><small>CUMULATIVE</small>';}
function updateTable(){
 header();let cumulative=0;const by=new Map((result?.ok?result.rows:[]).map(r=>[r.round,r]));
 for(const tr of $$('#battle-body tr')){const round=Number(tr.querySelector('[data-log]')?.dataset.log),r=by.get(round),cells=[...tr.children];if(!r||tr.classList.contains('ended')){if(result?.ok)cells[6].textContent=fmt(cumulative,mean()?1:0);continue;}let total=0;
  for(let i=0;i<4;i++){const m=plan.members[i];if(!m.cardId)continue;const cell=cells[i+1],n=value(r,i);total+=n;const amount=cell.querySelector('.cell-damage');amount.textContent=fmt(n,mean()?1:0);
   if(['healing','shield'].includes(view)){const b=document.createElement('button');b.className='cell-stat-button';b.textContent=fmt(n,mean()?1:0);b.setAttribute('aria-label','查看第'+round+'轮'+name(i)+'的'+views[view]+'去向');b.onclick=()=>openSource(round,i,view);amount.replaceChildren(b);}
   const stats=r.report?.members[i],snapshot=r.report?.snapshot.find(s=>s.slot===i),bits=[];
   if(view==='healing'){bits.push('溢出 '+fmt(stats?.overheal||0,mean()?1:0));if(stats?.blocked)bits.push('封愈阻止 '+fmt(stats.blocked,mean()?1:0));}
   else if(view==='shield')bits.push('获得 '+fmt(stats?.receivedShield||0,mean()?1:0));
   else if(view==='damageTaken'){bits.push('护盾吸收 '+fmt(stats?.absorbed||0,mean()?1:0));bits.push('受到治疗 '+fmt(stats?.receivedHealing||0,mean()?1:0));}
   else {bits.push(fmt(mean()?r.members[i].actionCount:r.members[i].actions.length,mean()?1:0)+' 次出手');if(stats?.healing)bits.push('治疗 '+fmt(stats.healing,mean()?1:0));if(stats?.shield)bits.push('护盾 '+fmt(stats.shield,mean()?1:0));}
   if(snapshot)bits.push((mean()?'平均余血 ':'余血 ')+fmt(snapshot.hp,mean()?1:0));cell.querySelector('.cell-detail').textContent=bits.join('，');
  }cumulative+=total;cells[5].textContent=fmt(total,mean()?1:0);cells[6].textContent=fmt(cumulative,mean()?1:0);
 }
 const foot=$$('#battle-foot td');if(foot.length){foot[0].textContent='总'+views[view];for(let i=0;i<4;i++)foot[i+1].textContent=result?.ok&&plan.members[i].cardId?fmt(result.rows.reduce((a,r)=>a+value(r,i),0),mean()?1:0):'—';for(const i of [5,6])foot[i].textContent=result?.ok?fmt(result.rows.reduce((a,r)=>a+r.members.reduce((n,_,i)=>n+value(r,i),0),0),mean()?1:0):'—';}
 $('#export-csv').textContent='导出'+views[view]+'表';
}
function openSource(round,slot,kind){
 const row=result.rows.find(r=>r.round===round),flows=partyFlows(row?.report,kind).filter(f=>f.source==='0_'+slot);
 showDetail('SUPPORT / ROUND '+round,'第'+round+'轮 '+name(slot)+'的'+views[kind]+'去向',`<p class="log-note">${mean()?'以下为全部独立场次的平均值。':'以下为本场实际结算。'}${kind==='healing'?'有效治疗计入实际恢复的生命；满血部分记为溢出，封愈阻止的部分单独列出。':'施盾值按成功施加的护盾实例记录，重复施盾可能刷新或合并，不等于实际吸收伤害。'}</p>${flowTable(flows,kind)}`);
}
function flowTable(flows,kind){return flows.length?`<div class="report-scroll"><table class="report-table"><thead><tr><th>来源</th><th>目标</th><th>${kind==='healing'?'有效治疗':'施加护盾'}</th>${kind==='healing'?'<th>治疗量</th><th>溢出</th><th>封愈阻止</th>':''}</tr></thead><tbody>${flows.map(f=>`<tr><td>${esc(unitName(f.source))}</td><td>${esc(unitName(f.target))}</td><td>${fmt(f.amount,mean()?1:0)}</td>${kind==='healing'?`<td>${fmt(f.attempted,mean()?1:0)}</td><td>${fmt(f.overheal,mean()?1:0)}</td><td>${fmt(f.blocked,mean()?1:0)}</td>`:''}</tr>`).join('')}</tbody></table></div>`:'<p class="empty-report">这一轮没有对应事件。</p>';}
const chartSpecs=[['damage','造成伤害','damage'],['damageTaken','实际受伤','damage'],['healing','有效治疗','healing'],['receivedHealing','受到治疗','healing'],['shield','施加护盾','shield'],['receivedShield','获得护盾','shield'],['absorbed','护盾吸收','shield'],['hp','剩余生命','hp']];
const chartVisible=new Set([0,1,2,3]);
function axisNumber(n){return n>=1e8?fmt(n/1e8,1)+'亿':n>=1e4?fmt(n/1e4,1)+'万':fmt(n,n<10?1:0);}
function renderChart(){
 const el=$('#trend-report');el.hidden=!result?.ok;if(!result?.ok)return;
 const cumulative=$('#trend-mode').value==='cumulative',group=$('#chart-group').value,occupied=plan.members.map((m,i)=>m.cardId?i:-1).filter(i=>i>=0);
 if(!occupied.some(i=>chartVisible.has(i)))chartVisible.add(occupied[0]);
 const indices=occupied.filter(i=>chartVisible.has(i));
 $('#chart-stat-note').textContent=(mean()?'曲线取全部 '+result.samples+' 场独立战斗的平均值。':'曲线取本场实际结算。')+'点击角色可显示或隐藏曲线；悬停节点可查看数值，图下可展开完整数据表。实际受伤是扣除生命的量，护盾吸收另列。';
 $('#chart-legend').innerHTML=occupied.map(i=>`<button type="button" data-chart-slot="${i}" aria-pressed="${chartVisible.has(i)}"><i style="background:${colors[i]}"></i>${esc(name(i))}</button>`).join('');
 for(const b of $$('[data-chart-slot]'))b.onclick=()=>{const i=Number(b.dataset.chartSlot);if(chartVisible.has(i)&&indices.length===1){toast('请至少显示一位成员');return;}chartVisible.has(i)?chartVisible.delete(i):chartVisible.add(i);renderChart();};
 $('#chart-grid').innerHTML=chartSpecs.filter(s=>group==='all'||s[2]===group).map(([key,title])=>{
  const raw=GLReports.series(result,key),acc=Array(4).fill(0),rows=raw.map(r=>({round:r.round,values:r.values.map((v,i)=>{acc[i]+=v;return cumulative&&key!=='hp'?acc[i]:v;})}));
  const maxValue=Math.max(1,...rows.flatMap(r=>indices.map(i=>r.values[i]))),magnitude=10**Math.floor(Math.log10(maxValue)),max=Math.ceil(maxValue/magnitude)*magnitude,W=500,H=245,left=62,top=20,right=18,bottom=36,n=rows.length,x=i=>left+(W-left-right)*(n===1?.5:i/(n-1)),y=v=>H-bottom-(H-top-bottom)*v/max;
  const label=(key==='hp'?'轮末':cumulative?'累计':'每轮')+title;
  return `<article class="stat-chart"><h3>${esc(label)}</h3><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${Array.from({length:5},(_,i)=>{const val=max*i/4,Y=y(val);return `<line x1="${left}" x2="${W-right}" y1="${Y}" y2="${Y}" stroke="var(--line)"/><text x="${left-8}" y="${Y+4}" text-anchor="end">${axisNumber(val)}</text>`;}).join('')}${rows.filter((r,i)=>i===0||i===n-1||n<=6||r.round%Math.ceil(n/5)===0).map(r=>`<text x="${x(rows.indexOf(r))}" y="${H-13}" text-anchor="middle">${r.round}</text>`).join('')}${indices.map(index=>`<polyline fill="none" stroke="${colors[index]}" stroke-width="2.8" stroke-linejoin="round" points="${rows.map((r,i)=>x(i)+','+y(r.values[index])).join(' ')}"/>${rows.map((r,i)=>`<circle cx="${x(i)}" cy="${y(r.values[index])}" r="3.5" fill="${colors[index]}"><title>第${r.round}轮 ${esc(name(index))}：${fmt(r.values[index],mean()?1:0)}</title></circle>`).join('')}`).join('')}</svg><details class="chart-data"><summary>查看逐轮数值</summary><div class="report-scroll"><table class="report-table"><thead><tr><th>轮次</th>${indices.map(i=>`<th>${esc(name(i))}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td>${r.round}</td>${indices.map(i=>`<td>${fmt(r.values[i],mean()?1:0)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details></article>`;
 }).join('');
}
function exportCharts(){if(!result?.ok)return;const rows=[['轮次','指标','角色','每轮数值','统计场次']];for(const [key,title]of chartSpecs)for(const row of GLReports.series(result,key))for(let i=0;i<4;i++)if(plan.members[i].cardId)rows.push([row.round,title,name(i),row.values[i],result.samples||1]);csv(rows,'神恋_战斗统计数据.csv');}

function renderRecords(){
 const el=$('#records-report');el.hidden=!saved.length;el.innerHTML=saved.length?`<div class="report-heading"><div><p class="eyebrow">TEAM COMPARISON</p><h2>配队记录</h2></div></div><p class="report-note">结果为保存时的快照；更换配置或版本后，载入配队再重新计算。可对照相同对手、轮数与种子的方案。</p><div class="report-scroll"><table class="report-table"><thead><tr><th>方案</th><th>对手 / 轮数</th><th>总伤害</th><th>有效治疗</th><th>施加护盾</th><th></th></tr></thead><tbody>${saved.map((s,i)=>`<tr><th title="${esc(s.plan.members.filter(m=>m.cardId).map(m=>(cards.get(m.cardId)?.name||m.cardId)+' Lv.'+m.level+' '+m.imprint+'星').join('，'))}">${esc(s.name)}<small>${s.record?esc((s.record.samples>1?s.record.samples+'场平均':'随机单场')+'，种子 '+s.plan.seed):'尚无结果快照'}</small></th><td>${s.plan.target==='tower50'?'试炼50层':'战斗人偶'}<small>${s.plan.rounds}轮</small></td><td>${s.record?fmt(s.record.damage,1):'—'}</td><td>${s.record?fmt(s.record.healing,1):'—'}</td><td>${s.record?fmt(s.record.shield,1):'—'}</td><td><button class="text-button" data-load-record="${i}">载入</button></td></tr>`).join('')}</tbody></table></div>`:'';for(const b of $$('[data-load-record]'))b.onclick=()=>{try{applyPlan(saved[Number(b.dataset.loadRecord)].plan);toast('配队已载入，请重新计算');}catch(e){toast(e.message);}};
}
function exportTable(){if(!result?.ok)return;const rows=[['轮次',...plan.members.map(m=>cards.get(m.cardId)?.name||'空位'),'本轮合计','累计'+views[view]]];let sum=0;for(const row of result.rows){const ns=plan.members.map((_,i)=>value(row,i)),total=ns.reduce((a,b)=>a+b,0);sum+=total;rows.push([row.round,...ns,total,sum]);}csv(rows,'神恋_逐轮'+views[view]+'.csv');}
function csv(rows,file){const q=x=>'"'+String(x??'').replace(/"/g,'""')+'"';download('\ufeff'+rows.map(r=>r.map(q).join(',')).join('\r\n'),'text/csv;charset=utf-8',file);}
function initialize(){
 const bar=document.createElement('div');bar.className='result-views';bar.innerHTML=`<label>表格显示<select id="output-view">${options(views,'damage')}</select></label><details class="quick-setup"><summary>全队快速设置</summary><div><label>等级<input id="quick-level" type="number" min="1" max="80" value="80"></label><label>升星<select id="quick-stars">${Array.from({length:6},(_,i)=>`<option ${i===5?'selected':''}>${i}</option>`).join('')}</select></label><label>策略<select id="quick-mode">${options(policies,'auto')}</select></label><button id="apply-quick" class="secondary">应用到全队</button></div></details>`;$('.table-shell').before(bar);
 const section=document.createElement('div');section.className='reporting-panels';section.innerHTML=`<section id="trend-report" class="report-panel" hidden><div class="report-heading"><div><p class="eyebrow">COMBAT ANALYTICS</p><h2 id="trend-title">战斗统计图</h2></div><div class="report-selects"><label>指标<select id="chart-group"><option value="all">全部图表</option><option value="damage">伤害与承伤</option><option value="healing">治疗</option><option value="shield">护盾</option><option value="hp">生命</option></select></label><label>口径<select id="trend-mode"><option value="round">每轮</option><option value="cumulative">累计</option></select></label><button type="button" class="secondary" id="export-charts">导出统计数据</button></div></div><p class="report-note" id="chart-stat-note"></p><div id="chart-legend"></div><div id="chart-grid" class="chart-grid"></div></section><section id="records-report" class="report-panel" hidden></section>`;$('.bottom-tools').after(section);
 const teamName=document.createElement('label');teamName.className='team-name-field';teamName.innerHTML='方案名称<input id="team-name" maxlength="60" placeholder="保存时可自定义名称">';$('.saved-teams').before(teamName);
 const oldRows=rowsView;rowsView=function(){oldRows();updateTable();renderChart();};const oldRoster=roster;roster=function(){oldRoster();header();};const oldSave=saveList;saveList=function(){oldSave();renderRecords();};const oldSummary=summary;summary=function(){oldSummary();const totals=result.report?.members||[];$('#summary').insertAdjacentHTML('beforeend',`<div class="metric"><small>有效治疗</small><strong>${fmt(totals.reduce((a,m)=>a+m.healing,0),mean()?1:0)}</strong><em>溢出 ${fmt(totals.reduce((a,m)=>a+m.overheal,0),mean()?1:0)}</em></div><div class="metric"><small>施加护盾</small><strong>${fmt(totals.reduce((a,m)=>a+m.shield,0),mean()?1:0)}</strong><em>实际吸收 ${fmt(totals.reduce((a,m)=>a+m.absorbed,0),mean()?1:0)}</em></div>`);};
 $('#output-view').onchange=e=>{view=e.target.value;rowsView();};$('#trend-mode').onchange=renderChart;$('#chart-group').onchange=renderChart;$('#export-charts').onclick=exportCharts;
 $('#apply-quick').onclick=()=>{const level=Math.max(1,Math.min(80,Math.trunc(Number($('#quick-level').value)||80))),imprint=Number($('#quick-stars').value),mode=$('#quick-mode').value;for(const m of plan.members)if(m.cardId)Object.assign(m,{level,imprint,mode});roster();dirty();toast('已应用到全部上阵成员');};
 const job=document.createElement('select');job.id='job-filter';job.setAttribute('aria-label','定位筛选');job.innerHTML='<option value="">全部定位</option>'+Object.entries(jobs).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');$('.card-filters').append(job);job.onchange=renderCardList;
}
function bind(){
 $('#export-csv').onclick=exportTable;
 $('#save-team').onclick=()=>{const record=result?.ok?{damage:result.total,healing:result.report.members.reduce((a,m)=>a+m.healing,0),shield:result.report.members.reduce((a,m)=>a+m.shield,0),version:DATA.version,savedAt:Date.now(),samples:result.samples||1}:null;saved.unshift({name:$('#team-name').value.trim()||plan.members.filter(m=>m.cardId).map(m=>cards.get(m.cardId)?.name).join(' / '),plan:GLCustomUI.snapshotPlan(),record});saved=saved.slice(0,12);saveList();toast('配队'+(record?'与结果':'')+'已保存');};
}
root.GLReportingUI={initialize,bind,renderChart};
})(typeof globalThis!=='undefined'?globalThis:this);
