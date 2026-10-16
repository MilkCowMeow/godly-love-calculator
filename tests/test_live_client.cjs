const assert=require('node:assert/strict'),fs=require('node:fs');
const {T,data}=require('./load_simulation.cjs'),B=global.GLBattle;
const fixture=JSON.parse(fs.readFileSync(__dirname+'/native_client_fixture.json','utf8'));
for(const [i,sample]of fixture.samples.entries()){
  const actual=B.rawSkillDamage(sample.params,sample.hitMultiplier).value;
  assert.ok(Math.abs(actual-sample.loggedRaw)<=fixture.loggedPrecisionTolerance,`native sample ${i+1}: ${actual} vs ${sample.loggedRaw}`);
  assert.equal(B.roundEven(actual),B.roundEven(sample.loggedRaw),`native integer sample ${i+1}`);
}
const sim=new T.Simulation(data,{members:[{cardId:'C02_SR_003',level:80,imprint:5,mode:'auto'}],target:'tower50',rounds:5},20261017);
const player=sim.units[0],boss=sim.units.find(u=>u.isBoss),minion=sim.units.find(u=>u.camp===1&&!u.isBoss);
assert.equal(player.stats.Attack,3509,'native logged Attack; preserve fractional base until final cast');
assert.equal(player.stats.Defence,2655);
assert.equal(boss.hp,31826);assert.equal(minion.hp,12454);
const stacked=[];for(let i=0;i<5;i++){sim.addStatus(boss,boss,'Trial_AttackStack_2',-1,0,null);stacked.push(boss.stats.Attack);}
assert.deepEqual(stacked,[3376,3817,4257,4698,5138],'five logged boss attack values');
const converted=sim.value({Property:'Attack',Rate:.15},sim.context(minion,player,null));
assert.ok(Math.abs(converted-159.939)<.0001,'native logged Bleed value reads fractional runtime property');
const copied=JSON.parse(JSON.stringify(data));const modified=copied.cards.find(c=>c.id==='C02_SR_003');modified.configs.push({key:'AttackRate',value:.2});
const withRate=new T.Simulation(copied,{members:[{cardId:modified.id,level:80,imprint:5}],target:'dummy',dummy:{},rounds:1},1);
assert.equal(withRate.units[0].stats.Attack,3861,'imprint and temporary AttackRate share the native additive property');
console.log(`通过：${fixture.samples.length}条原生命中/状态伤害、实际3509攻击、五次叠攻、159.939持续伤害取值、刻印与临时属性合并。`);
