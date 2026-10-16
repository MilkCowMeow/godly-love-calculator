(function(root){
'use strict';
let definitions=[],official=null,editing=null,contextSlot=null;
const STORAGE='godlylove-custom-characters-v1',THEME_STORAGE='godlylove-theme-v1';
const clone=x=>JSON.parse(JSON.stringify(x));
const fields={MaxHP:'最大生命',Attack:'攻击',Defence:'防御',Speed:'速度',CriticalRate:'暴击率 %',CriticalDamageRate:'暴击伤害 %',EffectHitRate:'效果命中 %',ResistanceRate:'效果抵抗 %',PinchRate:'协战概率 %',DodgeRate:'闪避率 %',HitRate:'命中修正 %'};
const targets={enemy:'敌方单体',allEnemies:'敌方全体',self:'自身',ally:'生命比例最低的队友',allAllies:'己方全体'};
const effectTypes={status:'附加状态',heal:'治疗',shield:'护盾',gauge:'行动条变化',cleanse:'净化负面状态',dispel:'驱散增益'};
const properties={Attack:'攻击',Defence:'防御',MaxHP:'最大生命',ValueOne:'固定数值'};
const conditions={always:'无附加条件',basic:'使用战技时',ultimate:'使用终结技时',critical:'暴击时',belowHP:'生命低于阈值',aboveHP:'生命高于阈值'};
function field(path,label,value,attributes=''){return `<label>${esc(label)}<input data-path="${path}" value="${esc(value)}" ${attributes}></label>`;}
function select(path,label,value,choices){return `<label>${esc(label)}<select data-path="${path}">${options(choices,value)}</select></label>`;}
function sync(next,persist=true){
 const normalized=next.map(d=>GLCustom.normalize(d,official));
 const data=GLCustom.withDefinitions(official,normalized);
 if(persist)try{localStorage.setItem(STORAGE,JSON.stringify(normalized));}catch{throw Error('浏览器未能保存角色，请检查存储空间或隐私设置。');}
 definitions=normalized;DATA.cards=data.cards;DATA.skills=data.skills;cards.clear();for(const c of DATA.cards)cards.set(c.id,c);GLConfig.setData(DATA);
 if($('#dataset-count'))$('#dataset-count').textContent=official.cards.length+' 张游戏卡牌 · '+Object.keys(official.skills).length+' 项原生技能'+(definitions.length?' · '+definitions.length+' 个自定义角色':'')+' · 离线可用';
}
function statusOptions(){return Object.fromEntries(Object.values(DATA.statuses).map(s=>[s.id,(s.name||s.id)+' · '+s.id]));}
function effectHTML(e,path,index){return `<fieldset class="custom-effect"><legend>附加效果 ${index+1}</legend><div class="custom-grid cols-3">${select(path+'.type','效果类型',e.type,effectTypes)}${select(path+'.target','目标',e.target,targets)}${field(path+'.rate','触发概率 %',e.rate,'type="number" min="0" max="100" step="any"')}${select(path+'.status','状态',e.status,statusOptions())}${field(path+'.rounds','持续回合',e.rounds,'type="number" min="1" max="99" step="1"')}${select(path+'.valueStat','效果值基准',e.valueStat,properties)}${field(path+'.value','效果值 / 比例 %',e.value,'type="number" min="-10000000" max="10000000" step="any"')}</div><p class="custom-hint">状态和护盾使用持续回合；固定数值按原值，其他基准按百分比。行动条填百分比，净化或驱散填整数数量。</p><button type="button" class="text-button custom-remove" data-remove-effect="${path}">移除此效果</button></fieldset>`;}
function skillHTML(s,index){const prefix='skills.'+index;return `<section class="custom-section"><div class="custom-section-head"><h3>${index?'终结技':'战技'}</h3><span>主动技能 / 0${index+1}</span></div><div class="custom-grid cols-3">${field(prefix+'.name','技能名称',s.name,'maxlength="60" required')}${select(prefix+'.target','技能目标',s.target,targets)}${select(prefix+'.damageStat','伤害基准',s.damageStat,{Attack:'攻击',Defence:'防御',MaxHP:'最大生命'})}${field(prefix+'.multiplier','伤害倍率 %',s.multiplier,'type="number" min="0" max="10000" step="any"')}${field(prefix+'.power','技能威力 %',s.power,'type="number" min="0" max="1000" step="any"')}${field(prefix+'.cooldown','冷却回合',s.cooldown,'type="number" min="0" max="99" step="1"')}${field(prefix+'.criticalBonus','额外暴击率 %',s.criticalBonus,'type="number" min="-100" max="100" step="any"')}${field(prefix+'.criticalDamageBonus','额外暴击伤害 %',s.criticalDamageBonus,'type="number" min="-1000" max="1000" step="any"')}${field(prefix+'.penetration','穿透 %',s.penetration,'type="number" min="0" max="100" step="any"')}</div><label class="custom-check"><input type="checkbox" data-path="${prefix}.initCooldown" ${s.initCooldown?'checked':''}>开场进入冷却</label>${s.effects.map((e,i)=>effectHTML(e,prefix+'.effects.'+i,i)).join('')}<button type="button" class="secondary" data-add-effect="${index}">＋ 添加附加效果</button></section>`;}
function readEditor(){for(const input of $$('#custom-form [data-path]')){const path=input.dataset.path.split('.');let object=editing;for(const key of path.slice(0,-1))object=object[key];object[path.at(-1)]=input.type==='checkbox'?input.checked:input.value;}return editing;}
function defaultEffect(){return {type:'status',target:'self',rate:100,rounds:2,status:'AddAttack',value:0,valueStat:'Attack'};}
function drawEditor(){
 $('#custom-editor-title').textContent=definitions.some(d=>d.id===editing.id)?'编辑自定义角色':'从零创建角色';
 $('#custom-form').innerHTML=`<section class="custom-section"><div class="custom-section-head"><h3>角色设定</h3><span>IDENTITY</span></div><div class="custom-grid cols-3">${field('name','角色名称',editing.name,'maxlength="40" required')}${select('element','属性',editing.element,els)}${select('job','定位',editing.job,jobs)}${field('baseLevel','基准等级',editing.baseLevel,'type="number" min="1" max="80" step="1"')}</div></section><section class="custom-section"><div class="custom-section-head"><h3>基础面板</h3><span>STATS</span></div><p class="custom-hint">以下面板对应基准等级、0 星。默认没有游戏角色的技能或成长加成。</p><div class="custom-grid cols-4">${Object.entries(GLCustom.STATS).map(([key,[min,max]])=>field('stats.'+key,fields[key],editing.stats[key],`type="number" min="${min}" max="${max}" step="any"`)).join('')}</div><details class="custom-growth"><summary>等级与升星成长</summary><p class="custom-hint">每级成长按“基准面板＋等级差×每级成长”计算；每星成长为累加百分比。全部为 0 时各等级、星数共用同一面板。</p><div class="custom-grid cols-4">${Object.keys(editing.growth).map(k=>field('growth.'+k,'每级'+fields[k]+'增加',editing.growth[k],'type="number" min="0" max="1000000" step="any"')).join('')}${Object.entries({HPRate:'每星生命 %',AttackRate:'每星攻击 %',DefenceRate:'每星防御 %'}).map(([k,label])=>field('starGrowth.'+k,label,editing.starGrowth[k],'type="number" min="0" max="1000" step="any"')).join('')}</div></details></section>${editing.skills.map(skillHTML).join('')}<section class="custom-section"><div class="custom-section-head"><h3>条件被动</h3><span>TRIGGERS</span></div><p class="custom-hint">可按战斗开始、自身行动、技能及受击等时点触发。状态行为沿用计算器已有的游戏状态定义。</p>${editing.passives.map((p,i)=>`<fieldset class="custom-passive"><legend>被动 ${i+1}</legend><div class="custom-grid cols-3">${select('passives.'+i+'.trigger','触发时点',p.trigger,GLCustom.TRIGGERS)}${select('passives.'+i+'.condition','附加条件',p.condition,conditions)}${field('passives.'+i+'.threshold','生命阈值 %',p.threshold,'type="number" min="0" max="100" step="any"')}</div>${effectHTML(p.effect,'passives.'+i+'.effect',0)}<button type="button" class="text-button" data-remove-passive="${i}">移除此被动</button></fieldset>`).join('')}<button type="button" class="secondary" id="add-passive">＋ 添加条件被动</button></section><p id="custom-error" class="custom-error" role="alert"></p><div class="custom-save-bar"><p>保存在当前浏览器；导出配队方案会携带所用角色。</p><button type="submit" class="primary">${contextSlot===null?'保存角色':'保存并上阵'}</button><button type="button" class="secondary" id="cancel-custom-editor">取消</button></div>`;
 for(const b of $$('[data-add-effect]'))b.onclick=()=>{readEditor();const s=editing.skills[Number(b.dataset.addEffect)];if(s.effects.length>=12){toast('每个技能最多 12 项效果');return;}s.effects.push(defaultEffect());drawEditor();};
 for(const b of $$('[data-remove-effect]'))b.onclick=()=>{readEditor();const path=b.dataset.removeEffect.split('.');if(path[0]==='passives'){editing.passives.splice(Number(path[1]),1);}else editing.skills[Number(path[1])].effects.splice(Number(path.at(-1)),1);drawEditor();};
 $('#add-passive').onclick=()=>{readEditor();if(editing.passives.length>=12){toast('最多 12 项条件被动');return;}editing.passives.push({trigger:'AfterSkill',condition:'always',threshold:50,effect:defaultEffect()});drawEditor();};
 for(const b of $$('[data-remove-passive]'))b.onclick=()=>{readEditor();editing.passives.splice(Number(b.dataset.removePassive),1);drawEditor();};
 $('#cancel-custom-editor').onclick=()=>$('#custom-editor').close();
 $('#custom-form').onsubmit=e=>{e.preventDefault();try{
  const d=GLCustom.normalize(readEditor(),official),next=definitions.filter(x=>x.id!==d.id);next.push(d);sync(next);
  if(contextSlot!==null){plan.members[contextSlot]={cardId:d.id,level:d.baseLevel,imprint:0,mode:'auto',overrides:{}};for(const row of Object.values(plan.actions))delete row[contextSlot];if($('#card-dialog').open)$('#card-dialog').close();}
  $('#custom-editor').close();roster();dirty();renderCardList();if($('#custom-library').open)drawLibrary();toast('自定义角色已保存'+(contextSlot===null?'':'并上阵'));
 }catch(error){$('#custom-error').textContent=error.message;$('#custom-error').scrollIntoView({block:'nearest'});}};
}
function openEditor(key=null,slot=null,duplicate=false){
 contextSlot=slot;const existing=key?definitions.find(d=>d.id===key):null;if(key&&!existing){toast('找不到该角色');return;}editing=existing?clone(existing):GLCustom.normalize({id:GLCustom.id(),name:'新角色'},official);
 if(!editing){toast('找不到该角色');return;}
 if(duplicate){editing.id=GLCustom.id();editing.name=editing.name.slice(0,36)+' 副本';}
 drawEditor();$('#custom-editor').showModal();
}
function drawLibrary(){
 $('#custom-library-list').innerHTML=definitions.length?definitions.map(d=>`<article class="custom-library-card"><span class="custom-avatar" aria-hidden="true">${esc(d.name.slice(0,1))}</span><div><h3>${esc(d.name)}</h3><p>${esc(els[d.element]+' · '+jobs[d.job])} · Lv.${d.baseLevel}</p><small>攻击 ${fmt(d.stats.Attack)} / 防御 ${fmt(d.stats.Defence)} / 速度 ${fmt(d.stats.Speed)}</small></div><div class="custom-library-actions"><button class="secondary" data-custom-edit="${d.id}">编辑</button><button class="text-button" data-custom-copy="${d.id}">复制</button><button class="text-button" data-custom-delete="${d.id}">删除</button></div></article>`).join(''):'<div class="custom-empty"><h3>从一张空白面板开始</h3><p>为假想角色、个人面板或配队实验，建立独立的角色配置。</p></div>';
 for(const b of $$('[data-custom-edit]'))b.onclick=()=>openEditor(b.dataset.customEdit);
 for(const b of $$('[data-custom-copy]'))b.onclick=()=>openEditor(b.dataset.customCopy,null,true);
 for(const b of $$('[data-custom-delete]'))b.onclick=()=>{const key=b.dataset.customDelete,d=definitions.find(d=>d.id===key);if(!confirm('删除自定义角色“'+d.name+'”？已导出的方案不受影响。'))return;try{sync(definitions.filter(d=>d.id!==key));for(const m of plan.members)if(m.cardId===key){m.cardId='';m.overrides={};}roster();dirty();drawLibrary();toast('角色已删除');}catch(e){toast(e.message);}};
}
function openLibrary(){drawLibrary();$('#custom-library').showModal();}
function snapshotPlan(){const used=new Set(plan.members.map(m=>m.cardId));return {...structuredClone(plan),customCharacters:clone(definitions.filter(d=>used.has(d.id)))};}
function prepareImport(raw){
 const next=clone(definitions),renamed=new Map(),incoming=raw.customCharacters??[];
 if(!Array.isArray(incoming)||incoming.length>50)throw Error('自定义角色库格式无效');
 const ids=new Set();for(const item of incoming){const d=GLCustom.normalize(item,official);if(ids.has(d.id))throw Error('方案含重复的自定义角色编号');ids.add(d.id);const existing=next.find(x=>x.id===d.id);if(existing&&JSON.stringify(existing)!==JSON.stringify(d)){const old=d.id;d.id=GLCustom.id();renamed.set(old,d.id);next.push(d);}else if(!existing)next.push(d);}
 const data=GLCustom.withDefinitions(official,next),adapted={...raw,members:raw.members.map(m=>({...m,cardId:renamed.get(m.cardId)||m.cardId}))};
 return {definitions:next,plan:adapted,cards:new Map(data.cards.map(c=>[c.id,c]))};
}
function initialize(){
 official={...DATA,cards:[...DATA.cards],skills:{...DATA.skills}};
 try{const raw=JSON.parse(localStorage.getItem(STORAGE)||'[]');sync(raw,false);}catch(e){sync([],false);toast('自定义角色读取失败：'+e.message);}
 const select=$('#theme-choice');let savedTheme='jade';try{savedTheme=localStorage.getItem(THEME_STORAGE)||'jade';}catch{}
 function theme(value,persist){if(!['jade','mist','plum','sand','midnight'].includes(value))value='jade';document.documentElement.dataset.theme=value;select.value=value;document.querySelector('meta[name="theme-color"]').content=getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();if(persist)try{localStorage.setItem(THEME_STORAGE,value);}catch{toast('此浏览器未能记住主题选择。');}}
 theme(savedTheme,false);select.onchange=()=>theme(select.value,true);
 $('#open-custom-library').onclick=openLibrary;$('#create-custom-role').onclick=()=>openEditor();$('#picker-create-custom').onclick=()=>openEditor(null,pickingSlot);
 for(const b of $$('[data-custom-close]'))b.onclick=()=>b.closest('dialog').close();
}
root.GLCustomUI={initialize,openEditor,openLibrary,snapshotPlan,prepareImport,commitImport:state=>sync(state.definitions)};
})(typeof globalThis!=='undefined'?globalThis:this);
