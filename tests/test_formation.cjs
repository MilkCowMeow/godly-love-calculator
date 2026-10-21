'use strict';
const assert=require('node:assert/strict');
const {swapMemberPositions}=require('./formation_ui.js');
const {T,data}=require('./load_simulation.cjs');

// Distinct configurations catch swaps that move only card IDs or only visible fields.
const members=['C01_SSR_001','C02_SSR_001','C03_SSR_001','C04_SSR_001'].map((cardId,i)=>({
 cardId,level:80-i,imprint:i,mode:['basic','ultimate','wait','auto'][i],
 overrides:{MaxHP:90000+i,Attack:1000+i},hpRate:.4+i/10
}));
const plan={schemaVersion:2,members,target:'tower50',trialFloor:50,includeMinion:true,rounds:4,seed:19,
 actions:{1:{0:'basic',2:'ultimate',3:'wait'},2:{0:'wait'},3:{2:'basic'},4:{1:'ultimate'}}};
const snapshot=structuredClone(plan),originalMembers=[...members];
assert.equal(swapMemberPositions(plan,0,2),true);
assert.equal(plan.members[0],originalMembers[2],'entire member object moves to the destination');
assert.equal(plan.members[2],originalMembers[0]);
assert.equal(plan.members[1],originalMembers[1]);assert.equal(plan.members[3],originalMembers[3]);
assert.deepEqual(plan.actions,{1:{0:'ultimate',2:'basic',3:'wait'},2:{2:'wait'},3:{0:'basic'},4:{1:'ultimate'}});
assert.equal(Object.hasOwn(plan.actions[2],0),false,'default actions remain absent, not undefined');
assert.deepEqual(snapshot.members.map(m=>m.cardId),['C01_SSR_001','C02_SSR_001','C03_SSR_001','C04_SSR_001'],'saved snapshots remain unchanged');
assert.equal(plan.seed,19);assert.equal(plan.trialFloor,50);assert.equal(plan.rounds,4);
assert.deepEqual(JSON.parse(JSON.stringify(plan)),plan,'plan remains JSON-serializable');
assert.equal(swapMemberPositions(plan,2,0),true);assert.deepEqual(plan,snapshot,'swap twice restores the full plan');
for(const [a,b] of [[0,0],[-1,2],[0,4],[.5,2],[0,NaN],['0',2]]){
 const before=JSON.stringify(plan);assert.equal(swapMemberPositions(plan,a,b),false);assert.equal(JSON.stringify(plan),before);
}
const empty=structuredClone(plan);empty.members[2]={cardId:'',level:1,imprint:0,mode:'auto',overrides:{}};
const emptyMember=empty.members[2];assert.equal(swapMemberPositions(empty,0,2),true);assert.equal(empty.members[0],emptyMember);assert.equal(empty.members[2].cardId,'C01_SSR_001');
const noActions={members:[...originalMembers]};assert.equal(swapMemberPositions(noActions,0,3),true);assert.equal(noActions.actions,undefined);

// Exercise the real Floor 50 AI and incoming-hit attribution after a position swap.
const combat={members:originalMembers.map(m=>({cardId:m.cardId,level:80,imprint:0})),target:'tower50',trialFloor:50,includeMinion:true,rounds:1};
function selectedFirst(p){
 const sim=new T.Simulation(data,p,1),boss=sim.units.find(u=>u.camp===1&&u.card.id==='Trial_C04_SSR_002');
 assert.ok(boss);sim.random=()=>.2;
 const choice=sim.choose(boss);assert.equal(choice.selected.campPosition,0);assert.equal(choice.selected.slot,0);
 choice.skill=data.skills[boss.normal];choice.targets=[choice.selected];const start=sim.events.length;
 sim.skillAction({actor:boss,skill:choice.skill,selected:choice.selected,main:true,kind:'main',actionType:0});
 assert.ok(sim.events.slice(start).some(e=>e.actor===boss.uid&&e.target==='0_0'&&e.damage>0),'hit targets the new first position');
 return choice.selected.card.id;
}
assert.equal(selectedFirst(combat),'C01_SSR_001');swapMemberPositions(combat,0,2);assert.equal(selectedFirst(combat),'C03_SSR_001');
const vacant=structuredClone(combat);vacant.members[0]={};
const sim=new T.Simulation(data,vacant,1),boss=sim.units.find(u=>u.camp===1),skill=data.skills[boss.normal];
assert.deepEqual(sim.nativeAITargetCandidates(boss,skill,{Type:'FrontRow'},{actor:boss,skill}),[],'an empty first position stays empty');
const first=T.run(data,combat,123);assert.equal(first.ok,true,first.error);assert.deepEqual(T.run(data,combat,123),first,'swapped formations retain seed reproducibility');
console.log('通过：完整成员交换、稀疏逐轮策略、空位、边界输入、JSON保存及五十层实际选目标和受击归属。');
