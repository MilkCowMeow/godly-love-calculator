const assert=require('node:assert/strict');
const {T,data}=require('./load_simulation.cjs');
const Custom=require('./custom_characters.js'),Reports=require('./combat_reporting.js');
const defs=[0,1].map(i=>({id:'CUSTOM_report'+i,name:i?'接受者':'治疗者',stats:{MaxHP:10000,Attack:1000,Defence:2000,Speed:2000},skills:[{multiplier:0,effects:i?[]:[{type:'heal',target:'allAllies',value:20,valueStat:'MaxHP'},{type:'shield',target:'allAllies',rounds:3,value:15,valueStat:'MaxHP'}]},{multiplier:0}]}));
const dataset=Custom.withDefinitions(data,defs),plan={members:defs.map(d=>({cardId:d.id,level:80,imprint:0,mode:'basic',hpRate:.2})),target:'dummy',rounds:5,dummy:{defence:2000,speed:2000}};
const sim=new T.Simulation(dataset,plan,7),[source,target]=sim.units;
target.hp=9500;sim.heal(source,target,1000,null);
let report=sim.row.report;assert.equal(report.members[0].healing,500);assert.equal(report.members[0].overheal,500);assert.equal(report.members[1].receivedHealing,500);
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
for(const key of ['healing','receivedHealing','shield','receivedShield','absorbed','damageTaken'])for(let i=0;i<4;i++)assert.ok(Math.abs(Reports.series(avg,key).reduce((a,r)=>a+r.values[i],0)-avg.report.members[i][key])<1e-8,'图表逐轮数值应与实际统计汇总一致：'+key);
assert.equal(Reports.series(avg,'hp').at(-1).values[0],10000,'生命图应使用轮末生命，不能累加生命快照');
assert.equal(Reports.series(avg,'damage').reduce((a,r)=>a+r.values.reduce((n,x)=>n+x,0),0),avg.total);
console.log(JSON.stringify({healing:avg.report.members[0].healing,overheal:avg.report.members[0].overheal,shield:avg.report.members[0].shield,flows:avg.report.flows.length,checks:'recipient attribution, effective healing, overheal, prevention, shields, averages and end-state carry-forward passed'},null,2));
