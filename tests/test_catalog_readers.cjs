'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const data=JSON.parse(fs.readFileSync(__dirname+'/catalog_data.json','utf8'));
const nodes=new Map();
const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',value:'',checked:false,focus(){},addEventListener(){}});return nodes.get(selector);};
const context=vm.createContext({DATA:data,ASSETS:new Proxy({}, {get:()=> 'qa-image'}),document:{querySelector:node,querySelectorAll:()=>[]}});
const source=fs.readFileSync(__dirname+'/catalog_app.js','utf8');
vm.runInContext(source.replace(/window\.addEventListener\('hashchange',route\);route\(\);\s*$/,'')+'\nthis.ui={renderCard,renderEvent,renderProfiles,esc,labelCard};',context);
const {ui}=context;
function readable(where){const html=node('#main').innerHTML;assert.ok(html.length>200,where);assert.doesNotMatch(html,/\bundefined\b|\bNaN\b|\bInfinity\b|T_Skill_Description_|状态说明未获取/,where);return html;}
for(const card of data.cards){
 ui.renderCard(card.id);
 const html=readable(card.id);
 assert.ok(html.includes('<h1>'+ui.esc(ui.labelCard(card))+'</h1>'),card.id+' title');
 for(const skill of card.skills)assert.ok(html.includes(ui.esc(skill.id)),card.id+' '+skill.id);
 assert.ok(html.includes('累计属性加成'),card.id+' growth');
}
for(const event of data.events){ui.renderEvent(event.id);readable(event.id);}
ui.renderProfiles();readable('profiles');
console.log('通过：192张卡牌详情、120项活动详情及角色档案全部真实渲染函数无异常，卡名、技能引用、成长表和正文标记检查通过。');
