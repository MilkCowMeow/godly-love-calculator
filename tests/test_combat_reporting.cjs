const assert=require('node:assert/strict');
const {T,data}=require('./load_simulation.cjs');
const Custom=require('./custom_characters.js'),Reports=require('./combat_reporting.js');
const defs=[0,1].map(i=>({id:'CUSTOM_report'+i,name:i?'接受者':'治疗者',stats:{MaxHP:10000,Attack:1000,Defence:2000,Speed:2000},skills:[{multiplier:0,effects:i?[]:[{type:'heal',target:'allAllies',value:20,valueStat:'MaxHP'},{type:'shield',target:'allAllies',rounds:3,value:15,valueStat:'MaxHP'}]},{multiplier:0}]}));
const dataset=Custom.withDefinitions(data,defs),plan={members:defs.map(d=>({cardId:d.id,level:80,imprint:0,mode:'basic',hpRate:.2})),target:'dummy',rounds:5,dummy:{defence:2000,speed:2000}};
const sim=new T.Simulation(dataset,plan,7),[source,target]=sim.units;
target.hp=9500;sim.heal(source,target,1000,null);
let report=sim.row.report;assert.equal(report.members[0].healing,500);assert.equal(report.members[0].overheal,500);assert.equal(report.members[1].receivedHealing,500);assert.equal(report.members[1].receivedOverheal,500);
assert.equal(report.flows[0].source,source.uid);assert.equal(report.flows[0].target,target.uid);
target.props.SealHeal=1;sim.heal(source,target,800,null);assert.equal(report.members[0].blocked,800);assert.equal(report.members[0].healing,500);delete target.props.SealHeal;
// Persistent healing is attributed to the original status caster, not its executor.
target.hp=9900;sim.heal(target,target,100,null,{Fun:'AddHP',_status:{source:source.uid}});assert.equal(report.members[0].healing,600);assert.equal(report.members[1].healing,0);
sim.addStatus(source,target,'Shield',3,1500,null);assert.equal(report.members[0].shield,1500);assert.equal(report.members[1].receivedShield,1500);
const runs=[T.run(dataset,plan,7),T.run(dataset,plan,9)];
for(const r of runs){assert.ok(r.ok,r.error);const healingEvents=r.events.filter(e=>e.kind==='heal').reduce((a,e)=>a+e.heal,0);assert.equal(r.report.members.reduce((a,m)=>a+m.healing,0),healingEvents);assert.ok(r.report.flows.some(f=>f.source==='0_0'&&f.target==='0_1'&&f.amount>0));assert.ok(r.report.members[0].overheal>0);for(const state of r.rows.at(-1).report.snapshot){const m=r.report.members[state.slot];assert.equal(state.hp,2000+m.receivedHealing-m.damageTaken,'生命变化必须与受到的治疗和实际扣血守恒');}}
// The worker discards later samples' event lists before averaging; reports survive.
delete runs[1].events;for(const row of runs[1].rows)delete row.events;
const avg=T.aggregate(runs,6);assert.ok(avg.ok);for(let i=0;i<4;i++)for(const key of Reports.keys){const expected=runs.reduce((a,r)=>a+r.report.members[i][key],0)/runs.length;assert.ok(Math.abs(avg.report.members[i][key]-expected)<1e-8,key);}
for(const flow of avg.report.flows){const expected=runs.reduce((a,r)=>a+(r.report.flows.find(f=>f.kind===flow.kind&&f.source===flow.source&&f.target===flow.target)?.amount||0),0)/2;assert.ok(Math.abs(flow.amount-expected)<1e-8);}
const ended=avg.rows.at(-1).report.snapshot.find(s=>s.slot===0);assert.equal(ended.alive,1,'战斗提前结束后的存活率不能变成零');assert.equal(avg.rows.at(-1).report.members[0].healing,0,'结束后的轮次不再产生治疗');
assert.equal(avg.total,0,'辅助记录不应制造伤害');
for(const key of ['healing','receivedHealing','receivedOverheal','shield','receivedShield','absorbed','damageTaken'])for(let i=0;i<4;i++)assert.ok(Math.abs(Reports.series(avg,key).reduce((a,r)=>a+r.values[i],0)-avg.report.members[i][key])<1e-8,'图表逐轮数值应与实际统计汇总一致：'+key);
assert.equal(Reports.series(avg,'hp').at(-1).values[0],10000,'生命图应使用轮末生命，不能累加生命快照');
assert.equal(Reports.series(avg,'damage').reduce((a,r)=>a+r.values.reduce((n,x)=>n+x,0),0),avg.total);

// Throughput includes overhealing without changing the HP accounting or blocked healing.
const example=new T.Simulation(dataset,plan,8),[healer,recipient]=example.units;
recipient.hp=9000;example.heal(healer,recipient,1440,null);
assert.equal(recipient.hp,10000);
assert.deepEqual(Reports.healingParts(example.row.report,0),{effective:1000,overheal:440,total:1440});
assert.deepEqual(Reports.healingParts(example.row.report,1,true),{effective:1000,overheal:440,total:1440});
recipient.props.SealHeal=1;example.heal(healer,recipient,2000,null);
assert.equal(Reports.healingParts(example.row.report,0).total,1440,'封愈阻止不能计入有效或溢出治疗');
assert.equal(Reports.healingParts(example.row.report,1,true).total,1440);
assert.equal(example.row.report.members[0].blocked,2000);
for(const key of ['totalHealing','totalReceivedHealing'])for(let slot=0;slot<4;slot++){
 const points=Reports.series(avg,key),parts=Reports.healingParts(avg.report,slot,key==='totalReceivedHealing');
 assert.ok(Math.abs(points.reduce((s,r)=>s+r.values[slot],0)-parts.total)<1e-8);
 for(const point of points)assert.ok(Math.abs(point.values[slot]-point.effectiveValues[slot]-point.overhealValues[slot])<1e-8);
}
// The reported card heals correctly against an undamaged dummy, even at full HP.
const members=['C01_SSR_002','C02_SSR_006','C02_SSR_002','C01_SSR_003'].map(cardId=>({cardId,level:80,imprint:5,mode:'auto'}));
for(const target of ['dummy','tower50'])for(const hpRate of [1,.5]){
 const p={target,rounds:10,members:members.map(m=>({...m,hpRate})),dummy:{defence:2000,speed:2000,referenceHP:100000}};
 const run=T.run(data,p,20261016);assert.ok(run.ok,run.error);
 const parts=Reports.healingParts(run.report,1);assert.ok(parts.total>0,'共奏心音必须记录战技治疗及溢出');
 const events=run.events.filter(e=>e.kind==='heal'&&e.healingSource==='0_1');
 assert.equal(parts.total,events.reduce((n,e)=>n+(e.heal||0)+(e.overheal||0),0));
 if(target==='dummy'&&hpRate===1){assert.equal(parts.effective,0);assert.equal(parts.total,parts.overheal);}
 assert.equal(Reports.series(run,'totalHealing').reduce((n,r)=>n+r.values[1],0),parts.total);
}
console.log(JSON.stringify({healing:avg.report.members[0].healing,overheal:avg.report.members[0].overheal,shield:avg.report.members[0].shield,flows:avg.report.flows.length,checks:'recipient attribution, effective healing, overheal, prevention, shields, averages and end-state carry-forward passed'},null,2));
