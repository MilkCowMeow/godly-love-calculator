'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {T,data:client}=require('./load_simulation.cjs');
const data=JSON.parse(fs.readFileSync(__dirname+'/catalog_data.json','utf8'));
const nodes=new Map();
const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',value:'',checked:false,focus(){},addEventListener(){}});return nodes.get(selector);};
const context=vm.createContext({DATA:data,ASSETS:{},document:{querySelector:node,querySelectorAll:()=>[]}});
const source=fs.readFileSync(__dirname+'/catalog_app.js','utf8');
assert.match(source,/window\.addEventListener\('hashchange',route\);route\(\);\s*$/);
vm.runInContext(source.replace(/window\.addEventListener\('hashchange',route\);route\(\);\s*$/,'')+`
this.ui={state,renderCards,visibleCatalogCards,config,skill,stages,statusGlossary};
`,context);
const {ui}=context;
// Numeric parameters must never be translated through object-name aliases.
const bleedSkill=data.cards.find(c=>c.id==='C04_SR_003').skills.find(s=>s.id==='C04_SR_003S1');
const bleedMarkup=ui.skill(bleedSkill);
assert.match(bleedMarkup,/<dt>持续回合<\/dt><dd>2<\/dd>/);
assert.match(bleedMarkup,/<dt>威力系数（Pow）<\/dt><dd>1<\/dd>/);
assert.match(bleedMarkup,/血绽/,'named status IDs must still resolve');
assert.doesNotMatch(bleedMarkup,/木桩/,'numeric 1 and 2 must not become target names');
const starCard=data.cards.find(c=>c.id==='C02_SSR_001');
const starMarkup=ui.stages(starCard.imprint,starCard);
assert.ok(starMarkup.includes(starCard.skills.find(s=>s.id==='C02_SSR_001S4').description.replace(/\n/g,'<br>')),'三星必须展示实际解锁S4的完整说明');
assert.match(starMarkup,/累计属性加成/);
assert.match(starMarkup,/生命 \+35%/,'二星累计15%+20%');
const penetrator=data.cards.find(c=>c.statusIds.includes('Penetrate'));
assert.match(ui.statusGlossary(penetrator),/穿透/);
assert.match(ui.statusGlossary(penetrator),/无视防御/);
for(const card of data.cards){
 const glossary=ui.statusGlossary(card);
 assert.doesNotMatch(glossary,/状态说明未获取|<h4><\/h4>/);
 const gate=card.imprint.find(r=>r.EnhanceSkill);
 if(gate){const unlocked=card.skills.find(s=>s.id===gate.EnhanceSkill);assert.ok(ui.stages(card.imprint,card).includes(unlocked.description.replace(/\n/g,'<br>')));assert.match(ui.skill(unlocked,card),/3 星解锁/);}
}
for(const number of [1,2,'1','2',0.15,'-2','1e2'])assert.equal(ui.config(number),String(number));
ui.renderCards();
assert.equal(ui.state.showR,false,'R cards are hidden on a fresh page');
assert.equal(ui.visibleCatalogCards().length,104);
let markup=node('#main').innerHTML;
const rarity=markup.match(/<select id="rarity">([\s\S]*?)<\/select>/)[1];
for(const value of ['SSR','SR','R'])assert.ok(rarity.includes('<option value="'+value+'"'),'each rarity must be an actual option');
const people=markup.match(/<select id="pair">([\s\S]*?)<\/select>/)[1];
for(const name of ['旭 / 琉斗','塞恩 / 夏暮','渡司 / 稻彦','玄泽 / 柳生','旭','琉斗','塞恩','夏暮','渡司','稻彦','玄泽','柳生'])assert.ok(people.includes('>'+name+'</option>'));
node('#rarity').onchange({target:{value:'R'}});
assert.equal(ui.state.showR,true,'choosing R automatically enables the visibility switch');
assert.equal(node('#show-r').checked,true);
assert.equal(ui.visibleCatalogCards().length,192);
assert.match(node('#count').textContent,/88/);
ui.state.pair='琉斗';ui.renderCards();
assert.match(node('#count').textContent,/11/);
node('#show-r').onchange({target:{checked:false}});
assert.equal(ui.state.rarity,'','turning off R clears an R-only rarity filter');
assert.equal(ui.visibleCatalogCards().length,104);
node('#reset').onclick();
assert.equal(ui.state.showR,false);
assert.equal(ui.state.pair,'');
for(const card of data.cards.filter(c=>c.rarity==='R')){
 const native=client.cards.find(c=>c.id===card.id);
 assert.equal(card.characters.length,1);
 assert.deepEqual(card.skills.map(s=>s.id),native.skills);
 for(const row of card.stats){const expected=T.baseStats(native,Number(row.level),0);for(const key of ['HP','Attack','Defence','Speed'])assert.equal(row[key],expected[key],card.id+' '+row.level+' '+key);}
 assert.equal(card.imprint.length,native.imprint.length);
}
console.log('通过：R卡默认隐藏、开关与稀有度联动、SSR/SR/R选项、单人与CP筛选、88张R卡的技能/成长/原生面板。');
