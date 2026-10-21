'use strict';
const assert=require('node:assert/strict');
const {T,data}=require('./load_simulation.cjs'),C=global.GLConfig;
let checks=0;
function test(name,fn){fn();checks++;console.log('通过：'+name);}
function setup(ids=['C03_SSR_014'],imprint=3,target='dummy'){
 const sim=new T.Simulation(data,{members:ids.map(cardId=>({cardId,level:80,imprint,hpRate:.6})),target,trialFloor:50,includeMinion:true,dummy:{referenceHP:100000,defence:0,speed:1,resistance:0},rounds:1},1);
 sim.random=()=>.01;sim.nowRoundRole=sim.units[0];return sim;
}
function action(sim,skillID,selected){const owner=sim.units[0],skill=data.skills[skillID];return {actor:owner,skill,selected:selected||sim.alive(1)[0],directTargets:[],damage:0,main:true,normal:owner.normal===skillID,kind:'main',actionType:0};}
function functionOf(skillID,fun){const f=C.configFunctions(data.skills[skillID].configs,skillID).find(f=>f.Fun===fun);assert.ok(f,skillID+' '+fun);return f;}
function put(sim,source,target,id,remaining,value=0){sim.addStatus(source,target,id,Math.max(1,remaining),value,null);const st=target.statuses.find(s=>s.id===id);assert.ok(st);st.until=target.displayRound+remaining;sim._nativeSyncStatusRounds(target);sim.refresh(target);return st;}

// Native ProcessSkillHit calls ProcessEvent for NoHit, then broadcasts
// AnyOneAfterSkillHit for each direct target (0x22FF290 / 0x230EC10).
test('全部52项NoHit主动技能逐目标保持事件顺序与零伤害条件',()=>{
 const ids=Object.values(data.skills).filter(s=>s.raw.SkillType!=='Passive'&&!C.isDamageHit(s)&&/^C\d\d_(?:SSR|SR|R)_\d+S\d$/.test(s.id));
 assert.equal(ids.length,52);
 let targets=0;
 for(const skill of ids){
  const cardID=skill.id.replace(/S\d+$/,''),team=[cardID,...['C02_R_002','C02_SSR_011','C04_SSR_007'].filter(id=>id!==cardID)],sim=setup(team),owner=sim.units[0];
  const a=action(sim,skill.id,skill.raw.TargetCamp==='My'?owner:sim.alive(1)[0]);a.directTargets=sim.skillTargets(owner,skill,a.selected,a);
  assert.ok(a.directTargets.length,skill.id);const trace=[],baseTrigger=sim.trigger,baseSource=sim._nativeSourceStatusEvent,baseAll=sim.allTrigger;
  sim.trigger=function(u,phase,a,e){if(e?.nativeEvent?.skillHit&&['BeforeEvent','AfterEvent'].includes(phase))trace.push(phase);return baseTrigger.call(this,u,phase,a,e);};
  sim._nativeSourceStatusEvent=function(phase,s,t,a,e){if(e?.nativeEvent?.skillHit)trace.push(phase);return baseSource.call(this,phase,s,t,a,e);};
  sim.allTrigger=function(phase,a,e){if(e?.nativeEvent?.skillHit)trace.push(phase);return baseAll.call(this,phase,a,e);};
  const hp=sim.units.map(u=>u.hp),progress=sim.units.map(u=>u.progress);
  for(const target of a.directTargets){trace.length=0;const e=sim.processSkillHit(owner,target,a);assert.equal(e.damage,0);assert.deepEqual(trace,['BeforeEvent','SourceBeforeEvent','AfterEvent','SourceAfterEvent','AnyOneAfterSkillHit'],skill.id);targets++;}
  assert.deepEqual(sim.units.map(u=>u.hp),hp,skill.id+' 不产生受击治疗');assert.deepEqual(sim.units.map(u=>u.progress),progress,skill.id+' 不触发伤害命中专属行动条');assert.equal(sim.queues.length,0);assert.equal(sim.row.total,0);
 }
 assert.ok(targets>=52);
});

