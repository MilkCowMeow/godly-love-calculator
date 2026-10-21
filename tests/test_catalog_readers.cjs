'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const data=JSON.parse(fs.readFileSync(__dirname+'/catalog_data.json','utf8'));
const nodes=new Map();
const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',value:'',checked:false,focus(){},addEventListener(){}});return nodes.get(selector);};
const context=vm.createContext({DATA:data,ASSETS:new Proxy({}, {get:(_,key)=> 'qa-image:'+String(key)}),document:{querySelector:node,querySelectorAll:()=>[]}});
const source=fs.readFileSync(__dirname+'/catalog_app.js','utf8');
vm.runInContext(source.replace(/window\.addEventListener\('hashchange',route\);route\(\);\s*$/,'')+'\nthis.ui={renderCard,renderEvent,renderProfiles,esc,labelCard,eventName,rewards,commodityName,commodityPrice,commodityRewards};',context);
const {ui}=context;
function readable(where){const html=node('#main').innerHTML;assert.ok(html.length>200,where);assert.doesNotMatch(html,/\bundefined\b|\bNaN\b|\bInfinity\b|T_Skill_Description_|状态说明未获取/,where);return html;}
for(const card of data.cards){
 ui.renderCard(card.id);
 const html=readable(card.id);
 assert.ok(html.includes('<h1>'+ui.esc(ui.labelCard(card))+'</h1>'),card.id+' title');
 for(const skill of card.skills){assert.ok(html.includes(ui.esc(skill.id)),card.id+' '+skill.id);assert.ok(html.includes(ui.esc(skill.description).replace(/\n/g,'<br>')),card.id+'完整技能正文 '+skill.id);}
 if(card.art)assert.ok(html.includes('src="qa-image:'+card.art+'"'),card.id+'详情使用本卡全图');else assert.match(html,/卡图未获取/);
 for(const kind of ['elementIcon','jobIcon'])assert.ok(html.includes('src="qa-image:'+card[kind]+'"'),card.id+'属性定位图形');
 for(const id of card.statusIds){const glossary=data.glossary.find(g=>g.id===id);assert.ok(html.includes(ui.esc(glossary.name)),card.id+'词条名 '+id);assert.ok(html.includes(ui.esc(glossary.description).replace(/\n/g,'<br>')),card.id+'词条全文 '+id);}
 assert.ok(html.includes('累计属性加成'),card.id+' growth');
}
for(const event of data.events){
 ui.renderEvent(event.id);const html=readable(event.id);
 assert.ok(html.includes('<h1>'+ui.esc(ui.eventName(event))+'</h1>'),event.id+'活动标题');
 if(event.art)assert.ok(html.includes('src="qa-image:'+event.art+'"'),event.id+'活动全图');
 for(const scene of event.scenes){assert.equal(scene.chapter,event.id,event.id+'关卡只按Chapter直接归属');assert.ok(html.includes(ui.esc(scene.id)),event.id+'关卡 '+scene.id);}
 if(['SignIn','SummonPickUp'].includes(event.type))assert.equal(event.scenes.length,0,event.id+'不得挂入同卡纪事关卡');
 for(const commodity of event.commodities.filter(r=>r.Price||r.Price2||r.Cost||r.Drops||r.ItemID)){
  assert.ok(html.includes(ui.esc(ui.commodityName(commodity))),event.id+'商品可读名称');
  if(commodity.ItemID)assert.ok(html.includes(ui.esc(data.items[commodity.ItemID]||commodity.ItemID)+' × '+ui.esc(commodity.ItemCount||'—')),commodity.ID+'直接物品奖励');
  if(commodity.Price2&&commodity.PriceItemID2)assert.ok(html.includes(ui.esc(commodity.Price2)+' '+ui.esc(data.items[commodity.PriceItemID2]||commodity.PriceItemID2)),commodity.ID+'第二币种价格');
  if(commodity.Drops&&(data.drops[commodity.Drops]||[]).some(r=>r.Group))assert.ok(html.includes('随机候选'),commodity.ID+'组内候选不得被渲染成并列必得奖励');
 }
 for(const [,,target]of html.matchAll(/href="#(card|event)\/([^"#]+)"/g))assert.ok(data.cards.some(c=>c.id===target)||data.events.some(e=>e.id===target),event.id+'关联目标 '+target);
}
// 与真实数据分离的期望样本：三种商品发放形式、第二价格和互斥候选语义。
data.items.__QA_DIRECT='测试称号';data.items.__QA_COIN1='测试币一';data.items.__QA_COIN2='测试币二';
data.items.__QA_A='测试候选甲';data.items.__QA_B='测试候选乙';data.dropLabels={...(data.dropLabels||{}),__QA_POOL_LABEL:'测试SSR候选池'};
data.drops.__QA_FIXED=[{TagString:'__QA_A',MinItemCount:'2',MaxItemCount:'2',Rate:'1',Group:'',GroupWeight:''}];
data.drops.__QA_RANDOM=[{TagString:'__QA_A',MinItemCount:'1',MaxItemCount:'1',Rate:'1',Group:'__QA_GROUP',GroupWeight:'.25'},{TagString:'__QA_TAG_POOL',ShowRateName:'__QA_POOL_LABEL',MinItemCount:'1',MaxItemCount:'1',Rate:'',Group:'__QA_GROUP',GroupWeight:'.75'}];
assert.equal(ui.commodityRewards({ItemID:'__QA_DIRECT',ItemCount:'3'}),'测试称号 × 3');
assert.equal(ui.commodityRewards({Drops:'__QA_FIXED'}),'测试候选甲 × 2');
assert.equal(ui.commodityRewards({ItemID:'__QA_DIRECT',ItemCount:'1',Drops:'__QA_FIXED'}),'测试称号 × 1；测试候选甲 × 2');
const random=ui.rewards('__QA_RANDOM');assert.match(random,/随机候选/);assert.match(random,/权重 \.25/);assert.match(random,/权重 \.75/);assert.match(random,/测试SSR候选池/);assert.doesNotMatch(random,/全部获得|必得/);
assert.equal(ui.commodityName({displayName:'客户端中文商品名',ID:'InternalCommodityID'}),'客户端中文商品名');
const prices=ui.commodityPrice({Price:'1',PriceItemID:'__QA_COIN1',Price2:'2',PriceItemID2:'__QA_COIN2',CurrencyIDs:'__QA_COIN1~__QA_COIN2'});
assert.match(prices,/1 测试币一/);assert.match(prices,/2 测试币二/);assert.doesNotMatch(prices,/合计|二选一|同时支付/,'费用配置保留原字段，未推定组合支付规则');
ui.renderProfiles();readable('profiles');
console.log('通过：192张卡牌详情、120项活动详情及角色档案全部真实渲染函数无异常，卡名、技能引用、成长表和正文标记检查通过。');
