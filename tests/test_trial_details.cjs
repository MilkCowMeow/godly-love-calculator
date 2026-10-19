'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {T,data}=require('./load_simulation.cjs');
const details=require('./trial_details.js'),original=JSON.stringify(data);
let enemies=0,skills=0;
for(let floor=1;floor<=50;floor++){
 const trial=T.resolveTrial(data,{trialFloor:floor}),model=details.build(data,trial),html=details.render(data,trial);
 assert.equal(model.floor,floor);assert.equal(model.enemies.length,trial.enemies.length);
 assert.ok(!html.includes('undefined'));assert.ok(!html.includes('NaN'));assert.ok(!html.includes('·'));
 for(const unit of model.enemies){
  const e=unit.enemy;enemies++;skills+=unit.skills.length;
  assert.deepEqual(unit.skills.map(s=>s.id),e.skills.filter(id=>data.skills[id]));
  assert.ok(unit.skills.every(s=>s.description),'所有有效技能均有说明');
  assert.ok(unit.rules.length>=2);assert.equal(unit.rules[0].skillID,e.skillSlots[1]);assert.equal(unit.rules[1].skillID,e.skillSlots[0]);
  assert.ok(unit.rules.every(r=>r.targets.length&&r.targets.every(t=>t)));
  assert.equal(unit.immunities.length,e.isBoss&&![11,12].includes(floor)?6:1);
  assert.ok(unit.immunities.some(x=>x.name==='晕眩'));
  if(e.isBoss||floor===38){assert.equal(unit.stack.rate,floor<=46?.05:.15);assert.equal(unit.stack.max,999);assert.equal(unit.stack.duration,-1);}else assert.equal(unit.stack,null);
  for(const sk of unit.skills){assert.ok(html.includes(sk.id));if(e.hiddenSkills.includes(sk.id))assert.equal(sk.kind,'隐藏辅助技');}
 }
 const off=details.build(data,trial,{includeMinion:false});assert.ok(off.enemies.filter(u=>!u.enemy.isBoss).every(u=>!u.active));assert.ok(off.enemies[0].active);
}
assert.equal(enemies,63);
const at=floor=>details.build(data,data.trials[floor]);
const boss28=at(28).enemies[0];assert.ok(boss28.skills.some(s=>s.id==='Trial_C03_R_101S3'));assert.ok(!boss28.skills.some(s=>s.id==='C03_R_101S3'));assert.match(boss28.skills.find(s=>s.id==='Trial_C03_R_101S3').notes[0],/全队推进20%/);
const boss47=at(47).enemies[0];assert.match(boss47.rules[0].conditions.join(''),/对面至少一名角色的弱化状态数量严格大于1/);
const boss48=at(48).enemies[0],hidden48=boss48.skills.find(s=>s.id==='C02_SSR_001S3');assert.equal(hidden48.kind,'隐藏辅助技');assert.equal(hidden48.incoming[0].fun,'替换技能');assert.match(boss48.skills.find(s=>s.id==='C02_SSR_001S4').notes.join(''),/强化状态数量严格大于1/);
const model50=at(50),boss50=model50.enemies[0],minion50=model50.enemies[1];assert.equal(boss50.immunities.length,6);assert.equal(minion50.immunities.length,1);assert.match(boss50.skills.find(s=>s.id==='C04_SSR_002S1').notes.join(''),/严格低于30%/);assert.match(boss50.skills.find(s=>s.id==='C04_SSR_002S2').notes.join(''),/0\.0022/);
const hidden50=boss50.skills.find(s=>s.id==='C04_SSR_002S3');assert.equal(hidden50.kind,'隐藏辅助技');assert.match(hidden50.description,/30%/);assert.equal(hidden50.incoming[0].sourceID,'C04_SSR_002S1');assert.ok(!minion50.skills.some(s=>s.id==='C04_SR_003S4'));
assert.match(boss50.states.find(s=>s.id==='Stealth').description,/减伤50%/);
const healers=[];for(let f=1;f<=50;f++)for(const u of at(f).enemies)if(u.enemy.ai.includes('M_S1Att_S2Hea'))healers.push(u);
assert.ok(healers.length);for(const u of healers){assert.equal(u.rules[0].targets[0],'优先选择技能目标阵营中的Boss');assert.match(u.rules[0].targets[1],/严格低于99%/);}
assert.match(at(22).enemies.find(u=>u.enemy.ai.includes('M_C04_R_007')).rules[0].conditions.join(''),/至少一名同伴有技能处于冷却/);
assert.ok(at(5).enemies[0].skills.some(s=>s.configs.some(c=>c.key==='CriticalRate'&&c.value===.25)));
assert.ok(at(45).enemies[0].skills.some(s=>s.configs.some(c=>c.key==='HPFinalRate'&&c.value===.15)));
assert.equal(details.configHTML(1,data),'1');assert.equal(details.configHTML('2',data),'2');assert.ok(!details.configHTML({StatusRound:2,Who:'Target'},data).includes('木桩'));assert.match(details.configHTML({Who:'Target'},data),/效果上下文目标/);
assert.equal(JSON.stringify(data),original,'详情生成对全部战斗数据保持只读');
// 调用真实弹窗入口，检验它随所选层数和随从开关读取敌方档案。
const elements=new Map(),element=()=>({textContent:'',innerHTML:'',scrollTop:123,showModal(){this.open=true;}});
for(const id of ['#detail-kicker','#detail-title','#detail-body','#detail-dialog'])elements.set(id,element());
const ctx=vm.createContext({DATA:data,ASSETS:{},GLTimeline:T,GLTrialDetails:details,GLConfig:{setData(){}},document:{querySelector:s=>elements.get(s),querySelectorAll:()=>[]}});
const source=fs.readFileSync(__dirname+'/table_app.js','utf8');vm.runInContext(source.replace(/\binit\(\);\s*$/,'')+'\nthis.openTrial=(floor,minions)=>{plan.trialFloor=floor;plan.includeMinion=minions;openBoss();};',ctx);
ctx.openTrial(28,true);assert.match(elements.get('#detail-title').textContent,/第28层/);assert.match(elements.get('#detail-body').innerHTML,/Trial_C03_R_101S3/);assert.equal(elements.get('#detail-dialog').scrollTop,0);
ctx.openTrial(50,false);assert.match(elements.get('#detail-title').textContent,/第50层/);assert.match(elements.get('#detail-body').innerHTML,/当前已移出计算/);assert.ok(elements.get('#detail-dialog').open);
console.log(`通过：50层${enemies}名敌方、${skills}条技能引用、免疫/叠攻/6组AI/隐藏技/条件边界、只读数据及真实详情入口。`);
