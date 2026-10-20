/* Independent, validated custom characters. Definitions contain data only, never code. */
(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const ELEMENTS=['None','Fire','Ice','Earth','Ground','Light','Dark'];
const JOBS=['Defender','Warrior','Medic','Vanguard'];
const STATS={MaxHP:[1,1e9,10000],Attack:[0,1e7,0],Defence:[0,1e7,0],Speed:[1,1e5,2000],CriticalRate:[0,100,0],CriticalDamageRate:[0,1000,150],EffectHitRate:[0,1000,0],ResistanceRate:[0,100,0],PinchRate:[0,100,0],DodgeRate:[0,100,0],HitRate:[0,100,0]};
const PERCENT=new Set(['CriticalRate','CriticalDamageRate','EffectHitRate','ResistanceRate','PinchRate','DodgeRate','HitRate']);
const TARGETS={enemy:['Enemy','One'],allEnemies:['Enemy','All'],self:['My','Self'],ally:['My','LessHPRate'],allAllies:['My','All']};
const TRIGGERS={StartBattle:'战斗开始',BeforeRound:'自身行动前',AfterRound:'自身行动后',AfterSkill:'自身技能后',TargetAfterSkill:'受到技能后'};
const TYPES=['status','heal','shield','gauge','cleanse','dispel'];
function number(v,min,max,fallback,label){const n=v===undefined||v===''?fallback:Number(v);if(!Number.isFinite(n)||n<min||n>max)throw Error((label||'数值')+'须在 '+min+'～'+max+' 之间');return n;}
function choice(v,choices,fallback,label){const n=v??fallback;if(!choices.includes(n))throw Error((label||'选项')+'无效');return n;}
function text(v,fallback,max=60){const s=String(v??fallback).trim();if(!s||s.length>max)throw Error('名称不能为空，且不能超过 '+max+' 个字符');return s;}
function id(){return 'CUSTOM_'+(root.crypto?.randomUUID?.()||Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)).replace(/-/g,'');}
function effect(raw={},data){
 const e={type:choice(raw.type,TYPES,'status','效果类型'),target:choice(raw.target,Object.keys(TARGETS),'enemy','效果目标'),rate:number(raw.rate,0,100,100,'触发概率'),rounds:Math.trunc(number(raw.rounds,1,99,2,'状态回合')),value:number(raw.value,-1e7,1e7,0,'效果值'),valueStat:choice(raw.valueStat,['Attack','Defence','MaxHP','ValueOne'],'Attack','效果基准'),status:String(raw.status||'AddAttack')};
 if(e.type==='status'&&!Object.prototype.hasOwnProperty.call(data.statuses,e.status))throw Error('未知状态：'+e.status);
 if(['heal','shield'].includes(e.type)&&e.value<0)throw Error('治疗与护盾数值不能为负');
 if(e.type==='gauge'&&Math.abs(e.value)>100)throw Error('行动条变化须在 -100%～100% 之间');
 if(['cleanse','dispel'].includes(e.type)&&(e.value<1||e.value>99||e.value%1))throw Error('驱散/净化数量须为 1～99 的整数');
 return e;
}
function skill(raw={},index,data){
 const effects=raw.effects??[];if(!Array.isArray(effects)||effects.length>12)throw Error('每个技能最多 12 项附加效果');
 return {name:text(raw.name,index?'终结技':'战技'),damageStat:choice(raw.damageStat,['Attack','Defence','MaxHP'],'Attack','伤害基准'),multiplier:number(raw.multiplier,0,10000,index?150:100,'伤害倍率'),power:number(raw.power,0,1000,100,'技能威力'),target:choice(raw.target,['enemy','allEnemies','self','ally','allAllies'],'enemy','技能目标'),cooldown:Math.trunc(number(raw.cooldown,0,99,index?4:1,'技能冷却')),initCooldown:!!raw.initCooldown,criticalBonus:number(raw.criticalBonus,-100,100,0,'额外暴击率'),criticalDamageBonus:number(raw.criticalDamageBonus,-1000,1000,0,'额外暴伤'),penetration:number(raw.penetration,0,100,0,'穿透'),effects:effects.map(e=>effect(e,data))};
}
function normalize(raw,data){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('自定义角色格式无效');
 const key=raw.id||id();if(!/^CUSTOM_[A-Za-z0-9_]{1,70}$/.test(key))throw Error('自定义角色编号无效');
 const out={version:1,id:key,name:text(raw.name,'新角色',40),element:choice(raw.element,ELEMENTS,'None','属性'),job:choice(raw.job,JOBS,'Warrior','定位'),baseLevel:Math.trunc(number(raw.baseLevel,1,80,80,'基准等级')),stats:{},growth:{},starGrowth:{},skills:[],passives:[]};
 for(const [key,[min,max,fallback]]of Object.entries(STATS))out.stats[key]=number(raw.stats?.[key],min,max,fallback,key);
 for(const key of ['MaxHP','Attack','Defence','Speed'])out.growth[key]=number(raw.growth?.[key],0,1e6,0,'每级成长');
 for(const key of ['HPRate','AttackRate','DefenceRate'])out.starGrowth[key]=number(raw.starGrowth?.[key],0,1000,0,'每星成长');
 if(raw.skills!==undefined&&(!Array.isArray(raw.skills)||raw.skills.length!==2))throw Error('须配置战技与终结技两项技能');
 out.skills=[skill(raw.skills?.[0],0,data),skill(raw.skills?.[1],1,data)];
 if(raw.passives!==undefined&&(!Array.isArray(raw.passives)||raw.passives.length>12))throw Error('最多 12 项条件被动');
 out.passives=(raw.passives||[]).map(p=>({trigger:choice(p.trigger,Object.keys(TRIGGERS),'AfterSkill','被动触发时点'),condition:choice(p.condition,['always','basic','ultimate','critical','belowHP','aboveHP'],'always','被动条件'),threshold:number(p.threshold,0,100,50,'生命阈值'),effect:effect(p.effect,data)}));
 return out;
}
function effectFunction(e){
 const [TargetCamp,Target]=TARGETS[e.target],f={Rate:e.rate/100,TargetCamp,Target};
 const value={Property:e.valueStat,Who:'Source',Rate:e.value/(e.valueStat==='ValueOne'?1:100)};
 if(e.type==='status')Object.assign(f,{Fun:'AddStatus',FID:e.status,StatusRound:e.rounds,StatusValue:value});
 if(e.type==='heal')Object.assign(f,{Fun:'AddHP',ValueConvert:value});
 if(e.type==='shield')Object.assign(f,{Fun:'AddStatus',FID:'Shield',StatusRound:e.rounds,StatusValue:value});
 if(e.type==='gauge')Object.assign(f,{Fun:'AddTime',Value:e.value/100});
 if(e.type==='cleanse')Object.assign(f,{Fun:'RemoveDeBuf',Value:e.value});
 if(e.type==='dispel')Object.assign(f,{Fun:'RemoveBuf',Value:e.value});
 return f;
}
function compile(definition,data){
 const d=normalize(definition,data),slots=[d.id+'S1',d.id+'S2'],skills={};
 const label={Attack:'攻击',Defence:'防御',MaxHP:'最大生命'};
 d.skills.forEach((s,index)=>{
  const configs=s.effects.map((e,i)=>({key:'Fun',field:'CustomEffect'+i,value:effectFunction(e)}));
  for(const [prop,value]of [['CriticalRate',s.criticalBonus],['CriticalDamageRate',s.criticalDamageBonus]])if(value)configs.push({key:'Fun',field:prop,value:{Trigger:'SkillProperty',Property:prop,Value:value/100}});
  if(s.penetration)configs.push({key:'Fun',field:'Penetrate',value:{PenetrateRate:{Property:'ValueOne',Rate:s.penetration/100}}});
  const sid=slots[index];skills[sid]={id:sid,name:s.name,description:`以${label[s.damageStat]} × ${s.multiplier}% 计算伤害；技能威力 ${s.power}%；冷却 ${s.cooldown}。${s.effects.length?'含 '+s.effects.length+' 项自定义附加效果。':''}`,customDamageStat:s.damageStat,raw:{ID:sid,SkillType:'',AttRate:String(s.multiplier/100),Pow:String(s.power/100),TargetCamp:TARGETS[s.target][0],TargetType:TARGETS[s.target][1],CoolDown:String(s.cooldown),IsInitCoolDown:s.initCooldown?'TRUE':'FALSE'},configs};
 });
 const passiveConfigs=d.passives.map((p,i)=>{
  const value={...effectFunction(p.effect),Trigger:p.trigger};
  if(['basic','ultimate'].includes(p.condition))value.Condition={CheckFun:'SkillID',CheckID:slots[p.condition==='basic'?0:1]};
  if(p.condition==='critical')value.Condition={CheckFun:'IsCriticalHit'};
  if(['belowHP','aboveHP'].includes(p.condition))value.Condition={Who:'Source',Property:'NowHPRate',Comparer:p.condition==='belowHP'?'Ltn':'Gtn',Value:p.threshold/100};
  return {key:'Fun',field:'CustomPassive'+i,value};
 });
 const passiveID=d.id+'P1';if(passiveConfigs.length)skills[passiveID]={id:passiveID,name:'条件被动',description:d.passives.map(p=>TRIGGERS[p.trigger]+' · '+({always:'无附加条件',basic:'使用战技',ultimate:'使用终结技',critical:'暴击时',belowHP:'生命低于 '+p.threshold+'%',aboveHP:'生命高于 '+p.threshold+'%'}[p.condition])).join('\n'),raw:{SkillType:'Passive',CoolDown:'0'},configs:passiveConfigs};
 const levelStats=Array.from({length:80},(_,index)=>{
  const level=index+1,stats={...d.stats};for(const k of PERCENT)stats[k]/=100;
  for(const [k,rate]of Object.entries(d.growth))stats[k]=Math.max(k==='MaxHP'||k==='Speed'?1:0,stats[k]+(level-d.baseLevel)*rate);
  stats.HP=stats.MaxHP;return {level,stats};
 });
 const imprint=Array.from({length:5},(_,i)=>({LV:i+1,HPRate:d.starGrowth.HPRate/100,AttackRate:d.starGrowth.AttackRate/100,DefenceRate:d.starGrowth.DefenceRate/100}));
 const card={id:d.id,name:d.name,pair:'自定义角色',rarity:'自定义',element:d.element,job:d.job,thumb:'',custom:true,customDefinition:d,levelStats,imprint,configs:[],skills:[...slots,...(passiveConfigs.length?[passiveID]:[])],skillSlots:slots,ai:[],raw:{}};
 return {card,skills,definition:d};
}
function withDefinitions(base,definitions){
 if(!Array.isArray(definitions)||definitions.length>50)throw Error('最多保存 50 个自定义角色');
 const ids=new Set(),out={...base,cards:base.cards.filter(c=>!c.custom),skills:Object.fromEntries(Object.entries(base.skills).filter(([k])=>!k.startsWith('CUSTOM_')))};
 for(const raw of definitions){const built=compile(raw,out);if(ids.has(built.card.id))throw Error('自定义角色编号重复');ids.add(built.card.id);out.cards.push(built.card);Object.assign(out.skills,built.skills);}
 return out;
}
function install(Simulation){
 const previous=Simulation.prototype.hitParams;
 Simulation.prototype.hitParams=function(source,target,action){const params=previous.call(this,source,target,action);if(source.card.custom&&action.skill.customDamageStat)params.attack=source.stats[action.skill.customDamageStat];return params;};
}
const api={id,normalize,compile,withDefinitions,install,STATS,TARGETS,TRIGGERS};root.GLCustom=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
