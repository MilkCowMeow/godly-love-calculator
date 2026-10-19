'use strict';
const assert=require('node:assert/strict'),{T,data}=require('./load_simulation.cjs');
const member=(cardId,extra={})=>({cardId,level:80,imprint:5,mode:'auto',...extra});
const team=['C01_SSR_002','C03_SSR_001','C02_SSR_002','C01_SSR_003'].map(id=>member(id));
const base={schemaVersion:2,members:team,target:'tower50',includeMinion:true,rounds:12,actions:{}};
assert.deepEqual(Object.keys(data.trials).map(Number).sort((a,b)=>a-b),Array.from({length:50},(_,i)=>i+1));
assert.equal(data.trials[1].level,18);
assert.equal(data.trials[28].level,61);
assert.equal(data.trials[50].level,80);
assert.equal(data.trials[1].enemies[0].id,'Trial_C02_R_002');
assert.deepEqual(data.trials[50].enemies.map(e=>e.id),['Trial_C04_SSR_002','Trial_C04_SR_003_50']);
assert.ok(data.trials[28].enemies[0].skills.includes('Trial_C03_R_101S3'));
assert.equal(data.skills.Trial_C03_R_101S3.configs.find(c=>c.key==='Fun').value.Target,'All');
assert.equal(data.skills.Trial_C03_R_101S3.configs.find(c=>c.key==='Fun').value.Value,.2);
const oldPlanResult=T.run(data,base,20261016),floor50=T.run(data,{...base,trialFloor:50},20261016);
assert.equal(oldPlanResult.ok,true,oldPlanResult.error);
assert.deepEqual(oldPlanResult,floor50,'旧方案默认50层，数值与事件逐条保持一致');
let cases=0,enemyCount=0;
for(let floor=1;floor<=50;floor++){
 const trial=T.resolveTrial(data,{trialFloor:floor});enemyCount+=trial.enemies.length;
 assert.equal(trial.id,'Trial_'+floor);
 assert.equal(trial.enemies.filter(e=>e.isBoss).length,1);
 const sim=new T.Simulation(data,{...base,trialFloor:floor},19);
 const enemies=sim.units.filter(u=>u.camp===1);
 assert.deepEqual(enemies.map(u=>u.card.id),trial.enemies.map(e=>e.id));
 for(const u of enemies){assert.equal(u.level,trial.level);assert.ok(u.card.baseCardId);for(const stat of ['MaxHP','Attack','Defence','Speed'])assert.equal(u.base[stat],u.card.stats[stat],`第${floor}层${u.card.id}的${stat}基础属性`);}
 const solo=new T.Simulation(data,{...base,trialFloor:floor,includeMinion:false},19);
 assert.equal(solo.units.filter(u=>u.camp===1).length,1);
 const boss=enemies.find(u=>u.isBoss);
 assert.ok(boss.card.skills.includes(floor<=46?'Trial_AttackStack':'Trial_AttackStack_2'));
 for(const seed of [1,17,20261020]){
  // 让敌方完整执行多个冷却周期，检查早期层数的技能和定制被动。
  const waiting={...base,trialFloor:floor,members:[member('C01_SSR_001',{mode:'wait',overrides:{MaxHP:1e9,Defence:0,Speed:2500}})]};
  for(const plan of [{...base,trialFloor:floor},waiting]){
   const result=T.run(data,plan,seed);cases++;
   assert.equal(result.ok,true,`第${floor}层，种子${seed}：${result.error}`);
   assert.ok(Number.isFinite(result.total));
   assert.equal(result.total,result.rows.reduce((sum,row)=>sum+row.total,0));
   assert.ok(result.enemies.every(e=>trial.enemies.some(raw=>raw.id===e.id)));
  }
 }
}
assert.equal(enemyCount,63);
for(const floor of [0,51,3.5,'invalid']){const r=T.run(data,{...base,trialFloor:floor},1);assert.equal(r.ok,false);assert.equal(r.total,null);assert.match(r.error,/试炼层数/);}
const dummy={...base,target:'dummy',dummy:{referenceHP:100000,defence:2000,speed:2000}};
assert.deepEqual(T.run(data,dummy,77),T.run(data,{...dummy,trialFloor:28},77),'人偶计算独立于已选试炼层数');
console.log(`通过：50层63敌方配置、${cases}场跨层战斗、旧50层方案兼容、人偶隔离及错误层数阻断。`);
