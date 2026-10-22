'use strict';
const assert=require('node:assert/strict');
const {T,data}=require('./load_simulation.cjs');
function battle(){
 const sim=new T.Simulation(data,{members:[{cardId:'C02_SSR_002',level:67,imprint:4,mode:'auto'}],target:'tower50',trialFloor:37,includeMinion:true,rounds:1},20261023);
 const owner=sim.units[0],target=sim.units.find(u=>u.camp===1);
 assert.equal(target.card.id,'Trial_C04_SR_001');assert.ok(target.immuneList.includes('AntiTaunt'));
 const action={actor:owner,skill:data.skills.C02_SSR_002S1,selected:target,main:true,kind:'main',normal:true,hitTypes:{[target.uid]:'normal'}};
 const original=data.skills.C02_SSR_002S1.configs.find(c=>c.key==='Fun'&&c.value.Fun==='AddStatus'&&c.value.FID==='Taunt').value;
 return {sim,owner,target,action,original};
}
function execute(draws,edit=()=>{}){
 const x=battle(),values=[...draws];let consumed=0;
 // Freeze the unrelated context.randomUnit sample: this fixture has no AddRandom converter.
 // Only the function probability and effect-resistance draws are measured below.
 const context=x.sim.context;
 x.sim.context=function(...args){const random=this.random;this.random=()=>.5;try{return context.apply(this,args);}finally{this.random=random;}};
 x.sim.random=()=>{assert.ok(values.length,'unexpected additional RNG call');consumed++;return values.shift();};
 const f=structuredClone(x.original);edit(x,f);
 const attempted=x.sim.execute(x.owner,f,x.action,x.target);
 assert.equal(values.length,0,'expected native RNG draw was skipped');
 return {...x,attempted,consumed};
}
let x=execute([.5,.3315056]);
assert.equal(x.consumed,2,'actual battle: 75% function gate then successful effect resistance check, followed by AntiTaunt');
assert.equal(x.attempted,true);assert.ok(x.target.statuses.every(s=>s.id!=='Taunt'));
assert.ok(x.sim.events.every(e=>e.kind!=='resist'),'passing resistance reaches specific status immunity');
x=execute([.5,.99]);
assert.equal(x.attempted,true);assert.equal(x.sim.events.filter(e=>e.kind==='resist').length,1,'resistance failure is evaluated even when AntiTaunt is present');
x=execute([.8]);
assert.equal(x.attempted,false);assert.equal(x.consumed,1,'failed 75% function probability exits before resistance');
x=execute([.5,.8726642],({target})=>{target.immuneList=target.immuneList.filter(id=>id!=='AntiTaunt');});
assert.equal(x.attempted,true);assert.ok(x.target.statuses.some(s=>s.id==='Taunt'),'same observed resistance draw can apply Taunt to a susceptible target');
x=execute([.5,.4],({target},f)=>{f.FID='Poison';f.Rate=1;target.immuneList.push('AntiPoison');});
assert.equal(x.attempted,true);assert.equal(x.consumed,2);assert.ok(x.target.statuses.every(s=>s.id!=='Poison'),'the shared negative-status path also checks resistance before AntiPoison');
x=execute([.5],({target},f)=>{f.FID='AddDefence';f.Rate=1;target.immuneList.push('AntiAddDefence');});
assert.equal(x.attempted,true);assert.equal(x.consumed,1,'positive status does not enter the negative-effect resistance branch');
console.log('通过：试炼37真实Boss与花落知心嘲弄、概率失败、抵抗失败、可施加目标、浸毒免疫及正向状态共6组顺序回归。');
