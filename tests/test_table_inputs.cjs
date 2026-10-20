'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {T,data}=require('./load_simulation.cjs');

// Exercise the real roster change handlers; unrelated redraws are outside this test.
const inputs=Array.from({length:4},(_,slot)=>['level','imprint','mode'].map(key=>({dataset:{member:String(slot),key},value:''}))).flat();
const roster={innerHTML:'',querySelectorAll:selector=>selector==='[data-member]'?inputs:[]};
const context=vm.createContext({DATA:data,ASSETS:{},GLTimeline:T,GLConfig:{setData(){}},document:{querySelector:selector=>selector==='#roster-row'?roster:null}});
const source=fs.readFileSync(__dirname+'/table_app.js','utf8');
assert.match(source,/\binit\(\);\s*$/,'test must only omit the automatic page startup');
vm.runInContext(source.replace(/\binit\(\);\s*$/,'')+`
dirty=()=>{};
roster();
this.ui={plan:()=>JSON.parse(JSON.stringify(plan)),stats:currentStats,skillsHTML,memberGrowthHTML,memberGlossaryHTML};
`,context);
function change(slot,key,value){const input=inputs.find(e=>e.dataset.member===String(slot)&&e.dataset.key===key);input.value=String(value);input.onchange();return context.ui.plan().members[slot][key];}
const passiveCard=data.cards.find(c=>c.id==='C02_SSR_001');
assert.match(context.ui.skillsHTML(passiveCard,0),/3 星解锁，当前未生效/);
assert.match(context.ui.skillsHTML(passiveCard,3),/3 星已解锁/);
assert.match(context.ui.skillsHTML(passiveCard,0),/全体攻击<\/h3>|全体攻击<span>辅助动作/);
assert.ok(context.ui.memberGrowthHTML(passiveCard,3).includes(data.skills['C02_SSR_001S4'].description));
assert.match(context.ui.memberGrowthHTML(passiveCard,2),/生命 \+35%/);
assert.match(context.ui.memberGlossaryHTML(data.cards.find(c=>c.glossaryIds.includes('AddPinchSkill'))),/夹击/);
for(let slot=0;slot<4;slot++){
 for(const stars of [5,0,1,2,3,4,5,0]){
  assert.equal(change(slot,'imprint',stars),stars,'selected star count must survive the roster redraw');
  const select=roster.innerHTML.match(new RegExp('<select data-member="'+slot+'" data-key="imprint"[^>]*>(.*?)</select>'))[1];
  assert.match(select,new RegExp('<option value="'+stars+'" selected>'),'rendered selection must retain zero stars');
 }
 const member=context.ui.plan().members[slot],card=data.cards.find(c=>c.id===member.cardId);
 assert.equal(context.ui.stats(slot).Attack,T.baseStats(card,80,0).Attack,'zero-star preview must use zero-star stats');
 assert.equal(change(slot,'level',0),1,'level still has a minimum of one');
 assert.equal(change(slot,'level',80),80);
 assert.equal(change(slot,'mode','basic'),'basic','strategy selection must remain unchanged');
 assert.equal(change(slot,'imprint',-1),0);
 assert.equal(change(slot,'imprint',6),5);
 assert.equal(change(slot,'imprint','not-a-number'),0);
}
console.log('通过：四个位置的0～5星切换、重绘、0星面板、等级下限和行动策略。');
