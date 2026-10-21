'use strict';
const assert=require('node:assert/strict'),{T,data}=require('./load_simulation.cjs');
const stage=data.chronicles?.C02_SSR_006_14;assert.ok(stage,'当前纪事闭包应包含共奏心音S14');
let tests=0;function test(name,fn){fn();tests++;console.log('通过：'+name);}
function setup(ids=['C01_SSR_001','C02_SSR_001','C02_SSR_005','C02_SSR_007']){
 return new T.Simulation(data,{members:ids.map(cardId=>({cardId,level:80,imprint:0})),target:'chronicle',chronicleStage:stage.id,rounds:1},7);
}
function direct(sim,index=2){const boss=sim.alive(1)[0],selected=sim.alive(0)[index],skill=sim.data.skills[boss.normal],action={actor:boss,skill,selected,main:true,kind:'main',actionType:0};return {boss,selected,skill,action};}

test('AI选主目标保持站位规则，副目标在出手时抽样一次',()=>{
 const sim=setup(),boss=sim.alive(1)[0];let draws=0;sim.random=()=>{draws++;return .1;};
 const choice=sim.choose(boss);assert.equal(choice.skill.raw.TargetType,'RandomTwo');assert.equal(choice.selected.slot,0);assert.deepEqual(choice.targets,[]);assert.equal(draws,2,'只抽FrontRow和单候选怪物选择');
 const a={actor:boss,skill:choice.skill,selected:choice.selected};const targets=sim.skillTargets(boss,choice.skill,choice.selected,a);assert.deepEqual(targets.map(u=>u.slot),[0,1]);assert.equal(draws,3,'只为副目标新增一次抽样');
 assert.deepEqual(sim.select(boss,{Target:'RandomTwo'}, {...a}).map(u=>u.slot),[0,1]);assert.equal(draws,3);
});

test('首次站位排序，后续浅拷贝按主副顺序复用缓存',()=>{
 const sim=setup(),{boss,selected,skill,action}=direct(sim,2);let draws=0;sim.random=()=>{draws++;return 0;};
 assert.deepEqual(sim.skillTargets(boss,skill,selected,action).map(u=>u.slot),[0,2]);assert.equal(draws,1);
 const copy={...action,_eventTarget:sim.alive(0)[1]};assert.equal(copy._nativeRandomTargets,action._nativeRandomTargets);
 assert.deepEqual(sim.select(boss,{Target:'RandomTwo'},copy).map(u=>u.slot),[2,0]);assert.equal(draws,1);
 const next={actor:boss,skill,selected};sim.skillTargets(boss,skill,selected,next);assert.equal(draws,2,'新的动作使用新的副目标缓存');
});

test('缓存保留死亡和新增潜影供后续效果条件读取',()=>{
 const sim=setup(),{boss,selected,skill,action}=direct(sim,2);let draws=0;sim.random=()=>{draws++;return 0;};
 const pair=sim.skillTargets(boss,skill,selected,action),secondary=pair.find(u=>u!==selected);secondary.hp=0;secondary.dead=true;secondary.props.Stealth=1;secondary.props.HideOut=1;
 assert.deepEqual(sim.select(boss,{SelectInfo:{TargetType:'RandomTwo',Condition:{Property:'NowHP',Value:0}}},{...action}),[selected,secondary]);assert.equal(draws,1,'缓存读取不重筛死亡/隐匿或消耗随机数');
});

test('原生默认允许潜影和无敌副目标，排除躲藏与死亡',()=>{
 const sim=setup(),{boss,selected,skill,action}=direct(sim,0),allies=sim.alive(0);allies[1].props.Stealth=1;allies[1].props.Invincible=1;allies[2].props.HideOut=1;allies[3].dead=true;allies[3].hp=0;
 let draws=0;sim.random=()=>{draws++;return .9;};assert.deepEqual(sim.skillTargets(boss,skill,selected,action).map(u=>u.slot),[0,1]);assert.equal(draws,1);
 const explicit={actor:boss,skill,selected};assert.deepEqual(sim.select(boss,{SelectInfo:{TargetType:'RandomTwo',IncludeStealth:false,IncludeInvincible:false}},explicit),[selected]);assert.equal(draws,1);
});

