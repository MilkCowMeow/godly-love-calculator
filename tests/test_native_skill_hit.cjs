'use strict';
const assert=require('node:assert/strict');
const {T,data}=require('./load_simulation.cjs'),C=global.GLConfig,F=Math.fround;
const future=data.skills.C03_SSR_014S2;
assert.equal(future.raw.TargetCamp,'My');assert.ok(Number(future.raw.AttRate)>0);
for(const [raw,expected]of [[{TargetCamp:'My',AttRate:'0.65'},false],[{TargetCamp:'Enemy',AttRate:'0.65'},true],[{TargetCamp:'',AttRate:'1'},true],[{TargetCamp:0,AttRate:'1'},false],[{TargetCamp:'Enemy',AttRate:'0'},false],[{TargetCamp:'Enemy',AttRate:'-1'},true]])assert.equal(C.isDamageHit({raw}),expected,'原生伤害命中由Enemy阵营与非零倍率共同决定');
assert.equal(C.evaluateCondition({CheckFun:'IsDamageSkill'},{source:{},skill:future}).pass,false);
assert.equal(C.evaluateCondition({CheckFun:'IsNoDamageSkill'},{source:{},skill:future}).pass,true);
assert.equal(C.evaluateCondition({CheckFun:'IsDamageSkill'},{source:{},skill:{raw:{AttRate:1,TargetCamp:'Enemy'},damage:false}}).pass,false,'事件明确为NoHit时使用事件类型');
function setup(ids=['C03_SSR_014','C01_SSR_001','C02_SSR_002','C03_SSR_003'],target='tower50'){
 const sim=new T.Simulation(data,{members:ids.map(cardId=>({cardId,level:80,imprint:0,hpRate:.6})),target,trialFloor:50,includeMinion:true,dummy:{referenceHP:100000,defence:0,speed:1,resistance:0},rounds:1},1);sim.random=()=>.01;sim.nowRoundRole=sim.units[0];return sim;
}
{
 const sim=setup(),allies=sim.alive(0),enemies=sim.alive(1),owner=allies[0];
 for(const u of allies)sim.addStatus(enemies[0],u,'ReduceAttack',4,0,null);
 const before=allies.map(u=>({hp:u.hp,progress:u.progress,until:u.statuses.find(s=>s.id==='ReduceAttack').until})),cooldowns=enemies.map(u=>({...u.cooldowns})),start=sim.events.length;
 const action=sim.skillAction({actor:owner,skill:future,selected:owner,main:true,kind:'main',actionType:0});
 assert.equal(action.directTargets.length,4);assert.equal(action.damage,0);assert.equal(sim.row.total,0);
 for(const [i,u]of allies.entries()){
  assert.equal(u.hp,before[i].hp,'友方选择范围中保留正倍率时HP保持原值');
  assert.equal(u.statuses.find(s=>s.id==='ReduceAttack').until,before[i].until-2,'实际弱化状态持续时间减少2回合');
  assert.ok(Math.abs(u.progress-F(before[i].progress+.1))<1e-7,'全体友方行动值提升10%继续生效');
 }
 for(const [i,u]of enemies.entries())assert.deepEqual(u.cooldowns,cooldowns[i],'空FID回落当前施放技能ID，敌方没有同ID技能时冷却保持原值');
 assert.ok(sim.events.slice(start).every(e=>!e.damage&&!e.heal));assert.equal(sim.queues.length,0);
 const nativeCtx=sim.context(owner,owner,action);assert.equal(nativeCtx.skill.damage,false);assert.equal(C.evaluateCondition({CheckFun:'IsDamageSkill'},nativeCtx).pass,false);
}
// 原生AddSkillCoolDown空FID只查找当前施放技能ID，命中同ID目标时才生效。
for(const [cardID,skillID]of [['C03_SSR_014','C03_SSR_014S2'],['C04_SSR_015','C04_SSR_015S2']]){
 const sim=setup([cardID]),owner=sim.units[0],enemy=sim.alive(1)[0],skill=data.skills[skillID],fun=C.configFunctions(skill.configs,skillID).find(f=>f.Fun==='AddSkillCoolDown');assert.ok(fun);assert.ok(!fun.FID);
 const action={actor:owner,skill,selected:skill.raw.TargetCamp==='My'?owner:enemy},unmatched={...enemy.cooldowns};sim.execute(owner,fun,action,enemy);assert.deepEqual(enemy.cooldowns,unmatched,skillID+'默认ID在敌方不存在时不修改其他技能');
 enemy.skills.push(skillID);enemy.cooldowns[skillID]=2;sim.execute(owner,fun,action,enemy);assert.equal(enemy.cooldowns[skillID],3);
 const baseID=enemy.normal,before=enemy.cooldowns[baseID]||0;sim.execute(owner,{Fun:'AddSkillCoolDown',Target:'All',FID:baseID,Value:1},action,enemy);
 assert.equal(enemy.cooldowns[baseID],before+1,'原生指定ID允许修改战技冷却');
}
// C01_SR_008S2的My/All空FID减冷却，只有拥有本技能的施放者命中。
{
 const sim=setup(['C01_SR_008','C01_SSR_001'],'dummy'),owner=sim.units[0],friend=sim.units[1],skill=data.skills.C01_SR_008S2;
 const fun=C.configFunctions(skill.configs,skill.id).find(f=>f.Fun==='AddSkillCoolDown');assert.ok(fun);assert.ok(!fun.FID);
 owner.cooldowns[skill.id]=3;const friendBefore={...friend.cooldowns};sim.execute(owner,fun,{actor:owner,selected:owner,skill},owner);
 assert.equal(owner.cooldowns[skill.id],2);assert.deepEqual(friend.cooldowns,friendBefore);assert.ok(!Object.hasOwn(friend.cooldowns,skill.id));
}
for(const [cardId,skillId]of [['C03_SSR_014','C03_SSR_014S1'],['C01_SSR_001','C01_SSR_001S2']]){
 const sim=setup([cardId],'dummy'),owner=sim.units[0],enemy=sim.units[1],skill=data.skills[skillId];
 const action=sim.skillAction({actor:owner,skill,selected:enemy,main:true,kind:'main',actionType:0});
 assert.ok(C.isDamageHit(skill));assert.ok(action.damage>0);assert.ok(sim.row.total>0,'普通Enemy技能继续产生伤害');
 assert.equal(sim.context(owner,enemy,action,'AfterEvent',null,{damage:false,target:enemy}).skill.damage,false,'状态变动事件保留NoHit标记');
}
{
 const sim=setup(['C02_SSR_006'],'dummy'),owner=sim.units[0],before=owner.hp;
 const action=sim.skillAction({actor:owner,skill:data.skills.C02_SSR_006S1,selected:sim.units[1],main:true,kind:'main',actionType:0});
 assert.ok(action.damage>0);assert.ok(owner.hp>before);assert.ok(sim.events.some(e=>e.heal>0),'普通攻击中的明确AddHP效果继续治疗');
}
{
 const sim=setup(['C03_SSR_014'],'dummy'),owner=sim.units[0],before=owner.hp,action={actor:owner,skill:future,selected:owner};
 sim.execute(owner,{Fun:'AddHP',TargetCamp:'My',Target:'Self',Value:123},action,owner);
 assert.equal(owner.hp,before+123,'NoHit技能上下文中的明确AddHP仍独立生效');
}
console.log('通过：原生NoHit门控、未来卡4名友方HP/弱化回合/行动值、默认冷却ID、Enemy伤害正例与明确治疗。');
