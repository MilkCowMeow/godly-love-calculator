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
function isDamageHit(skill){
 const raw=skill?.raw||skill?.row||skill||{},camp=raw.TargetCamp===undefined||raw.TargetCamp===null||raw.TargetCamp===''?'Enemy':raw.TargetCamp;
 // SkillStaticData.get_IsDamageHit RVA 0x235E838: Enemy target camp and nonzero float AttRate.
 return ['Enemy',2,'2'].includes(camp)&&Math.fround(num(raw.AttRate)||0)!==0;
}
function checkFun(c,ctx,r){
 if(ctx.nativeConditionCheck){const v=ctx.nativeConditionCheck(c,r);if(v!==undefined)return v;}
 const id=c.CheckID, s=ctx.skill||{},raw=s.raw||{};
 switch(c.CheckFun||'None'){
 case'None':return true;
 case'IsMainRound':return own(ctx,'mainRound')?!!ctx.mainRound:problem(ctx,'缺少主回合标记');
 case'IsNotMainRound':return own(ctx,'mainRound')?!ctx.mainRound:problem(ctx,'缺少主回合标记');
 case'IsNormalSkill':return own(s,'normal')?s.normal:/S1$/.test(s.id||'')?true:problem(ctx,'缺少原生普攻标记');
 case'IsDamageSkill':return own(s,'damage')?!!s.damage:own(raw,'AttRate')?isDamageHit(s):problem(ctx,'缺少技能伤害类型');
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
// Typed fields and nine enum declarations from the paired 014517 dump.
// SHA256 d436704cc84d7a0580dc27c959c66b810e675e923c19a61098aaab0b0f53f4cb.
// Newtonsoft resolves exact member names first, then OrdinalIgnoreCase; unknown
// fields are ignored as whole values. An invalid declared enum drops its entire
// DynamicField, including nested conditions and follow-up functions.
const NATIVE_FUNCTION_SCHEMA={"classes":{"SkillFunctionInfo":{"ID":"string","GID":"string","Fun":"EFunction","TargetCamp":"ETargetCamp","Target":"ETargetType","TargetScope":"ETargetScope","NoSelf":"bool","Tags":"string","Rate":"float","UIRate":"float","UIValue":"int","LV":"int","IgnoreNoCounter":"bool","IgnoreResist":"int","IgnoreImmune":"bool","IgnoreDodge":"bool","NoResistCondition":"SkillCondition","SelectInfo":"SkillSelectInfo","FromSelect":"SkillSelectInfo","Trigger":"EFunctionTrigger","Count":"int","AddCount":"int","SpawnCount":"int","Value":"float","FID":"string","Property":"EProperty","FIDs":"List<string>","IgnFIDs":"List<string>","Monsters":"List<SceneMonsterStaticInfo>","IsAura":"bool","AuraToAlly":"bool","ArtTip":"bool","IsShowTip":"bool","AbsoluteRemoveBuff":"bool","AuraSource":"BattleRoleData","StatusRound":"int","CD":"int","GCD":"int","IsFunSingle":"bool","ParamOrder":"int","CantAddToDie":"bool","DeadCanRun":"bool","RandCount":"int","IsForceAddSkill":"bool","CheckDupAddSkill":"bool","DupReplaceAddSkill":"bool","IsTransferBuffRemove":"bool","UseBeforeValue":"bool","PreCond":"SkillCondition","Condition":"SkillCondition","Conditions":"List<SkillCondition>","RateConvert":"SkillValueConvert","AddRate":"SkillValueConvert","ValueConvert":"SkillValueConvert","BuffAttackRate":"SkillValueConvert","MaxSkillDamage":"SkillValueConvert","RandCountConvert":"SkillValueConvert","SubFuns":"List<SkillFunctionInfo>","ContinueFun":"SkillFunctionInfo","ContinueFuns":"List<SkillFunctionInfo>","ConditionAddFun":"SkillFunctionInfo","ConstAttack":"SkillValueConvert","ConditionAttack":"SkillValueConvert","PenetrateRate":"SkillValueConvert","Penetrate2Rate":"SkillValueConvert","Penetrate3Rate":"SkillValueConvert","StatusValue":"SkillValueConvert","AttRate":"SkillValueConvert","EffectHit":"SkillValueConvert","HurtReduction":"SkillValueConvert","DefenceRate":"SkillValueConvert","AddTimeRate":"SkillValueConvert","SourceDamageRate":"SkillValueConvert","ReduceTimeRate":"SkillValueConvert","EnhanceRate":"SkillValueConvert"},"SkillCondition":{"Who":"EFunctionWho","TargetInfo":"SkillSelectInfo","RoleSelectInfo":"SkillSelectInfo","Property":"EProperty","Value":"float","Comparer":"EComparer","Value2":"float","IsAllWhoPass":"bool","ComparedValue":"SkillValueConvert","CheckFun":"ECheckCondition","CheckID":"string","CheckID2":"string","CheckIDs":"List<string>","NextCondition":"SkillCondition","Conditions":"List<SkillCondition>","Invert":"bool"},"SkillValueConvert":{"Who":"EFunctionWho","TargetInfo":"SkillSelectInfo","Rate":"float","ExtraRatePlus":"float","AddRandom":"float","Property":"EProperty","Base":"float","PropertyID":"string","Class":"string","MustPositive":"bool","MaxValue":"float","MaxValueConvert":"SkillValueConvert","FinalMaxValue":"float","FinalMaxValueConvert":"SkillValueConvert","FinalMinValue":"float","ValueConvert":"SkillValueConvert","ExtraRate":"SkillValueConvert","Condition":"SkillCondition","Conditions":"List<SkillCondition>","ConditionRates":"List<ConditionRate>"},"SkillSelectInfo":{"TargetCamp":"ETargetCamp","TargetType":"ETargetType","TargetTypeID":"string","NoSelf":"bool","IncludeHideOut":"bool","IncludeStealth":"bool","IncludeInvincible":"bool","RemoveWillPassRound":"bool","Count":"int","Property":"EProperty","PropertyID":"string","Condition":"SkillCondition","AuraSource":"BattleRoleData","Fallback":"SkillSelectInfo","Filter":"SkillSelectInfo"},"ConditionRate":{"Rate":"float","Condition":"SkillCondition"},"SceneMonsterStaticInfo":{"M":"string","LV":"int","Pos":"int","Boss":"bool","AIs":"string","ArtifactID":"string","ArtifactLV":"int","ImprintLV":"int"}},"enums":{"ECheckCondition":{"None":0,"HaveBuff":1,"AnyEnemyHaveBuff":2,"AnyAllyHaveBuff":3,"SourceBuff":4,"NoBuff":5,"OtherAllyHurt":6,"MainActionType":7,"SkillID":8,"CheckSkillCooldown":9,"IsNoDamageSkill":10,"IsDamageSkill":11,"CheckSkillNoUse":12,"IsCriticalHit":13,"NotMaxHP":14,"IsSameCamp":15,"IsDiffCamp":16,"TargetIsOne":17,"TargetIsAll":18,"IsNormalSkill":19,"IsHitMiss":20,"IsNotMainRound":21,"IsMainRound":22,"IsSelf":23,"IsNoSelf":24,"IsPinch":25,"IsCounter":26,"IsAddition":27,"HPHeighSource":28,"HPLessSource":29,"EnemyHaveDeBuff":30,"AllyHaveDeBuff":31,"AnyEnemyHaveCoolDown":32,"AnyAllyHaveCoolDown":33,"FunID":34,"AnyTypeRoleHaveBuff":35,"IsUseSoul":36,"HasAnyBuff":37,"IsBeCriticalHit":38,"IsBoss":39,"Position":40,"IsSameRole":41,"SourceFID":42,"RoleElement":43,"RoleJob":44,"FirstElement":45,"FirstJob":46,"EventFun":47,"HaveBuffGroup":48,"IsHero":49,"FunHasTag":50,"TargetHasEventFun":51,"SourceHasEventFun":52,"ParamBuff":53,"CheckRoundSkillSate":54,"IsSkillNoPinch":55,"HasAntiFun":56,"SourceFun":57},"EComparer":{"Eq":0,"Ne":1,"Lt":2,"Gt":3,"Ltn":4,"Gtn":5,"Between":6},"EFunction":{"No":0,"AddStatus":1,"AddTime":2,"AddHP":3,"RemoveDeBuf":4,"RemoveBuf":5,"AddValue":6,"AdditionSkill":7,"Revive":8,"CounterSkill":9,"ReplaceSkill":10,"ReSetSkillCoolDown":11,"ImmortalAddHP":12,"AddSP":13,"BuffAttack":14,"AddAllBuffRound":15,"AddAllDeBuffRound":16,"SetDieOut":17,"AddSkillCoolDown":18,"ClearAllSkillCoolDown":19,"SetTime":20,"AddAllSkillCoolDown":21,"RandomAddStatus":22,"SetStatusValue":23,"AddEventHPDiff":24,"SplitDamage":25,"AddSoul":26,"RandomOneAddSkillCooDown":27,"AddPinchSkill":28,"RemoveBufsByID":29,"BlastBuff":30,"SetHPRate":31,"AddInjuryRate":32,"TransferDeBuff":33,"MarkRoles":34,"ClearMarkRoles":35,"SetEventHPDiff":36,"DirectHit":37,"SpawnMonster":38,"ReduceHPConstAttack":39,"DirectHPValueHit":40,"AddRound":41,"ShowTip":42,"ReviveMonster":43,"DirectRevive":44,"ReSetAllSkillCoolDown":45,"LifeSteal":46,"StatusValueDamage":47,"ClearSkillCoolDown":48,"ContinueSkill":49,"TransferBuff":50,"SetNowHPRate":51,"AddStatusList":52,"RemoveBufsByIDList":53,"TransferBuffFrom":54,"TransferDeBuffFrom":55,"ResetEventSoulCost":56,"MultiplySoul":57,"BlastBuffWithInjury":58,"AddHPWithInjury":59},"EFunctionTrigger":{"AfterSkill":0,"BeforeSkill":1,"BeforeRound":2,"AfterRound":3,"SelfDead":4,"OtherDead":5,"RoundSelfDead":6,"AnyEnemyAfterSkill":7,"AnyAllyAfterSkill":8,"AnyEnemyAfterMainSkill":9,"AnyAllyAfterMainSkill":10,"AnyEnemyAfterRound":11,"AnyAllyAfterRound":12,"BuffRound":13,"AfterOtherSkill":14,"FirstStartBattle":15,"StartBattle":16,"TargetAfterSkill":17,"AfterEvent":18,"Property":19,"BeforeEvent":20,"AnyOtherAfterRound":21,"None":22,"AnyOneAfterSkillHit":23,"SourceBeforeEvent":24,"SourceAfterEvent":25,"AfterRevive":26,"ForceConquer":27,"AnyOneAfterRound":28,"AnyOneBeforeRound":29,"NoDefenceConquer":30,"SkillProperty":31,"PreSelfDead":32,"PreOtherDead":33,"PreAfterSkill":34,"PreStartBattle":35,"AnyOneBeforeSkill":36,"PostStartBattle":37,"AfterBuffRound":38,"OtherDeadAfter":39,"FunValueRateWithTagSingle":40},"EFunctionWho":{"Target":0,"Source":1,"SelectTarget":2,"TriggerSource":3,"AuraSource":4,"TargetSetting":5,"TriggerTarget":6,"SkillDirectTargets":7},"EProperty":{"None":0,"HP":1,"HPValue":2,"HPRate":3,"Attack":4,"AttackValue":5,"AttackRate":6,"AttackFinalRate":7,"Defence":8,"DefenceValue":9,"DefenceRate":10,"DefenceFinalRate":11,"Speed":12,"SpeedValue":13,"SpeedRate":14,"SpeedFinalRate":15,"CriticalRate":16,"DeCriticalRate":17,"CriticalDamageRate":18,"PinchRate":19,"CounterRate":20,"DodgeRate":21,"PenetrateRate":22,"EffectHitRate":23,"ResistanceRate":24,"Fun":25,"Cost":26,"DamageRate":27,"CoolDown":28,"TargetType_NoUse":29,"TargetSelectInfo":30,"HitRate":31,"AddTime":32,"StatusAddStatus":33,"Shield":34,"AddOtherSkillFun":35,"Dizzy":36,"Sleep":37,"Taunt":38,"Restrict":39,"Brand":40,"Silence":41,"Poison":42,"Burn":43,"Bleed":44,"Immune":45,"AntiStun":46,"AntiSleep":47,"AntiTaunt":48,"AntiRestrict":49,"AntiBrand":50,"AntiSilence":51,"AntiReduceTime":52,"AntiReduceSpeed":53,"AntiPoison":54,"AntiTransferDeBuff":55,"AntiBurn":56,"AntiBleed":57,"AntiAddCoolDown":58,"Invincible":59,"Stealth":60,"HideOut":61,"CantBuff":62,"CantHeal":63,"LastHP":64,"NowHP":65,"NowHPRate":66,"Rate":67,"ConditionAttackRate":68,"ReplaceCounterSkill":69,"ValueOne":70,"DebuffCount":71,"BuffCount":72,"EnemyCount":73,"AllyCount":74,"FewEnemyCount":75,"MustBigHit":76,"MustHit":77,"MustCritical":78,"MustDodge":79,"AttRate":80,"NoPinch":81,"NoDodge":82,"Immortal":83,"NowSP":84,"NoDamage":85,"NoCritical":86,"NoBigHit":87,"EnemyCantRevive":88,"DieOut":89,"LastHPRate":90,"NoCounter":91,"DeadCount":92,"AllyDeadCount":93,"AllDamage":94,"CriticalCount":95,"EventHPDiff":96,"HPDiffHPMaxRate":97,"RoleSpine":98,"AllSkillReplace":99,"AI":100,"SealPassive":101,"SealHeal":102,"SealBuff":103,"IsSourceDeadRemove":104,"BuffStack":105,"BuffCountByID":106,"BuffAllRoundByID":107,"BuffMinRoundByID":108,"NowTime":109,"SkillEventBuffCount":110,"AntiList":111,"PVP_NPCID":112,"PVP_NPCHour":113,"ItemCollectSecond":114,"ItemCollectMax":115,"ItemDayResetCount":116,"IsUrgentMission":117,"InitMaxLV":118,"GoToSelectCommodityID":119,"GoToSelectStoreID":120,"DefaultBattleRoleSpine":121,"BlastBuffRoundValue":122,"BlastBuffRounds":123,"BuffStackReplace":124,"DirectToLobby":125,"FunRemoveShowTip":126,"LifeStealRate":127,"SkillSP":128,"SkillSoul":129,"DirectAwakenSkill":130,"AntiCantRevive":131,"AntiDieOut":132,"LostHPRate":133,"InjuryRate":134,"SkillDamage":135,"SkillDamageHPRate":136,"MaxHP":137,"HPFinalRate":138,"IsNormalSkill":139,"AntiAddTime":140,"AddTimeRate":141,"RealSkillDamage":142,"AllCantRevive":143,"Penetrate2Rate":144,"Penetrate3Rate":145,"ReduceSpeed":146,"BuffGroupStack":147,"NoWakeUp":148,"LastRemoveDebuffCount":149,"PinchSkill":150,"NoConquer":151,"AddHPDiffHPMaxRate":152,"OldBuffCount":153,"OldDebuffCount":154,"CounterSkill":155,"NoSplitDamage":156,"TauntAI":157,"AntiTransferBuff":158,"WhoSkillDamage":159,"IsMaxSkillLV":160,"CampJobCount":161,"CampElementCount":162,"AntiBuffGs":163,"AddFightSPRate":164,"AddFocusSPRate":165,"ConstAttEnhance":166,"ConditionAttEnhance":167,"AntiFun":168,"AntiReduceCoolDown":169,"TurnRole":170,"Prologue":171,"HurtReductionRate":172,"CampBuffCount":173,"CampDebuffCount":174,"SourceDamageRate":175,"ForFilter":176,"BuffValue":177,"RoleLV":178,"IgnoreBuildinResist":179,"CanRemoveDebuffCount":180,"CanRemoveBuffCount":181,"IsNeedLock":182,"NoSoulCost":183,"UseSoulRemove":184,"SkillDamageInjHPRate":185,"ConnectArtifact":186,"IsLimited":187,"SummonInfo":188,"OpeningDays":189,"ConnectSummon":190,"NeedShowOnLobby":191,"IsWeekSignInReturning":192,"IsWeekSignInNewbie":193,"SkillDirectTargetsCount":194,"AntiNegativeAddTime":195,"BuffCountByGroup":196,"RoleRepresent":197,"IgnoreHurtReduction":198,"MaxSPRate":199,"InjuryValue":200,"BlastBuffRoundsInjury":201,"NoInjuryMaxHP":202,"HasNewTip":203,"CheckBoxPrefab":204,"SSRGuaranteed":205,"SRGuaranteed":206,"RiseSSRRate":207,"FunCond_":208,"IsNewbie":209,"ActStartDay":210,"QuestPointItemID":211,"BeDamageNoSplit":212,"IgnoreBeHurtReduction":213,"ActivityRemainCantUse":214,"RoleNoPinch":215,"RoleNoCount":216,"DePenetrateRate":217,"LockItemBoxSecond":218,"SpeedupItem":219,"DramaID":220,"CampElementTotalCount":221,"PropertyDiffRateBaseByUseFunRole":222,"SkillNotReadDamageHPRate":223,"ParamBuffCountByID":224,"SealDeBuff":225,"HPDiffBeforeDamageReduction":226,"SafeModeIconPrefab":227,"ExtraServerStatusIDs":228},"ETargetCamp":{"None":0,"My":1,"Enemy":2},"ETargetScope":{"All":0,"Story":1,"PVP":2},"ETargetType":{"One":0,"RandomTwo":1,"All":2,"LessHP":3,"SkillSource":4,"SkillSelect":5,"AllWithDead":6,"OneWithDead":7,"Self":8,"RandomOne":9,"AuraSource":10,"FrontRow":11,"BackRow":12,"SkillSetting":13,"HaveDeBuffOne":14,"HaveDeBuffAll":15,"TriggerSource":16,"ConquerTarget":17,"LessHPRate":18,"Boss":19,"DeadOne":20,"HightestAtkOne":21,"TautSource":22,"HighestHPOne":23,"HighestHPRate":24,"MarkedRoles":25,"MaxBuffStack":26,"SkillDirectTargets":27,"HaveCoolDown":28,"MostTime":29,"ConquerOKTarget":30,"TwoLessHP":31,"TwoLessHPRate":32,"MaxBuffGroupStack":33,"RandomOneTwo":34,"MaxProperty":35,"MinProperty":36,"HightestSkillCD":37,"Job":38,"Element":39,"HighestMaxHP":40,"LowMaxHP":41,"ParamTarget":42,"DeadOneOrLessHPRate":43}}};
const nativeFieldNames=Object.fromEntries(Object.entries(NATIVE_FUNCTION_SCHEMA.classes).map(([name,fields])=>[name,Object.fromEntries(Object.keys(fields).map(key=>[key.toLowerCase(),key]))]));
function loadNativeFunction(value){
 const errors=[],ignored=[];
 function error(path,type,input,reason){errors.push({path,type,value:input,reason});return null;}
 function enumValue(input,type,path){
  const members=NATIVE_FUNCTION_SCHEMA.enums[type];let numeric;
  const integer=n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647;
  if(typeof input==='number'&&integer(input))numeric=input;
  else if(typeof input==='string'){
   const value=input.trim();
   if(/^[+-]?\d+$/.test(value)){numeric=Number(value);if(!integer(numeric))return error(path,type,input,'enum integer is outside Int32');}
   else{
    const parts=value.split(',').map(part=>part.trim());numeric=0;
    for(const part of parts){const key=own(members,part)?part:Object.keys(members).find(key=>key.toLowerCase()===part.toLowerCase());if(!part||key===undefined)return error(path,type,input,'unknown enum member');numeric|=members[key];}
   }
  }else return error(path,type,input,'enum value requires an Int32 or member name');
  return Object.keys(members).find(key=>members[key]===numeric)??numeric;
 }
 function typed(input,type,path){
  if(own(NATIVE_FUNCTION_SCHEMA.enums,type))return enumValue(input,type,path);
  const list=/^List<(.+)>$/.exec(type);
  if(list){if(input===null)return null;if(!Array.isArray(input))return error(path,type,input,'expected a list');return input.map((item,index)=>typed(item,list[1],path+'['+index+']'));}
  const fields=NATIVE_FUNCTION_SCHEMA.classes[type];
  if(!fields)return clone(input);
  if(input===null)return null;
  if(typeof input!=='object'||Array.isArray(input))return error(path,type,input,'expected a declared object');
  const out={};
  for(const [supplied,item]of Object.entries(input)){
   const names=nativeFieldNames[type],lower=supplied.toLowerCase(),key=own(fields,supplied)?supplied:own(names,lower)?names[lower]:undefined;
   if(key===undefined){ignored.push({path:path+'.'+supplied,type});continue;}
   out[key]=typed(item,fields[key],path+'.'+key);
  }
  return out;
 }
 const parsed=typed(value,'SkillFunctionInfo','$');
 return {value:errors.length?null:parsed,errors,ignored};
}
function configFunctions(configs,origin){const out=[];for(const c of configs||[]){if(c.key==='Fun'&&typeof c.value==='object'){const loaded=String(origin||'').startsWith('CUSTOM_')?{value:clone(c.value),errors:[]}:loadNativeFunction(c.value);if(loaded.errors.length||loaded.value===null)continue;let v=correctedFunction(loaded.value,origin,c.field);v._origin=origin;v._field=c.field;out.push(v);}else out.push({_property:c.key,_value:c.value,_origin:origin,_field:c.field});}return out;}
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
 for(const c of def.configs||[]){if(c.key==='Fun'){const loaded=loadNativeFunction(c.value);if(loaded.errors.length||loaded.value===null)continue;functions.push({...loaded.value,_origin:instance.id,_status:instance});continue;}const n=num(c.value);if(n===null){lists[c.key]=String(c.value).split('~').filter(Boolean);if(c.key!=='AntiList')unsupported.push('状态字符串属性尚未解释：'+c.key);continue;}properties[c.key]=(properties[c.key]||0)+Math.fround(n*scale);}
 const flags={shield:!!properties.Shield,noDamage:!!properties.NoDamage,immune:!!properties.Immune,invincible:!!properties.Invincible,immortal:!!properties.Immortal,sealHeal:!!properties.SealHeal,sealBuff:!!properties.SealBuff};
 return {id:instance.id,properties,functions,lists,immuneList:lists.AntiList||[],flags,scale,isBuff:stType({...instance,def})==='Buff',isDebuff:stType({...instance,def})==='DeBuff',unsupported};
}
const API={setData(data){DATA=data;return API;},resolveSkill,evaluateCondition,convert,analyzeFunctions,configFunctions,nativeStatusProperties,loadNativeFunction,isDamageHit};
root.GLConfig=API;if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof globalThis!=='undefined'?globalThis:this);
