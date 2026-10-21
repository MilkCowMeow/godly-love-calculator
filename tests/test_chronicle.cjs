'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {T,data}=require('./load_simulation.cjs'),B=global.GLBattle;
const stageID='C02_SSR_006_14',stage=data.chronicles[stageID];
const member=(cardId,extra={})=>({cardId,level:60,imprint:0,mode:'auto',overrides:{},...extra});
const plan={schemaVersion:2,target:'chronicle',chronicleStage:stageID,trialFloor:17,includeMinion:false,
 members:[member('C02_SSR_006'),member('C01_SSR_001'),member('C03_SSR_001'),member('C04_SSR_001')],rounds:8,actions:{},seed:19};
assert.equal(stage.activityName,'共奏心音');assert.equal(stage.sceneNum,'S14');
assert.equal(T.currentChronicle(data,'2026-10-21T00:00:00+08:00').id,stageID);
assert.equal(T.currentChronicle(data,'2026-10-19T23:59:59+08:00'),null);
assert.equal(T.currentChronicle(data,'2026-11-03T13:59:59+08:00').id,stageID);
assert.equal(T.currentChronicle(data,'2026-11-03T14:00:00+08:00'),null);
assert.equal(T.resolveChronicle(data,plan),stage,'explicit stage stays replayable after the event closes');
assert.equal(T.resolveEncounter(data,{target:'dummy'}),null);
assert.throws(()=>T.resolveChronicle(data,{...plan,chronicleStage:'missing'}),/缺少纪事关卡/);
assert.equal(T.run(data,{...plan,chronicleStage:'missing'},1).ok,false);
assert.equal(T.resolveEncounter(data,{target:'tower50',trialFloor:17}).floor,17);
assert.equal(T.encounterData(data,{target:'dummy'}),data);
assert.equal(data.skills.Ac_AttackStack,undefined,'event closure stays separate from the shared player skill library');

const rates=[.1,.15,.2,.3,.4,.5];
for(let stars=0;stars<=5;stars++){
 const p=structuredClone(plan);p.members[0].level=1;p.members[0].imprint=stars;p.members[0].hpRate=.5;
 const before=JSON.stringify(p),sim=new T.Simulation(data,p,17),players=sim.units.filter(u=>u.camp===0),boss=sim.units.find(u=>u.camp===1);
 assert.equal(JSON.stringify(p),before,'scene promotion does not rewrite the saved cultivation plan');
 assert.equal(players[0].level,80);assert.equal(players[0].imprint,stars);
 assert.deepEqual(players.slice(1).map(u=>u.level),[60,60,60]);
 assert.equal(boss.card.id,'MB004_1_C02_SSR_006');assert.equal(boss.level,80);assert.equal(boss.unlimited,undefined);
 assert.deepEqual(['MaxHP','Attack','Defence','Speed'].map(k=>boss.base[k]),[30906,3828,9440,3360]);
 assert.ok(boss.immuneList.includes('AntiSleep'));assert.equal(boss.statuses.some(s=>s.id.startsWith('Activity')),false);
 for(const unit of players){
  const buff=unit.statuses.find(s=>/^ActivityBuff/.test(s.id));assert.ok(buff);assert.equal(buff.source,unit.uid);
  const props=global.GLConfig.nativeStatusProperties({...buff,def:sim.data.statuses[buff.id]}).properties;
  assert.equal(props.AttackFinalRate,Math.fround(rates[stars]));assert.equal(props.HPFinalRate,Math.fround(rates[stars]));
  assert.equal(unit.statuses.filter(s=>s.id==='Activity_Main').length,unit.slot===0?1:0);
  assert.equal(unit.hp,unit.stats.MaxHP*(unit.slot===0?.5:1),'initial HP uses the final event-buffed maximum');
 }
 // Use a member with no entry HP/attack aura to verify native final-rate accumulation.
 const owner=players[0],base=owner.nativeBase,imprint=owner.nativeImprintRates;
 assert.equal(owner.stats.MaxHP,B.finalStat(base.MaxHP,imprint.HPRate||0,0,rates[stars],'MaxHP'));
 assert.equal(owner.stats.Attack,B.finalStat(base.Attack,imprint.AttackRate||0,0,rates[stars],'Attack'));
}
const overridden=structuredClone(plan);overridden.members[0].level=1;overridden.members[0].overrides={MaxHP:10000,Attack:5000};
const overrideSim=new T.Simulation(data,overridden,1),overrideOwner=overrideSim.units[0];
assert.equal(overrideOwner.stats.MaxHP,11000);assert.equal(overrideOwner.stats.Attack,5500);
const absent={...plan,members:plan.members.slice(1)};const noBonus=new T.Simulation(data,absent,1);
assert.ok(noBonus.units.every(u=>u.statuses.every(s=>!s.id.startsWith('Activity'))));
const allEnemies=new T.Simulation(data,{...plan,includeMinion:true,trialFloor:50},1);
assert.deepEqual(allEnemies.units.filter(u=>u.camp===1).map(u=>u.card.id),['MB004_1_C02_SSR_006']);

let combats=0;
for(const imprint of [0,2,5])for(const seed of [1,17,20261021]){
 const p=structuredClone(plan);p.members[0].imprint=imprint;
 const result=T.run(data,p,seed);combats++;assert.equal(result.ok,true,result.error);
 assert.ok(Number.isFinite(result.total));assert.deepEqual(T.run(data,p,seed),result);
 assert.equal(result.enemies[0].id,'MB004_1_C02_SSR_006');assert.ok(result.events.some(e=>e.status==='Ac_AttackStack'));
 const alternate=T.run(data,{...p,trialFloor:50,includeMinion:true},seed);
 assert.deepEqual(alternate,result,'remembered trial settings have no effect on a chronicle battle');
}

// Import/export and old presets use the actual page functions.
const context=vm.createContext({Date,DATA:data,ASSETS:{},GLTimeline:T,GLConfig:{setData(){}},GLCustomUI:{prepareImport:p=>({plan:p,cards:new Map(data.cards.map(c=>[c.id,c]))}),commitImport(){}},document:{}});
vm.runInContext(fs.readFileSync(__dirname+'/table_app.js','utf8').replace(/\binit\(\);\s*$/,'')+`
controls=roster=targetPanel=dirty=()=>{};
this.importPlan=raw=>{applyPlan(raw);return JSON.parse(JSON.stringify(plan));};
this.targetLabel=targetLabel;this.chroniclePeriod=chroniclePeriod;
`,context);
const imported=context.importPlan(plan);assert.equal(imported.target,'chronicle');assert.equal(imported.chronicleStage,stageID);
assert.equal(context.importPlan(JSON.parse(JSON.stringify(imported))).chronicleStage,stageID);
assert.match(context.targetLabel(imported),/共奏心音/);assert.match(context.chroniclePeriod(stage),/活动开启后/);assert.doesNotMatch(context.chroniclePeriod(stage),/00:00/);
assert.equal(context.importPlan({...plan,target:'dummy'}).target,'dummy');
assert.equal(context.importPlan({...plan,target:'tower50',trialFloor:17}).trialFloor,17);
assert.throws(()=>context.importPlan({...plan,target:'unknown'}),/对手类型/);
console.log(`通过：纪事档期、原始Boss、0～5星场内增益与80级提升、手填覆盖、HP初始化、${combats}组战斗、场景隔离及方案往返。`);