test('NoHit命中保留护盾与一次技能伤害无效状态',()=>{
 const sim=setup(),owner=sim.units[0],a=action(sim,'C03_SSR_014S2',owner);
 put(sim,owner,owner,'Shield',4,777);const nullifier=put(sim,owner,owner,'SkillNullifier',4);
 const hp=owner.hp;sim.processSkillHit(owner,owner,a);assert.equal(owner.hp,hp);assert.equal(owner.statuses.find(s=>s.id==='Shield').value,777);assert.ok(owner.statuses.includes(nullifier));
});

test('两张真实净化卡缩短弱化后立即移除到期状态',()=>{
 for(const skillID of ['C03_SSR_014S2','C01_SR_010S2']){
  const sim=setup([skillID.replace(/S2$/,'')]),owner=sim.units[0],enemy=sim.alive(1)[0],a=action(sim,skillID,owner),f=functionOf(skillID,'AddAllDeBuffRound');
  const short=put(sim,enemy,owner,'Unhealable',1),equal=put(sim,enemy,owner,'Stun',2),long=put(sim,enemy,owner,'ReduceAttack',3),trace=[];
  const base=sim.trigger;sim.trigger=function(u,phase,a,e){if(e?.eventFun==='AddAllDeBuffRound'){trace.push([phase,u.statuses.includes(short),u.statuses.includes(equal),u.statuses.includes(long),e.damage,e.eventFunValue]);}return base.call(this,u,phase,a,e);};
  sim.execute(owner,f,a,owner);
  assert.deepEqual(trace,[['BeforeEvent',true,true,true,false,16],['AfterEvent',false,false,true,false,16]],skillID);
  assert.equal(long.until,owner.displayRound+1);assert.equal(long.rounds,1);assert.equal(owner.props.SealHeal||0,0);assert.equal(owner.props.Dizzy||0,0);assert.equal(sim.willPass(owner),false);
  const hp=owner.hp;sim.execute(owner,{Fun:'AddHP',TargetCamp:'My',Target:'Self',Value:100},a,owner);assert.equal(owner.hp,hp+100,'同一技能后续治疗及时解除封愈');
 }
});

test('两项真实缩短强化技能保留静态无限与禁止改回合的状态',()=>{
 for(const skillID of ['C01_SR_010S3','C02_R_102S2']){
  const sim=setup([skillID.replace(/S[23]$/,'')]),owner=sim.units[0],enemy=sim.alive(1)[0],f=functionOf(skillID,'AddAllBuffRound'),a=action(sim,skillID.endsWith('S3')?owner.normal:skillID,enemy);
  owner.cooldowns[skillID]=0;
  const short=put(sim,owner,enemy,'AddAttack',1),permanent=put(sim,owner,enemy,'SkillNullifier',-1),fixed=put(sim,owner,enemy,'Immortal_Resident',1),fixedUntil=fixed.until;
  sim.execute(owner,f,a,enemy);
  assert.ok(!enemy.statuses.includes(short),skillID);assert.ok(enemy.statuses.includes(permanent));assert.equal(permanent.rounds,-1);assert.ok(enemy.statuses.includes(fixed));assert.equal(fixed.until,fixedUntil);
 }
});

test('全部7项真实持续回合修改配置可执行正负边界',()=>{
 const spec=[['C02_SSR_001S2','AddAllBuffRound','AddAttack',1],['C03_SSR_014S2','AddAllDeBuffRound','ReduceAttack',-2],['C04_SSR_011S3','AddAllDeBuffRound','ReduceAttack',1],['C01_SR_010S2','AddAllDeBuffRound','ReduceAttack',-2],['C01_SR_010S3','AddAllBuffRound','AddAttack',-1],['C02_R_101S3','AddAllBuffRound','AddAttack',1],['C02_R_102S2','AddAllBuffRound','AddAttack',-1]];
 for(const [sid,fun,status,delta]of spec){
  const sim=setup([sid.replace(/S[23]$/,'')]),owner=sim.units[0],enemy=sim.alive(1)[0],f=functionOf(sid,fun),my=f.TargetCamp==='My',target=my?owner:enemy,a=action(sim,sid.endsWith('S3')?owner.normal:sid,target),st=put(sim,owner,target,status,5),before=st.until;
  owner.cooldowns[sid]=0;sim.execute(owner,f,a,target);assert.equal(st.until,before+delta,sid);assert.ok(target.statuses.includes(st));
 }
});

