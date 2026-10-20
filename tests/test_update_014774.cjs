'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {T,data}=require('./load_simulation.cjs'),B=global.GLBattle;
const catalog=JSON.parse(fs.readFileSync(__dirname+'/catalog_data.json','utf8'));
assert.equal(data.catalog,'catalog_014774');assert.equal(catalog.catalog,'catalog_014774');
assert.equal(data.asOf,'2026-10-20');assert.equal(catalog.asof,'2026-10-20');
assert.equal(data.publicVariables.BuildinResistance,.1);
assert.equal(data.cards.find(c=>c.id==='C02_SSR_006').availability,'current_announced');
assert.equal(data.cards.find(c=>c.id==='C04_SSR_006').availability,'past_announced');
for(const id of catalog.currentEventIds)assert.ok(catalog.events.some(e=>e.id===id),'当前活动编号须能解析：'+id);
for(const sk of Object.values(data.skills))assert.doesNotMatch(sk.description,/\[[^\]]+:[^\]]+:[^\]]+\]/,'技能说明须清理客户端链接标记');
for(const sk of Object.values(data.skills))assert.ok(!sk.name.startsWith('T_'),'缺少名称文本的辅助技能保留已知名称');
assert.equal(data.skills.C02_SSR_006S2.raw.CoolDown,'4');
const heal=data.skills.C02_SSR_006S1.configs.find(c=>c.key==='Fun'&&c.value.Fun==='AddHP');assert.equal(heal.value.ValueConvert.Rate,.08);
const paired=catalog.cards.find(c=>c.id==='C02_SSR_006');assert.equal(paired.availability,'current_announced');assert.equal(paired.skills.find(s=>s.id==='C02_SSR_006S2').row.CoolDown,'4');assert.equal(paired.skills.find(s=>s.id==='C02_SSR_006S1').configs.find(c=>c.value.Fun==='AddHP').value.ValueConvert.Rate,.08);
assert.match(catalog.eventDates.C02_SSR_006,/11\.03 14:00/);assert.equal(catalog.featuredCard,'C02_SSR_006');assert.equal(catalog.cards.find(c=>c.id==='C04_SSR_006').availability,'past_announced');
assert.ok(catalog.events.find(e=>e.id==='BranchC02_SSR_006').officialId);assert.ok(catalog.notices.some(n=>n.id==='news_3617'&&n.text.includes('2026年11月3日 14:00')));
for(let floor=1;floor<=50;floor++)for(const e of data.trials[floor].enemies){assert.equal(e.stats.ResistanceRate,Math.fround(e.isBoss?.1:.05));}
assert.deepEqual(data.trials[50].enemies,data.tower50.enemies,'兼容50层入口与新试炼目录一致');
const sim=new T.Simulation(data,{members:[{cardId:'C01_SSR_001',level:80,imprint:0}],target:'dummy',dummy:{referenceHP:100000,defence:0,speed:1,resistance:0},rounds:1},1),owner=sim.units[0],target=sim.units[1];owner.stats.EffectHitRate=0;target.stats.ResistanceRate=0;
const action={actor:owner,skill:data.skills[owner.normal],hitTypes:{}},ctx=sim.context(owner,target,action);sim.random=()=>.92;
assert.equal(sim.effectResisted(owner,target,{Fun:'AddStatus',FID:'ReduceAttack',IgnoreDodge:true},action,ctx),true,'10%内置抵抗将92%抽样阻挡');
sim.data={...data,publicVariables:{...data.publicVariables,BuildinResistance:.05}};
assert.equal(sim.effectResisted(owner,target,{Fun:'AddStatus',FID:'ReduceAttack',IgnoreDodge:true},action,ctx),false,'实际战斗读取数据中的内置抵抗参数');
sim.data=data;target.props.IgnoreBuildinResist=1;assert.equal(sim.effectResisted(owner,target,{Fun:'AddStatus',FID:'ReduceAttack',IgnoreDodge:true},action,ctx),false);
assert.ok(Math.abs(B.effectChance(.75,.2,.1)-.675)<1e-6);
for(const c of data.cards){assert.ok(c.name&&!c.name.startsWith('T_'));const same=catalog.cards.find(x=>x.id===c.id);for(const sid of c.skills){if(!data.skills[sid])continue;assert.deepEqual(same.skills.find(s=>s.id===sid).row,data.skills[sid].raw,'全部卡牌的图鉴技能原表与计算器一致');}}
console.log('通过：014774双站数据、共奏心音8%治疗/4回合冷却、内置抵抗数据驱动、50层敌方抗性、活动档期与192卡技能一致性。');