test('没有副目标时保留主目标并维持零抽样',()=>{
 const sim=setup(['C01_SSR_001']),{boss,selected,skill,action}=direct(sim,0);let draws=0;sim.random=()=>{draws++;return .9;};
 assert.deepEqual(sim.skillTargets(boss,skill,selected,action),[selected]);assert.deepEqual(sim.select(boss,{Target:'RandomTwo'}, {...action}),[selected]);assert.equal(draws,0);assert.deepEqual(sim.skillTargets(boss,skill,null,{actor:boss,skill}),[]);
});

test('真实纪事Boss攻击两人与血绽效果复用同一对目标',()=>{
 const sim=setup(),{boss,selected,skill}=direct(sim,2);sim.random=()=>.01;
 const a=sim.skillAction({actor:boss,selected,skill,main:true,kind:'main',actionType:0});assert.deepEqual(a.directTargets.map(u=>u.slot),[0,2]);
 const hits=sim.events.filter(e=>e.kind==='direct'&&e.actor===boss.uid),bleeds=sim.events.filter(e=>e.kind==='status'&&e.actor===boss.uid&&e.status==='Bleed');
 assert.deepEqual(hits.map(e=>e.target),['0_0','0_2']);assert.deepEqual(bleeds.map(e=>e.target),['0_2','0_0']);assert.ok(hits.every(e=>e.actual>0));
});

test('BeforeSkill被动的浅拷贝与实际伤害共享已选副目标',()=>{
 const sim=setup(),{boss,selected,skill}=direct(sim,2);
 boss.global.push({Trigger:'BeforeSkill',Fun:'AddStatus',Target:'RandomTwo',FID:'Unhealable',StatusRound:1});sim.random=()=>.01;
 const a=sim.skillAction({actor:boss,selected,skill,main:true,kind:'main',actionType:0});
 const before=sim.events.filter(e=>e.kind==='status'&&e.status==='Unhealable'),hits=sim.events.filter(e=>e.kind==='direct'&&e.actor===boss.uid);
 assert.deepEqual(before.map(e=>e.target),['0_2','0_0']);assert.deepEqual(hits.map(e=>e.target),['0_0','0_2']);assert.ok(before.every(e=>e.n<hits[0].n));assert.deepEqual(a._nativeRandomTargets.secondaryIDs,['0_0']);
});

test('玩家旧双目标技能的行动值与血绽跟随原命中对象',()=>{
 const sim=setup(['C03_SSR_006']),owner=sim.alive(0)[0],boss=sim.alive(1)[0];
 const other=sim.makeUnit(stage.enemies[0],{level:80,imprint:0},1,1);sim.units.push(other);sim.refresh(other);const third=sim.makeUnit(stage.enemies[0],{level:80,imprint:0},1,2);sim.units.push(third);sim.refresh(third);
 sim.random=()=>.01;const a=sim.skillAction({actor:owner,skill:sim.data.skills[owner.normal],selected:other,main:true,kind:'main',actionType:0});
 assert.deepEqual(a.directTargets.map(u=>u.uid),[boss.uid,other.uid]);const bleed=sim.events.filter(e=>e.kind==='status'&&e.actor===owner.uid&&e.status==='Bleed');assert.deepEqual(bleed.map(e=>e.target),[other.uid,boss.uid]);assert.ok(!third.statuses.some(s=>s.id==='Bleed'));assert.equal(third.progress,0);
});

test('普通单体和全体技能维持原目标与随机消费',()=>{
 const sim=setup(),owner=sim.alive(0)[0],boss=sim.alive(1)[0];let draws=0;sim.random=()=>{draws++;return .9;};
 const one=sim.data.skills[owner.normal];assert.deepEqual(sim.skillTargets(owner,one,boss,{actor:owner,skill:one,selected:boss}),[boss]);assert.equal(draws,0);
 const all=sim.data.skills.MB004_1_C02_SSR_006S2;assert.deepEqual(sim.skillTargets(boss,all,owner,{actor:boss,skill:all,selected:owner}),sim.alive(0));assert.equal(draws,0);
});
console.log('原生RandomTwo回归全部通过，共 '+tests+' 组。');