test('空FID冷却通过零伤害事件在Before与After之间回写',()=>{
 for(const sid of ['C03_SSR_014S2','C04_SSR_015S2','C01_SR_008S2']){
  const sim=setup([sid.replace(/S2$/,''),'C01_SSR_001']),owner=sim.units[0],enemy=sim.alive(1)[0],f=functionOf(sid,'AddSkillCoolDown'),target=f.TargetCamp==='My'?owner:enemy,a=action(sim,sid,target),trace=[];
  const unmatched=sim.units.map(u=>({...u.cooldowns}));if(target!==owner){sim.execute(owner,f,a,target);assert.deepEqual(sim.units.map(u=>u.cooldowns),unmatched);target.skills.push(sid);}
  target.cooldowns[sid]=3;const base=sim.trigger;sim.trigger=function(u,phase,a,e){if(e?.eventFun==='AddSkillCoolDown')trace.push([phase,u.uid,u.cooldowns[sid],e.damage,e.eventFunValue]);return base.call(this,u,phase,a,e);};
  sim.execute(owner,f,a,target);assert.deepEqual(trace,[['BeforeEvent',target.uid,3,false,18],['AfterEvent',target.uid,3+Number(f.Value),false,18]],sid);assert.equal(sim.row.total,0);
  const friend=sim.units[1];assert.deepEqual(friend.cooldowns,unmatched[1],sid+' 队友无同ID技能保持原值');
 }
});

test('全冷却修改只作用于首技能以外的主动技能',()=>{
 const sim=setup(['C02_R_001'],3,'tower50'),owner=sim.units[0],enemy=sim.alive(1)[0],a=action(sim,'C02_R_001S2',enemy),f=functionOf(a.skill.id,'AddAllSkillCoolDown');
 const before={...enemy.cooldowns},active=enemy.skills[1],passive=enemy.skills.find(id=>data.skills[id].raw.SkillType==='Passive');assert.ok(passive);sim.execute(owner,f,a,enemy);
 assert.equal(enemy.cooldowns[enemy.normal],before[enemy.normal]);assert.equal(enemy.cooldowns[active],(before[active]||0)+1);assert.equal(enemy.cooldowns[passive],before[passive]);
 const synthetic={id:'QA_NormalOverride',raw:{SkillType:''},configs:[{key:'IsNormalSkill',value:true}]};data.skills[synthetic.id]=synthetic;enemy.skills.push(synthetic.id);enemy.cooldowns[synthetic.id]=0;assert.ok(!sim.nativeMainCooldownSkills(enemy).includes(synthetic.id));delete data.skills[synthetic.id];
 const empty=setup(['C02_R_001']),e=empty.alive(1)[0],trace=[],base=empty.trigger;empty.trigger=function(u,phase,a,event){if(event?.eventFun==='AddAllSkillCoolDown')trace.push(phase);return base.call(this,u,phase,a,event);};empty.execute(empty.units[0],f,action(empty,'C02_R_001S2',e),e);assert.deepEqual(trace,['BeforeEvent','AfterEvent'],'无可改主动技能时，全冷却功能仍派发原生零伤害事件');
});

test('普通敌方技能仍按原生命中顺序结算实际伤害',()=>{
 const sim=setup(['C01_SSR_001'],3,'tower50'),owner=sim.units[0],enemy=sim.alive(1)[0],a=action(sim,owner.normal,enemy),hp=enemy.hp;assert.ok(C.isDamageHit(a.skill));const result=sim.processSkillHit(owner,enemy,a);assert.ok(result.damage>0);assert.ok(enemy.hp<hp);assert.ok(sim.row.total>0);
});
console.log('事件生命周期定向回归全部通过，共 '+checks+' 组。');
