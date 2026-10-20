/* 本地客户端 014517 配置解释器，供伤害公式与连续战斗共享。 */
(function(root){
'use strict';
let DATA=null;
const clone=x=>JSON.parse(JSON.stringify(x));
const num=x=>x!==''&&x!==null&&x!==undefined&&Number.isFinite(Number(x))?Number(x):null;
const own=(o,k)=>o&&Object.prototype.hasOwnProperty.call(o,k);
function problem(ctx,message){(ctx._unsupported||(ctx._unsupported=[])).push(message);return null;}
function who(name,ctx){
 const key=name===undefined?'Source':name;
 const map={Source:'source',Target:'target',SelectTarget:ctx.nativeContext?'selectedTarget':'target',TriggerSource:'triggerSource',TriggerTarget:'triggerTarget',AuraSource:'auraSource'};
 if(!map[key])return problem(ctx,'未支持的对象选择：'+key);
 return ctx[map[key]]||(ctx.nativeContext?null:problem(ctx,'上下文缺少对象：'+key));
}
function statuses(r){return r&&r.statuses||[];}
function stType(s){const d=s.def||(DATA&&DATA.statuses[s.id])||{},raw=d.raw||d;return s.isBuff!==undefined?(s.isBuff?'Buff':'DeBuff'):raw.IsBuffType||'DeBuff';}
function stIsBuff(s){return stType(s)==='Buff';}
function stack(s,ctx){return s.stack===undefined?1:num(s.stack)===null?problem(ctx,'无效状态层数：'+s.id):num(s.stack);}
function group(s,ctx){const d=s.def||(DATA&&DATA.statuses[s.id]);if(own(s,'group'))return s.group;if(d)return (d.raw||d).Group||'';return problem(ctx,'缺少状态分组定义：'+s.id);}
function property(prop,r,ctx,id){
 if(ctx.resolveProperty){const v=ctx.resolveProperty(prop,r,id);if(v!==undefined)return v;}
 if(prop==='None'||!prop)return 0;
 if(prop==='ValueOne')return 1;
 const count=(buff)=>statuses(r).filter(s=>stType(s)===(buff?'Buff':'DeBuff')).length;
 const hp=r&&num(r.hpRate);
 const stat=r&&r.stats||{};
 const aliases={MaxHP:'MaxHP',HP:'HP',CriticalDamage:'CriticalDamageRate'};
 if(prop==='NowHPRate')return hp===null?problem(ctx,'缺少当前生命比例'):hp;
 if(prop==='LastHPRate')return hp===null?problem(ctx,'缺少已损生命比例'):100*(1-hp);
 if(prop==='NowHP')return own(r,'hp')?num(r.hp):hp!==null&&num(stat.MaxHP)!==null?hp*stat.MaxHP:problem(ctx,'缺少当前生命');
 if(prop==='LastHP')return own(r,'hp')&&num(stat.MaxHP)!==null?stat.MaxHP-r.hp:hp!==null&&num(stat.MaxHP)!==null?(1-hp)*stat.MaxHP:problem(ctx,'缺少已损生命');
 if(/^(DeBuffCount|DebuffCount)$/.test(prop))return own(r,'debuffCount')?num(r.debuffCount):count(false);
 if(prop==='BuffCount')return own(r,'buffCount')?num(r.buffCount):count(true);
 if(prop==='BuffCountByID')return statuses(r).filter(s=>s.id===id).length;
 if(prop==='BuffStack'){let xs=statuses(r).filter(s=>s.id===id).map(s=>stack(s,ctx));return xs.includes(null)?null:xs.reduce((a,v)=>a+v,0);}
 if(prop==='BuffGroupStack'){let total=0;for(const s of statuses(r)){const g=group(s,ctx);if(g===null)return null;if(g===id){const n=stack(s,ctx);if(n===null)return null;total+=n;}}return total;}
 if(prop==='BuffAllRoundByID')return statuses(r).filter(s=>s.id===id).reduce((a,s)=>a+(num(s.rounds)||0),0);
 if(prop==='BuffMinRoundByID'){const xs=statuses(r).filter(s=>s.id===id).map(s=>num(s.rounds));return xs.length?Math.min(...xs):0;}
 if(prop==='EnemyCount')return num(ctx.enemyCount)===null?problem(ctx,'缺少敌方人数'):num(ctx.enemyCount);
 if(prop==='AllyCount')return num(ctx.allyCount)===null?problem(ctx,'缺少己方人数'):num(ctx.allyCount);
 if(prop==='FewEnemyCount')return num(ctx.fewEnemyCount)===null?problem(ctx,'FewEnemyCount上限人数基准尚未验证，请手动输入'):num(ctx.fewEnemyCount);
 if(prop==='RoleNoPinch')return own(r,'noPinch')?(r.noPinch?1:0):problem(ctx,'缺少目标是否禁止夹击');
 if(prop==='Round')return num(ctx.round);
 if(own(r,prop))return num(r[prop]);
 if(own(stat,prop))return num(stat[prop]);
 if(prop==='Taunt'){if(!own(r,'statuses'))return problem(ctx,'缺少状态列表，无法判断嘲弄');let total=0;for(const s of statuses(r)){const p=nativeStatusProperties(s);if(p.unsupported.length)for(const m of p.unsupported)problem(ctx,m);total=Math.fround(total+(p.properties.Taunt||0));}return total;}
 if(aliases[prop]&&own(stat,aliases[prop]))return num(stat[aliases[prop]]);
 if(prop==='MaxHP'&&own(stat,'HP'))return num(stat.HP);
 return problem(ctx,'尚未提供或验证属性：'+prop+(id?' / '+id:''));
}
function compare(a,b,op,b2,ctx){
 if(a===null||b===null)return null;
 a=Math.fround(a);b=Math.fround(b);if(b2!==null)b2=Math.fround(b2);
 // SkillCondition.ValueCompare (014517 RVA 0x2340A70): Lt/Gt include equality; Ltn/Gtn are strict.
 switch(op||'Eq'){case'Eq':return a===b;case'Ne':return a!==b;case'Lt':return a<=b;case'Gt':return a>=b;case'Ltn':return a<b;case'Gtn':return a>b;case'Between':return b2===null?problem(ctx,'Between缺少Value2'):a>=Math.min(b,b2)&&a<=Math.max(b,b2);default:return problem(ctx,'未知比较类型：'+op);}
}
function all(vals){return vals.includes(false)?false:vals.includes(null)?null:true;}
function checkFun(c,ctx,r){
 if(ctx.nativeConditionCheck){const v=ctx.nativeConditionCheck(c,r);if(v!==undefined)return v;}
 const id=c.CheckID, s=ctx.skill||{},raw=s.raw||{};
 switch(c.CheckFun||'None'){
 case'None':return true;
 case'IsMainRound':return own(ctx,'mainRound')?!!ctx.mainRound:problem(ctx,'缺少主回合标记');
 case'IsNotMainRound':return own(ctx,'mainRound')?!ctx.mainRound:problem(ctx,'缺少主回合标记');
 case'IsNormalSkill':return own(s,'normal')?s.normal:/S1$/.test(s.id||'')?true:problem(ctx,'缺少原生普攻标记');
 case'IsDamageSkill':return own(raw,'AttRate')?Number(raw.AttRate||0)>0:own(s,'damage')?s.damage:problem(ctx,'缺少技能伤害类型');
 case'IsNoDamageSkill':{let v=checkFun({CheckFun:'IsDamageSkill'},ctx,r);return v===null?null:!v;}
 case'SkillID':return c.CheckIDs?c.CheckIDs.includes(s.id):s.id===id;
 case'FunID':return own(ctx,'funId')?ctx.funId===id:problem(ctx,'缺少效果ID');
 case'HaveBuff':return statuses(r).some(x=>x.id===id||(c.CheckIDs||[]).includes(x.id));
 case'NoBuff':return !statuses(r).some(x=>x.id===id);
 case'HasAnyBuff':return statuses(r).length>0;
 case'CheckSkillCooldown':return own(ctx.skillCooldowns,id)?num(ctx.skillCooldowns[id])<=0:problem(ctx,'缺少技能冷却：'+id);
 // BattleRoleData.CheckSkillNoUse (RVA 0x2346754) checks GetNowSkillCoolDown(id) > 0.
 case'CheckSkillNoUse':return own(ctx.skillCooldowns,id)?num(ctx.skillCooldowns[id])>0:problem(ctx,'缺少技能冷却：'+id);
 case'IsPinch':return own(ctx,'pinch')?!!ctx.pinch:problem(ctx,'缺少夹击标记');
 case'IsSkillNoPinch':return own(s,'noPinch')?!!s.noPinch:problem(ctx,'缺少技能禁止夹击标记');
 case'IsCounter':return own(ctx,'counter')?!!ctx.counter:problem(ctx,'缺少反击标记');
 case'IsAddition':return own(ctx,'addition')?!!ctx.addition:problem(ctx,'缺少追加技能标记');
 case'IsCriticalHit':return own(ctx,'critical')?!!ctx.critical:problem(ctx,'缺少暴击标记');
 case'TargetIsAll':return (s.targetType||raw.TargetType)==='All';
 case'TargetIsOne':return !['All','RandomTwo'].includes(s.targetType||raw.TargetType||'One');
 case'IsNoSelf':return own(ctx,'sameUnit')?!ctx.sameUnit:ctx.source!==ctx.target;
 case'IsSelf':return own(ctx,'sameUnit')?!!ctx.sameUnit:ctx.source===ctx.target;
 case'IsSameCamp':case'IsDiffCamp':{
  const same=own(ctx,'sameCamp')?ctx.sameCamp:ctx.source&&ctx.target&&own(ctx.source,'camp')&&own(ctx.target,'camp')?ctx.source.camp===ctx.target.camp:null;
  return same===null?problem(ctx,'缺少阵营关系'):c.CheckFun==='IsSameCamp'?same:!same;
 }
 case'MainActionType':return own(ctx,'mainActionType')?ctx.mainActionType===id:problem(ctx,'缺少主行动类型');
 case'Position':return own(r,'campPosition')?String(r.campPosition)===String(id):own(r,'position')?String(r.position)===String(id):problem(ctx,'缺少原生阵营位置campPosition（从0起）');
 case'AnyAllyHaveBuff':case'AnyEnemyHaveBuff':{
  const list=ctx[c.CheckFun==='AnyAllyHaveBuff'?'allies':'enemies'];return list?list.some(x=>statuses(x).some(z=>z.id===id)):problem(ctx,'缺少全队状态');
 }
 default:return problem(ctx,'未实现条件函数：'+c.CheckFun);
 }
}
function selectConditionRoles(c,ctx){
 if(c.TargetInfo&&ctx.resolveConditionRoles)return ctx.resolveConditionRoles(c);
 if(!c.TargetInfo)return [who(c.Who,ctx)];
 const t=c.TargetInfo;
 if(t.TargetType==='SkillDirectTargets')return ctx.directTargets||problem(ctx,'缺少技能直接目标列表');
 if(t.TargetType==='All')return ctx[t.TargetCamp==='My'?'allies':'enemies']||problem(ctx,'缺少全阵营条件对象');
 if(t.TargetType==='Self')return [ctx.source];
 return problem(ctx,'未支持条件对象范围：'+t.TargetType);
}
function _condition(c,ctx){
 if(!c)return true;
 const rs=selectConditionRoles(c,ctx);if(!rs)return null;
 let checks=rs.map(r=>{
  if(!r){if(!ctx.nativeContext)return null;if(c.Property)return false;return checkFun(c,ctx,r);}
  let out=[checkFun(c,ctx,r)];
  if(c.Property){const v=property(c.Property,r,ctx,c.CheckID);const b=c.ComparedValue?_convert(c.ComparedValue,ctx):num(c.Value===undefined?0:c.Value);out.push(compare(v,b,c.Comparer,num(c.Value2),ctx));}
  return all(out);
 });
 let v=c.IsAllWhoPass?all(checks):checks.includes(true)?true:checks.includes(null)?null:false;
 if(c.Conditions)v=all([v,...c.Conditions.map(x=>_condition(x,ctx))]);
 if(c.NextCondition)v=all([v,_condition(c.NextCondition,ctx)]);
 return c.Invert&&v!==null?!v:v;
}
function evaluateCondition(c,ctx={}){const q={...ctx,_unsupported:[]};return {pass:_condition(c,q),unsupported:[...new Set(q._unsupported)]};}
const VC_KEYS=new Set('Who TargetInfo Rate ExtraRatePlus AddRandom Property Base PropertyID Class MustPositive MaxValue MaxValueConvert FinalMaxValue FinalMaxValueConvert FinalMinValue ValueConvert ExtraRate Condition Conditions ConditionRates'.split(' '));
function _convert(vc,ctx,defaultValue=0){
 if(!vc)return defaultValue;
 if(typeof vc==='number')return vc;
 for(const k of Object.keys(vc))if(!VC_KEYS.has(k))problem(ctx,'转换器未知字段：'+k);
 if(Object.keys(vc).some(k=>!VC_KEYS.has(k)))return null;
 const r=who(vc.Who,ctx);if(!r)return ctx.nativeContext?0:null;
 const cond=all([_condition(vc.Condition,ctx),...(vc.Conditions||[]).map(c=>_condition(c,ctx))]);if(cond===null)return null;
 let v=cond?property(vc.Property||'None',r,ctx,vc.PropertyID):0;
 if(v===null)return null;
 let cap=vc.MaxValueConvert?_convert(vc.MaxValueConvert,ctx):num(vc.MaxValue===undefined?9999999:vc.MaxValue);
 if(cap===null)return null;
 v=v>0?Math.min(v,cap):v<0?Math.max(v,-Math.abs(cap)):0;
 let rate=num(vc.Rate===undefined?0:vc.Rate);
 for(const cr of vc.ConditionRates||[]){let b=_condition(cr.Condition,ctx);if(b===null)return null;if(b)rate=num(cr.Rate);}
 let extra=vc.ExtraRate?_convert(vc.ExtraRate,ctx):1,nested=vc.ValueConvert?_convert(vc.ValueConvert,ctx):0;
 if(rate===null||extra===null||nested===null)return null;
 let out=Math.fround(Math.fround(Math.fround(Math.fround(v)*Math.fround(rate))*Math.fround(Math.fround(extra)+Math.fround(num(vc.ExtraRatePlus)||0)))+Math.fround(num(vc.Base)||0));
 out=Math.fround(out+Math.fround(nested));
 if(num(vc.AddRandom)){if(!own(ctx,'randomUnit'))return problem(ctx,'随机转换器需randomUnit明确取样');const randomValue=Math.fround(Math.fround(ctx.randomUnit)*Math.fround(num(vc.AddRandom)));out=Math.fround(out+randomValue);}
 const fin=vc.FinalMaxValueConvert?_convert(vc.FinalMaxValueConvert,ctx):num(vc.FinalMaxValue===undefined?9999999:vc.FinalMaxValue);
 if(fin===null)return null;
 if(out>0)out=Math.max(Math.min(out,fin),num(vc.FinalMinValue)||0);
 else if(out<0)out=vc.MustPositive?0:Math.max(out,-Math.abs(fin));
 return Math.fround(out);
}
function convert(vc,ctx={},defaultValue=0){const q={...ctx,_unsupported:[]};let value=_convert(vc,q,defaultValue);return {value,unsupported:[...new Set(q._unsupported)]};}
function correctedFunction(value,origin,field){
 const v=clone(value);
 // User-approved correction of one malformed 014517 row. Keep the source data intact.
 // Native dispatch and APK evidence: evidence/random_add_status_audit.md.
 if(DATA?.version==='1.0.1.014517'&&!DATA.statuses?.RandomAddStatus&&origin==='C03_SSR_012S1'&&field==='DynamicField1'&&
    Object.keys(v).length===5&&v.Fun==='AddStatus'&&v.FID==='RandomAddStatus'&&v.Rate===.75&&v.StatusRound===1&&
    Array.isArray(v.FIDs)&&v.FIDs.join('~')==='Silence~Unhealable~ReduceAttack~ReduceDef'){
  v.Fun='RandomAddStatus';delete v.FID;
 }
 return v;
}
function invalidNativeFunction(value){
 if(Array.isArray(value))return value.some(invalidNativeFunction);
 if(!value||typeof value!=='object')return false;
 // EFunction has no ForceConquer member. Native JSON loading catches the enum
 // deserialization error and discards this entire DynamicField, including nested effects.
 if(value.Fun==='ForceConquer')return true;
 return Object.values(value).some(invalidNativeFunction);
}
function configFunctions(configs,origin){const out=[];for(const c of configs||[]){if(c.key==='Fun'&&typeof c.value==='object'){if(invalidNativeFunction(c.value))continue;let v=correctedFunction(c.value,origin,c.field);v._origin=origin;v._field=c.field;out.push(v);}else out.push({_property:c.key,_value:c.value,_origin:origin,_field:c.field});}return out;}
function normSkill(x){return x&&x.row&&!x.raw?{...x,raw:x.row}:x;}
function resolveSkill(card,skillId,options={}){
 let skill=DATA&&DATA.skills[skillId]||(card.skills||[]).find(x=>typeof x==='object'&&x.id===skillId);skill=normSkill(skill);
 const unsupported=[];if(!skill)return {raw:{},functions:[],unsupported:['找不到技能 '+skillId]};
 if(options.ascend)unsupported.push('RoleAscend表未被当前原生客户端加载；所选预置强化仅供配置研究');
 let funcs=configFunctions((skill.configs||[]).filter(c=>!c.field||!c.field.startsWith('PassiveProp.')),skillId),passiveFunctions=[],patches=[];
 for(const cfg of (card.configs||[]))funcs.push(...configFunctions([cfg],card.id));
 for(const kind of ['imprint','ascend'])for(const row of card[kind]||[]){
  if(Number(row.LV)>Number(options[kind]||0))continue;
  const cs=row.configs||row.patches&&row.patches.map((v,i)=>({key:'Fun',value:v,field:'patch'+i}))||[];
  for(const f of configFunctions(cs,kind+' '+row.LV))patches.push(f);
 }
 for(const patch of patches){
  if(!patch.ID){funcs.push(patch);continue;}
  const index=funcs.findIndex(f=>f.ID===patch.ID);
  if(index<0){unsupported.push('强化补丁 '+patch.ID+' 的原生默认ID尚未匹配，未擅自叠加');continue;}
  const old=funcs[index];if(Number(patch.LV||patch.Lv||0)>=Number(old.LV||old.Lv||0))funcs[index]=patch;
 }
 for(const sid of card.skills||[]){const id=typeof sid==='string'?sid:sid.id;const ps=normSkill(DATA&&DATA.skills[id]||typeof sid==='object'&&sid);
  if(!ps)continue;
  const gates=(card.imprint||[]).filter(x=>(x.EnhanceSkill||'').split('~').includes(id));
  const unlocked=!gates.length||gates.some(x=>Number(options.imprint||0)>=Number(x.LV));
  if(unlocked){
   const cs=ps.raw.SkillType==='Passive'&&id!==skillId?ps.configs:(ps.configs||[]).filter(c=>c.field&&c.field.startsWith('PassiveProp.'));
   passiveFunctions.push(...configFunctions(cs,id));
  }
 }
 return {id:skillId,raw:clone(skill.raw),functions:funcs,passiveFunctions,patches,unsupported};
}
const CONVERSIONS=['ConstAttack','AttRate','EffectHit','HurtReduction','DefenceRate','SourceDamageRate','BuffAttackRate','MaxSkillDamage','PenetrateRate','Penetrate2Rate','Penetrate3Rate'];
function analyzeFunctions(functions,ctx={}){
 const q={...ctx,_unsupported:[]},out={sums:{},valueLists:{},conditionClasses:{},properties:{},lists:{},immuneList:[],effects:[],unsupported:[]};
 for(const f of functions||[]){
  if(f._property){const n=num(f._value);if(n===null){out.lists[f._property]=[...new Set([...(out.lists[f._property]||[]),...String(f._value).split('~').filter(Boolean)])];if(f._property==='AntiList')out.immuneList=[...new Set([...out.immuneList,...out.lists[f._property]])];else problem(q,'静态属性未数值化：'+f._property);}else out.properties[f._property]=(out.properties[f._property]||0)+n;continue;}
  const pass=all([_condition(f.PreCond,q),_condition(f.Condition,q),...(f.Conditions||[]).map(c=>_condition(c,q))]);
  const trigger=f.Trigger||'AfterSkill';
  const applicable=['AfterSkill','SkillProperty','Property'].includes(trigger)||ctx.trigger===trigger;
  const rec={origin:f._origin,field:f._field,id:f.ID||'',fun:f.Fun||'No',trigger,pass,applicable,raw:f,values:{}};
  if(pass===null)rec.note='缺少上下文或未验证条件，未纳入数值';
  if(pass===true&&applicable){
   for(const k of CONVERSIONS)if(f[k]){const val=_convert(f[k],q);rec.values[k]=val;(out.valueLists[k]||(out.valueLists[k]=[])).push(val);if(val!==null&&k!=='HurtReduction')out.sums[k]=Math.fround((out.sums[k]||0)+val);}
   if(f.ConditionAttack){let v=_convert(f.ConditionAttack,q);rec.values.ConditionAttack=v;if(v!==null){let key=f.ConditionAttack.Class||'';out.conditionClasses[key]=Math.fround((out.conditionClasses[key]||0)+v);}}
   if(f.Property&&(trigger==='Property'||trigger==='SkillProperty')){let v=f.ValueConvert?_convert(f.ValueConvert,q):num(f.Value||0);rec.values[f.Property]=v;if(v!==null)out.properties[f.Property]=(out.properties[f.Property]||0)+v;}
   if(f.ValueConvert)rec.values.Value=_convert(f.ValueConvert,q);
   if(f.StatusValue)rec.values.StatusValue=_convert(f.StatusValue,q);
   if(f.RateConvert)rec.values.Rate=_convert(f.RateConvert,q);
  }
  out.effects.push(rec);
 }
 out.conditionMultiplier=Object.values(out.conditionClasses).reduce((a,v)=>Math.fround(a*Math.fround(1+v)),1);
 out.unsupported=[...new Set(q._unsupported)];return out;
}
function nativeStatusProperties(instance){
 const def=instance.def||(DATA&&DATA.statuses[instance.id]);
 if(!def)return {properties:{},functions:[],flags:{},unsupported:['缺少状态定义：'+instance.id]};
 const raw=def.raw||def,truth=(k,d=false)=>raw[k]===''||raw[k]===undefined?d:raw[k]===true||raw[k]==='TRUE';
 let scale=1;
 if(truth('IsMergeProperty')){if(truth('IsStackMultiplyProp',true))scale=num(instance.stack===undefined?1:instance.stack);if(truth('IsValueMultiplyProp'))scale*=num(instance.value===undefined?raw.Value||0:instance.value);}
 const properties={},functions=[],lists={};const unsupported=[];
 for(const c of def.configs||[]){if(c.key==='Fun'){if(invalidNativeFunction(c.value))continue;functions.push({...clone(c.value),_origin:instance.id,_status:instance});continue;}const n=num(c.value);if(n===null){lists[c.key]=String(c.value).split('~').filter(Boolean);if(c.key!=='AntiList')unsupported.push('状态字符串属性尚未解释：'+c.key);continue;}properties[c.key]=(properties[c.key]||0)+Math.fround(n*scale);}
 const flags={shield:!!properties.Shield,noDamage:!!properties.NoDamage,immune:!!properties.Immune,invincible:!!properties.Invincible,immortal:!!properties.Immortal,sealHeal:!!properties.SealHeal,sealBuff:!!properties.SealBuff};
 return {id:instance.id,properties,functions,lists,immuneList:lists.AntiList||[],flags,scale,isBuff:stType({...instance,def})==='Buff',isDebuff:stType({...instance,def})==='DeBuff',unsupported};
}
const API={setData(data){DATA=data;return API;},resolveSkill,evaluateCondition,convert,analyzeFunctions,configFunctions,nativeStatusProperties};
root.GLConfig=API;if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof globalThis!=='undefined'?globalThis:this);
