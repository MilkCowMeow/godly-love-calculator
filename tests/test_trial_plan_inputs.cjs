'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {T,data}=require('./load_simulation.cjs');
const source=fs.readFileSync(__dirname+'/table_app.js','utf8');
const context=vm.createContext({DATA:data,ASSETS:{},GLTimeline:T,GLConfig:{setData(){}},GLCustomUI:{prepareImport:plan=>({plan,cards:new Map(data.cards.map(c=>[c.id,c]))}),commitImport(){}},document:{}});
vm.runInContext(source.replace(/\binit\(\);\s*$/,'')+`
controls=roster=targetPanel=dirty=()=>{};
this.initial=()=>JSON.parse(JSON.stringify(initialPlan()));
this.importPlan=raw=>{applyPlan(raw);return JSON.parse(JSON.stringify(plan));};
`,context);
const base=context.initial();assert.equal(base.trialFloor,50);
for(let floor=1;floor<=50;floor++){
 const saved=context.importPlan({...base,trialFloor:floor});
 assert.equal(saved.trialFloor,floor);
 assert.equal(context.importPlan(JSON.parse(JSON.stringify(saved))).trialFloor,floor);
 assert.equal(context.importPlan({...saved,target:'dummy'}).trialFloor,floor);
}
const legacy={...base};delete legacy.trialFloor;
assert.equal(context.importPlan(legacy).trialFloor,50);
for(const trialFloor of [0,51,3.5,'bad'])assert.throws(()=>context.importPlan({...base,trialFloor}),/试炼层数/);
console.log('通过：50层方案导入与JSON往返、人偶记忆层数、旧方案默认50及非法层数校验。');
