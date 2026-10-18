'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {T,data}=require('./load_simulation.cjs'),C=global.GLConfig;
const id='C03_SSR_012S1',card=data.cards.find(c=>c.id==='C03_SSR_012'),raw=JSON.stringify(data.skills[id]);
const resolve=()=>C.resolveSkill(card,id,{imprint:0}).functions[0];
C.setData(data);
const fun=resolve();
assert.equal(fun.Fun,'RandomAddStatus');assert.equal(fun.FID,undefined);
assert.equal(fun.Rate,.75);assert.equal(fun.StatusRound,1);
assert.deepEqual(fun.FIDs,['Silence','Unhealable','ReduceAttack','ReduceDef']);
assert.equal(JSON.stringify(data.skills[id]),raw,'correction must not modify the original client row');

// The exception only applies to this exact row and this exact client version.
for(const change of [
 d=>{d.version='1.0.1.next';},
 d=>{d.statuses.RandomAddStatus={id:'RandomAddStatus',raw:{ID:'RandomAddStatus'},configs:[]};},
 d=>{d.skills[id].configs[0].field='DynamicField2';},
 d=>{d.skills[id].configs[0].value.Rate=.5;},
 d=>{d.skills[id].configs[0].value.FIDs[0]='DifferentStatus';},
 d=>{d.skills[id].configs[0].value.IgnoreResist=1;}
]){
 const other=structuredClone(data);change(other);C.setData(other);assert.equal(resolve().Fun,'AddStatus');
}
const elsewhere=structuredClone(data),otherID='DifferentSkill';
elsewhere.skills[otherID]={...structuredClone(data.skills[id]),id:otherID};
C.setData(elsewhere);assert.equal(C.resolveSkill({...card,skills:[otherID]},otherID).functions[0].Fun,'AddStatus');C.setData(data);

const member=imprint=>({cardId:card.id,level:80,imprint,mode:'auto',overrides:{}});
const base={members:[member(5)],target:'dummy',rounds:12,includeMinion:true,dummy:{element:'None',referenceHP:100000,defence:2000,speed:2000,resistance:0},actions:{}};
function effectCase(random,changes={},immune=false){
 const sim=new T.Simulation(data,{...base,members:[member(0)]},1),owner=sim.units[0],target=sim.units.find(u=>u.camp===1);
 sim.random=()=>random;if(immune)target.props.Immune=1;
 const action={actor:owner,selected:target,skill:data.skills[id],normal:true,kind:'main',main:true,actionType:0};
 sim.execute(owner,{...fun,...changes},action,target);return {sim,owner,target};
}
for(const [index,random]of [.01,.26,.51,.76].entries()){
 const {sim,target}=effectCase(random,{Rate:1,IgnoreResist:1});
 assert.deepEqual(target.statuses.map(s=>s.id),[fun.FIDs[index]]);
 assert.equal(sim._nativeStatusRound(target,target.statuses[0]),1,'skill duration overrides the status default');
}
assert.equal(effectCase(.9).target.statuses.length,0,'75% base-rate gate remains active');
assert.equal(effectCase(.9,{Rate:1}).target.statuses.length,0,'effect resistance remains active');
assert.equal(effectCase(.1,{Rate:1,IgnoreResist:1},true).target.statuses.length,0,'immunity remains active');

const results=[];
for(const imprint of [0,1,2,3,4,5])for(const target of ['dummy','tower50'])for(const seed of [1,6,99]){
 const r=T.run(data,{...base,target,members:[member(imprint)]},seed);
 assert.equal(r.ok,true,r.error);assert.equal(r.total,r.rows.reduce((a,row)=>a+row.total,0));
 results.push({imprint,target,seed,total:r.total,result:r.result});
}
const a=T.run(data,base,1234),b=T.run(data,base,1234);assert.deepEqual(a.events,b.events);
assert.equal(JSON.stringify(data.skills[id]),raw);
fs.writeFileSync(__dirname+'/research/random_status_scenarios.json',JSON.stringify(results,null,2));
console.log('通过：誓约束缚精确配置纠正、原数据保留、四种随机状态、1回合期限、概率/抗性/免疫门控、36组完整战斗与种子复现。');
