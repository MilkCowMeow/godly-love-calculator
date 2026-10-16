/* 014517 连续场景的对象上下文与事件桥。与 native_*_rules 一同使用。 */
(function(root){'use strict';
const B=root.GLBattle,C=root.GLConfig,T=root.GLTimeline,F=Math.fround;
const N=(x,d=0)=>x===''||x===undefined||x===null?d:Number(x),flag=(x,d=false)=>x===''||x===undefined||x===null?d:x===true||x==='TRUE'||x===1||x==='1';
const knownVC=new Set('Who TargetInfo Rate ExtraRatePlus AddRandom Property Base PropertyID Class MustPositive MaxValue MaxValueConvert FinalMaxValue FinalMaxValueConvert FinalMinValue ValueConvert ExtraRate Condition Conditions ConditionRates'.split(' '));
function cleanVC(v){if(!v||typeof v!=='object')return v;const o={};for(const [k,x]of Object.entries(v)){if(!knownVC.has(k)&&['theValue','CheckID'].includes(k))continue;o[k]=['ValueConvert','ExtraRate','MaxValueConvert','FinalMaxValueConvert'].includes(k)?cleanVC(x):x;}return o;}
function install(S){const P=S.prototype,select0=P.select;
 P.nativeDamageEvents=true;
 P.value=function(vc,ctx,fallback=0){if(!vc)return F(fallback);const r=C.convert(cleanVC(vc),ctx,fallback);this.requireKnown(r.unsupported,'数值转换');if(r.value===null||!Number.isFinite(r.value))throw new T.Incomplete('数值转换缺少有效上下文');return r.value;};
 P.statusType=function(s){return this.data.statuses[s.id]?.raw.IsBuffType||'DeBuff';};
 P.context=function(owner,target,action=this.action,trigger='AfterSkill',status=null,event=null){
  target=target||owner;const actor=action?.actor||owner,skill=action?.skill||{id:'',raw:{}},inst=status||action?.status;
  const src=event&&Object.prototype.hasOwnProperty.call(event,'source')?event.source:action&&Object.prototype.hasOwnProperty.call(action,'triggerSource')?action.triggerSource:actor;
  const ctx={nativeContext:true,source:owner,target,useFunRole:owner,selectedTarget:action?.selected||null,triggerSource:src,triggerTarget:event?.target||action?.hitTarget||target,auraSource:inst?.source?this.locate(inst.source):null,skill:{id:skill.id,raw:skill.raw,normal:!!action?.normal,noPinch:!!(action?.skillProperties?.NoPinch),damage:event?!!event.damage:N(skill.raw.AttRate)>0,targetType:skill.raw.TargetType||'One'},mainRound:this.nowRoundRole===owner,nowRoundRole:this.nowRoundRole,pinch:action?.kind==='pinch',counter:action?.kind==='counter',addition:['addition','continue'].includes(action?.kind),mainActionType:action?.actionType??(action?.main?0:({counter:1,pinch:2,addition:3,continue:7}[action?.kind]??5)),critical:action?.hitTypes?.[target.uid]==='critical'||action?.hitType==='critical',enemyCount:this.alive(1-owner.camp).length,allyCount:this.alive(owner.camp).length,fewEnemyCount:Math.max(0,4-this.alive(1-owner.camp).length),round:owner.nowRound,skillCooldowns:owner.cooldowns,skillUseCounts:owner.uses,allies:this.alive(owner.camp),enemies:this.alive(1-owner.camp),directTargets:action?.directTargets||[],randomUnit:this.random(),trigger,event,funId:action?.funId,sim:this,owner,buffInstance:inst};
  ctx.nativeConditionCheck=(c,r)=>{const id=c.CheckID;if(!r&&['IsSameCamp','IsDiffCamp','IsSelf','IsNoSelf','CheckSkillCooldown','CheckSkillNoUse','AllyHaveDeBuff','AnyAllyHaveCoolDown'].includes(c.CheckFun))return false;switch(c.CheckFun){
   case'IsSameCamp':return r.camp===owner.camp;case'IsDiffCamp':return r.camp!==owner.camp;
   case'IsSelf':return r===owner;case'IsNoSelf':return r!==owner;
   case'IsMainRound':return r===this.nowRoundRole;case'IsNotMainRound':return r!==this.nowRoundRole;
   case'MainActionType':return ctx.mainActionType===0;
   case'IsNormalSkill':return !!action?.normal;
   case'IsDamageSkill':return ctx.skill.damage;case'IsNoDamageSkill':return !ctx.skill.damage;
   case'CheckSkillCooldown':return N(r.cooldowns[id])<=0;
   case'CheckSkillNoUse':return N(r.uses[id])===0;
   case'AllyHaveDeBuff':return this.alive(r.camp).some(x=>x.debuffCount>0);
   case'AnyAllyHaveCoolDown':return this.alive(r.camp).some(x=>Object.values(x.cooldowns).some(n=>n>0));
  }};
  ctx.resolveConditionRoles=c=>this.select(owner,c.TargetInfo,action,target);
  ctx.resolveProperty=(prop,r,id)=>{if(!r)return 0;switch(prop){
   case'Attack':case'Defence':case'Speed':return r.runtimeStats?.[prop]??r.stats[prop];
   case'Round':return r.nowRound;case'NowTime':return r.progress;
   case'EventHPDiff':return event?.hpDiff||0;
   case'BuffValue':return id?(r.statuses.find(s=>s.id===id)?.value||0):(inst?.value||0);
   case'BuffAllRoundByID':return r.statuses.filter(s=>s.id===id).reduce((a,s)=>a+(this._nativeStatusRound?this._nativeStatusRound(r,s):s.rounds||0),0);
   case'BuffMinRoundByID':{const xs=r.statuses.filter(s=>s.id===id);return xs.length?Math.min(...xs.map(s=>this._nativeStatusRound?this._nativeStatusRound(r,s):s.rounds||0)):0;}
   case'BlastBuffRoundValue':return r.statuses.filter(s=>s.id===id).reduce((a,s)=>F(a+F(s.value*(this._nativeStatusRound?this._nativeStatusRound(r,s):s.rounds||0))),0);
   case'AllDamage':case'SkillDamage':return action?.damage||0;
   case'WhoSkillDamage':return action?.damageByTarget?.[r.uid]||0;
   case'CampDebuffCount':return this.alive(r.camp).reduce((a,x)=>a+x.debuffCount,0);
   case'AttackFinalRate':case'DefenceRate':case'ResistanceRate':case'DodgeRate':case'DefenceFinalRate':case'SpeedFinalRate':return r.props[prop]||r.stats[prop]||0;
   case'RoleNoPinch':return r.props.RoleNoPinch||0;
  }};
  return ctx;
 };
 P.refresh=function(u,action=this.action){
  const p={...(u.nativeImprintRates||{})},lists=[];const add=(k,v)=>{if(Number.isFinite(Number(v)))p[k]=(p[k]||0)+Number(v);else if(k==='AntiList')lists.push(...String(v).split('~'));};
  for(const f of u.global)if(f._property)add(f._property,f._value);
  for(const s of u.statuses){const r=C.nativeStatusProperties({...s,def:this.data.statuses[s.id]});for(const [k,v]of Object.entries(r.properties))add(k,v);lists.push(...r.immuneList);}
  u.props=p;u.stats={...u.base,...p};u.buffCount=u.statuses.filter(s=>this.statusType(s)==='Buff').length;u.debuffCount=u.statuses.filter(s=>this.statusType(s)==='DeBuff').length;u.hpRate=u.stats.MaxHP>0?u.hp/u.stats.MaxHP:0;
  const fs=this.functions(u).filter(f=>f.Trigger==='Property'&&f.Property);
  for(const f of fs){const ctx=this.context(u,u,action,'Property',f._status);if(f._auraSource)ctx.auraSource=this.locate(f._auraSource);if(this.condition(f,ctx)){const v=f.ValueConvert?this.value(f.ValueConvert,ctx):N(f.Value);add(f.Property,v);}}
  u.runtimeStats={};for(const k of ['Attack','Defence','MaxHP','Speed']){const prefix=k==='MaxHP'?'HP':k,base=u.nativeBase?.[k]??u.base[k],rate=p[prefix+'Rate']||0,value=p[prefix+'Value']||0,finalRate=p[prefix+'FinalRate']||0;u.runtimeStats[k]=B.statFloat(base,rate,value,finalRate);u.stats[k]=B.finalStat(base,rate,value,finalRate,k);}
  for(const k of ['CriticalRate','CriticalDamageRate','EffectHitRate','ResistanceRate','PinchRate','DodgeRate','HitRate'])u.stats[k]=F((u.base[k]||0)+(p[k]||0));
  u.stats.HP=u.stats.MaxHP;u.hpRate=u.stats.MaxHP>0?u.hp/u.stats.MaxHP:0;u.immuneList=[...new Set(lists)];u.noPinch=!!p.RoleNoPinch;u.NowTime=u.progress;return u;
 };
 P.willPass=u=>!!(u.props.Dizzy||u.props.Sleep||u.props.HideOut);
 P.select=function(owner,setting={},action=this.action,defaultTarget=null){
  const sc=setting.SelectInfo||setting,t=sc.TargetType||sc.Target||'One';
  if(t==='AuraSource'){const id=setting._auraSource||action?.status?.source;const r=this.locate(id);return r?[r]:[];}
  if(t==='TriggerSource'){const r=action?._eventSource!==undefined?action._eventSource:action?.triggerSource!==undefined?action.triggerSource:action?.actor;return r?[r]:[];}
  if(t==='TriggerTarget')return action?._eventTarget?[action._eventTarget]:action?.hitTarget?[action.hitTarget]:[];
  if(t==='ParamTarget')return defaultTarget?[defaultTarget]:[];
  if(t==='One'){const chosen=action?.selected||null,camp=sc.TargetCamp||setting.TargetCamp||'Enemy';if(camp==='My')return [chosen&&chosen.camp===owner.camp?chosen:owner];return chosen?[chosen]:[];}
  if(t==='OneWithDead')return defaultTarget?[defaultTarget]:[];
  return select0.call(this,owner,setting,action,defaultTarget);
 };
 P.passiveTriggerFunctions=function(owner,trigger){return this.functions(owner).filter(f=>!f._property&&(f.Trigger||'AfterSkill')===trigger&&!(owner.props.IsSealPassive&&!f._status)).sort((a,b)=>N(a.ParamOrder)-N(b.ParamOrder));};
 P.trigger=function(owner,trigger,action=this.action,event=null){
  if(owner.dead&&!['SelfDead','OtherDead','AfterRevive','PreSelfDead','AfterEvent'].includes(trigger))return;
  for(const f of this.passiveTriggerFunctions(owner,trigger)){const a={...(action||{}),_eventSource:event?event.source:action?.actor,_eventTarget:event?.target||action?.hitTarget};if(f._status)a.status=f._status;if(f._auraSource)a.status={source:f._auraSource};this.execute(owner,f,a,event?.target||action?.selected||owner,event);}
 };
 P.numeric=function(fs,ctx,keys){const projected=fs.filter(f=>keys.some(k=>f[k])).map(f=>{const o={Trigger:'AfterSkill',Condition:f.Condition,Conditions:f.Conditions,PreCond:f.PreCond,_origin:f._origin};for(const k of keys)if(f[k])o[k]=cleanVC(f[k]);return o;});const a=C.analyzeFunctions(projected,ctx);this.requireKnown(a.unsupported,'数值公式');return a;};
 P.skillProperties=function(u,action,target){const rr=C.resolveSkill(u.card,action.skill.id,{imprint:u.imprint,ascend:0}),p={...u.props};
  const fs=[...rr.functions.filter(f=>f._origin!==u.card.id),...this.functions(u).filter(f=>f.Trigger==='SkillProperty')];
  for(const f of fs){if(f._property){if(Number.isFinite(Number(f._value)))p[f._property]=F((p[f._property]||0)+Number(f._value));}else if(f.Trigger==='SkillProperty'&&f.Property){const ctx=this.context(u,target||action.selected||u,action,'SkillProperty',f._status);if(this.condition(f,ctx))p[f.Property]=F((p[f.Property]||0)+(f.ValueConvert?this.value(f.ValueConvert,ctx):N(f.Value)));}}
  return p;
 };
 P.hitParams=function(source,target,action){
  this.refresh(source,action);this.refresh(target,action);const rr=C.resolveSkill(source.card,action.skill.id,{imprint:source.imprint,ascend:0}),fs=[...this.functions(source),...rr.functions.filter(f=>f._origin!==source.card.id)],ctx=this.context(source,target,action,'SkillProperty');
  const a=this.numeric(fs,ctx,['ConstAttack','AttRate','ConditionAttack','PenetrateRate','Penetrate2Rate','Penetrate3Rate','SourceDamageRate']),z=this.numeric(this.functions(target),this.context(target,target,action,'BeforeEvent'),['DefenceRate','HurtReduction','MaxSkillDamage']);
  const p=source.props,t=target.props,s=this.skillProperties(source,action,target),skillFinal=F((s.AttackFinalRate||0)-(p.AttackFinalRate||0));
  const force=fs.some(f=>(f.Fun==='ForceConquer'||f.Trigger==='ForceConquer')&&this.condition(f,ctx));
  return {attack:source.stats.Attack,attRate:F(N(action.skill.raw.AttRate)+(a.sums.AttRate||0)+(s.SkillAttRate||0)),constAttack:a.sums.ConstAttack||0,pow:N(action.skill.raw.Pow,1),conditionMultiplier:F(F(1+skillFinal)*a.conditionMultiplier),sourceElement:source.card.element,targetElement:target.card.element,defence:target.stats.Defence,defenceRate:F(1+(z.sums.DefenceRate||0)),penetrations:[1,2,3].map(i=>F((s['Penetrate'+(i===1?'':i)+'Rate']||0)+(a.sums['Penetrate'+(i===1?'':i)+'Rate']||0))),antiPenetrate:t.DePenetrateRate||0,criticalRate:F(source.base.CriticalRate+(s.CriticalRate||0)),criticalDamageRate:F(source.base.CriticalDamageRate+(s.CriticalDamageRate||0)),forcedCriticalDamageRate:source.stats.CriticalDamageRate,deCriticalRate:t.DeCriticalRate||0,dodgeRate:target.stats.DodgeRate||0,hitRate:s.HitRate||0,sourceDamageRate:F((s.SourceDamageRate||0)+(a.sums.SourceDamageRate||0)),hurtReductions:z.valueLists.HurtReduction||[],runtimeHurtReduction:t.HurtReductionRate||0,shield:0,maxSkillDamage:z.sums.MaxSkillDamage||0,currentHP:target.unlimited?Infinity:target.hp,ignoreHurtReduction:!!s.IgnoreHurtReduction||!!t.IgnoreBeHurtReduction,forceConquer:force,noConquer:!!p.NoConquer,targetNoConquer:!!t.NoConquer,noDefenceConquer:!!t.NoDefenceConquer,mustDodge:t.MustDodge||0,noDodge:t.NoDodge||0,mustHit:s.MustHit||0,mustCritical:s.MustCritical||0,noCritical:s.NoCritical||0,mustBigHit:s.MustBigHit||0,noBigHit:s.NoBigHit||0};
 };
 P.effectResisted=function(owner,target,f,action,ctx,ignoreImmune=false){
  if(target.props.Immune&&!ignoreImmune&&!f.IgnoreImmune)return true;
  if(!f.IgnoreDodge&&action?.hitTypes?.[target.uid]==='dodge')return true;
  if(f.NoResistCondition?this.condition({Condition:f.NoResistCondition},ctx):N(f.IgnoreResist)>0)return false;
  const fs=[...this.functions(owner),...(action?.actor===owner&&action.skill?.id?C.resolveSkill(owner.card,action.skill.id,{imprint:owner.imprint}).functions.filter(x=>x._origin!==owner.card.id):[])];
  const a=this.numeric(fs,ctx,['EffectHit']);const chance=B.effectChance(1,F(owner.stats.EffectHitRate+(a.sums.EffectHit||0)),target.stats.ResistanceRate,!!target.props.IgnoreBuildinResist);
  const blocked=this.random()>chance;if(blocked)this.log('resist',owner,target,'抵抗效果',{effect:f.Fun});return blocked;
 };
 P.nativeEffectResisted=function(owner,target,f,a,c,opts={}){return this.effectResisted(owner,target,f,a,c,!!opts.ignoreImmune);};
 P.applyDamage=function(source,target,action,settled,kind='direct',shield=null){
  const ne=settled.nativeEvent||{},ordinary=ne.ordinaryHit!==false,eventSource=Object.prototype.hasOwnProperty.call(ne,'sourceRole')?ne.sourceRole:source;
  let signed=ne.hpDiff!==undefined?B.roundEven(F(ne.hpDiff)):-B.roundEven(F(settled.damage||0)),before=target.hp,damage=Math.max(0,-signed),absorbed=N(settled.absorbed);
  if(!ne.preSettled){
   if(ne.damageHit!==false&&!ne.bypassInvincible&&target.props.Invincible){damage=0;signed=0;}
   else {
    const noDamage=ordinary&&!!target.props.NoDamage;
    if(ordinary)target.statuses=target.statuses.filter(s=>!flag(this.data.statuses[s.id]?.raw.BeHitRemove));
    if(noDamage){damage=0;signed=0;}
    else if(!ne.bypassShield){shield=target.statuses.find(s=>C.nativeStatusProperties({...s,def:this.data.statuses[s.id]}).flags.shield);if(shield){if(signed>0){shield.value=F(shield.value+signed);signed=0;}else if(shield.value<damage){absorbed=B.roundEven(shield.value);damage-=absorbed;shield.value=0;}else{absorbed=damage;shield.value=F(shield.value-damage);damage=0;}if(shield.value===0)target.statuses=target.statuses.filter(s=>s!==shield);}}
    if(ordinary&&damage>0)target.statuses=target.statuses.filter(s=>!flag(this.data.statuses[s.id]?.raw.HurtRemove));
   }
  }else if(shield){shield.value=settled.remainingShield;if(shield.value<=0)target.statuses=target.statuses.filter(s=>s!==shield);}
  if(signed>0){const actual=target.unlimited?0:Math.max(0,Math.min(signed,target.stats.MaxHP-before));target.hp+=actual;this.refresh(target);this.log('heal',source,target,'伤害减免转为生命恢复',{heal:actual,healAttempted:signed,overheal:Math.max(0,signed-actual),healingSource:source.uid});this.trigger(target,'AfterEvent',action,{damage:ne.damageHit!==false,source:eventSource,target,hpDiff:actual});return {damage:false,target,source:eventSource,hpDiff:actual};}
  if(!target.unlimited)target.hp=Math.max(0,target.hp-damage);
  if(target.hp<1&&(target.props.Immortal||action?.immortalRoles?.has(target.uid)))target.hp=1;
  const actual=target.unlimited?damage:Math.max(0,before-target.hp);this.refresh(target);
  if(source?.camp===0&&target.camp===1){const m=this.row.members[source.slot];m.damage+=damage;m[kind==='dot'?'dot':'direct']+=damage;if(target.isBoss){m.bossDamage+=damage;this.row.bossDamage+=damage;}this.row.total+=damage;}
  if(action){action.damage=(action.damage||0)+damage;action.damageByTarget=action.damageByTarget||{};action.damageByTarget[target.uid]=(action.damageByTarget[target.uid]||0)+damage;action.hitTarget=target;}
  const hitLog=this.log(kind,source,target,kind==='dot'?'状态 / 追加伤害':'技能命中',{damage,actual,hp:target.unlimited?null:target.hp,hit:ne.hitType||action?.hitTypes?.[target.uid]||action?.hitType,shieldAbsorbed:absorbed});
  const ev={damage:ne.damageHit!==false,target,source:eventSource,hpDiff:-actual,beforeHP:before,afterHP:target.hp,nativeEvent:ne};
  if(target.hp<=0&&!target.unlimited){
   this.trigger(target,'PreSelfDead',action,ev);
   if(target.hp<=0){target.dead=true;this.log('death',target,target,'倒下');for(const other of this.units)if(other!==target&&other.hp>0)this.trigger(other,'PreOtherDead',action,ev);}
   if(target.hp<=0)for(const other of this.units)if(other!==target&&other.hp>0)this.trigger(other,'OtherDead',action,ev);
   if(target.hp<=0)this.trigger(target,'SelfDead',action,ev);
   if(target.hp<1)this.processNativeSourceDeath?.(target,action);
  }
  ev.afterHP=target.hp;ev.hpDiff=target.unlimited?-damage:target.hp-before;if(hitLog){hitLog.actual=Math.max(0,-ev.hpDiff);hitLog.hp=target.unlimited?null:target.hp;}
  this.trigger(target,'AfterEvent',action,ev);
  return ev;
 };
 P.attack=function(source,target,action){
  if(target.dead)return;let p=this.hitParams(source,target,action);p.conquerMultiplier=B.relation(p.sourceElement,p.targetElement,p).multiplier;const [type,multiplier]=this.rollHit(p);action.hitType=type;action.hitTypes=action.hitTypes||{};action.hitTypes[target.uid]=type;action.hitTarget=target;
  p=this.hitParams(source,target,action);p.conquerMultiplier=B.relation(p.sourceElement,p.targetElement,p).multiplier;
  const raw=B.settle({...p,shield:0,invincible:false,noDamage:false},multiplier),ev={damage:true,target,source,hpDiff:F(-raw.floatBeforeShield),splits:[]};
  this.trigger(target,'BeforeEvent',action,ev);this.trigger(source,'SourceBeforeEvent',action,ev);
  let hpDiff=B.roundEven(F(ev.hpDiff));
  if(ev.splits?.length){const split=ev.splits.filter(x=>x.target&&!x.target.dead).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value))[0];if(split){hpDiff=B.roundEven(F(ev.hpDiff-split.hpDiff));this.applyDamage(source,split.target,action,{damage:B.roundEven(split.value),nativeEvent:{eventFun:'SplitDamage',hitType:'SplitDamage',ordinaryHit:false,damageHit:true}},'direct');}}
  const result={...raw,damage:Math.max(0,-hpDiff),absorbed:0,nativeEvent:{ordinaryHit:true,damageHit:true,hpDiff}};
  const actualEvent=this.applyDamage(source,target,action,result,'direct');this.allTrigger('AnyOneAfterSkillHit',action,actualEvent);return result;
 };
 P.directDamage=function(owner,target,value,action,noDefence=false,metadata={}){
  this.refresh(target);let amount=F(value);const ev={damage:true,target,source:null,hpDiff:0,nativeEvent:metadata,isSplit:metadata.eventFun==='SplitDamage'},ctx=this.context(target,target,action,'BeforeEvent',null,ev);
  if(!noDefence){const z=this.numeric(this.functions(target),ctx,['DefenceRate','HurtReduction']);amount=F(F(amount*F(N(this.data.publicVariables?.AttackPowerRate,1.871)))/F(1+F(F(F(Math.trunc(target.stats.Defence)*F(1+(z.sums.DefenceRate||0)))*F(.3))/2000)));amount=F(amount*B.reduction({hurtReductions:z.valueLists.HurtReduction||[],runtimeHurtReduction:target.props.HurtReductionRate||0,ignoreHurtReduction:!!target.props.IgnoreBeHurtReduction}).multiplier);}
  ev.hpDiff=F(-amount);this.trigger(target,'BeforeEvent',action,ev);
  const credit=metadata.damageCredit||owner;
  return this.applyDamage(credit,target,action,{damage:Math.max(0,-B.roundEven(ev.hpDiff)),nativeEvent:{eventFun:metadata.eventFun||'DirectHPValueHit',hitType:'DirectHit',ordinaryHit:false,damageHit:true,hpDiff:ev.hpDiff,...metadata,sourceRole:null}},'dot');
 };
 P.execute=function(owner,f,action=this.action,defaultTarget=null,event=null){
  if(++this.functionDepth>80)throw new T.Incomplete('触发链超过原生核查范围');
  try{
   if(owner.dead&&f.DeadCanRun===false)return false;
   const key=f.ID,cd=N(f.CD),gcd=N(f.GCD,-1);owner.globalFunCooldowns=owner.globalFunCooldowns||{};
   if(cd>0&&key&&owner.nowRound<N(owner.funCooldowns[key]))return false;
   if(cd<=0&&gcd>=0&&key&&this.actionNumber<N(owner.globalFunCooldowns[key]))return false;
   let attempted=false;const targets=this.select(owner,f,action,defaultTarget);
   for(const target of targets){
    if(target.dead&&f.DeadCanRun===false)continue;
    const ctx=this.context(owner,target,action,f.Trigger||'AfterSkill',f._status,event);if(f._auraSource)ctx.auraSource=this.locate(f._auraSource);ctx.funId=f.ID||'';
    if(!this.condition(f,ctx))continue;
    const fun=f.Fun||'No';if(this.nativeAntiFun&&this.nativeAntiFun(owner,fun,fun))continue;
    const rate=F((f.RateConvert?this.value(f.RateConvert,ctx):N(f.Rate,1))+(f.AddRate?this.value(f.AddRate,ctx):0));
    for(let n=0;n<Math.max(0,N(f.Count,1)+N(f.AddCount));n++){
     if(this.random()>rate)continue;attempted=true;
     const val=f.ValueConvert?this.value(f.ValueConvert,ctx):N(f.Value);let success=true;
     const complex=this.executeComplex?.(owner,f,action,target,event,ctx,val);
     if(complex?.handled)success=complex.success;
     else if(fun==='No'||fun==='ForceConquer'){}
     else if(fun==='AddStatus'||fun==='RandomAddStatus'){
      const id=fun==='AddStatus'?f.FID:(f.FIDs||[])[Math.floor(this.random()*(f.FIDs||[]).length)],def=this.data.statuses[id];if(!def)throw new T.Incomplete('《'+owner.card.name+'》的 '+(f._origin||'技能')+' 引用状态 '+id+'，当前客户端没有该定义。');
      const ty=def.raw.IsBuffType||'DeBuff',anti='Anti'+id;
      if(target.immuneList.includes(anti))success=false;
      else if(ty==='DeBuff'&&this.effectResisted(owner,target,f,action,ctx))success=false;
      else {const v=f.StatusValue?this.value(f.StatusValue,ctx):val;success=this.addStatus(owner,target,id,f.StatusRound,v,action);if(success&&id==='Shield'&&owner.camp===0)this.row.members[owner.slot].shield+=v;}
     }
     else if(fun==='AddHP'||fun==='AddHPWithInjury')success=this.heal(owner,target,val,action,f,ctx);
     else if(['RemoveBuf','RemoveDeBuf','RemoveBufsByID'].includes(fun)){
      if(fun==='RemoveBuf'&&this.effectResisted(owner,target,f,action,ctx,true))success=false;
      else {const ids=f.FIDs?.length?f.FIDs:[f.FID];success=this.removeStatuses(owner,target,s=>fun==='RemoveBuf'?this.statusType(s)==='Buff':fun==='RemoveDeBuf'?this.statusType(s)==='DeBuff':ids.includes(s.id),val,fun==='RemoveBuf'?'驱散增益':fun==='RemoveDeBuf'?'净化负面状态':'移除指定状态',action,{...f,_resistChecked:true}).length>0;}
     }
     else if(fun==='AddTime'){
      if(val<0&&this.effectResisted(owner,target,f,action,ctx))success=false;
      else if(target.props.AntiAddTime)success=false;
      else {target.progress=F(Math.max(0,F(target.progress+val)));this.refresh(target);this.log('gauge',owner,target,'行动值 '+(val>=0?'+':'')+Math.round(val*100)+'%');}
     }
     else if(fun==='AddRound'){this.extraRounds.push(target.uid);this.log('extra',owner,target,'获得额外回合');}
     else if(fun==='ReSetSkillCoolDown'){const id=f.FID;if(this.data.skills[id])target.cooldowns[id]=N(this.data.skills[id].raw.CoolDown);else success=false;}
     else if(fun==='AddSkillCoolDown'||fun==='AddAllSkillCoolDown'){
      if(val>0&&this.effectResisted(owner,target,f,action,ctx))success=false;
      else for(const id of fun==='AddSkillCoolDown'?[f.FID]:target.skills)if(id&&id!==target.normal)target.cooldowns[id]=Math.max(0,N(target.cooldowns[id])+Math.trunc(val));
     }
     else if(fun==='AddAllBuffRound'||fun==='AddAllDeBuffRound'){
      const ty=fun==='AddAllBuffRound'?'Buff':'DeBuff';for(const s of target.statuses){const raw=this.data.statuses[s.id].raw;if(this.statusType(s)!==ty||!flag(raw.CanUpdateRound,true)||f.FIDs?.length&&!f.FIDs.includes(s.id)||f.IgnFIDs?.includes(s.id))continue;s.until+=Math.trunc(val);}this.refresh(target);
     }
     else if(fun==='ImmortalAddHP'){target.hp=1;target.dead=false;action=action||{};action.immortalRoles=action.immortalRoles||new Set();action.immortalRoles.add(target.uid);this.refresh(target);this.log('revive',owner,target,'本技能内保留 1 生命');}
     else if(fun==='AdditionSkill'||fun==='CounterSkill'||fun==='AddPinchSkill'){
      const actor=fun==='AddPinchSkill'?target:fun==='CounterSkill'&&f._auraSource?this.locate(f._auraSource):owner,kind=fun==='AddPinchSkill'?'pinch':fun==='CounterSkill'?'counter':'addition';
      const skill=f.FID?this.data.skills[f.FID]:kind==='pinch'?this.nativeFollowSkill(actor,'pinch'):this.data.skills[actor.normal],selected=kind==='counter'?action?.actor:action?.selected;
      if(actor&&!actor.dead&&skill&&selected)this.queues.push({actor,skill,selected,kind,main:false,priority:N(f.Priority,1)});else success=false;
     }
     else if(fun==='ReplaceSkill'){if(action&&this.data.skills[f.FID])action.replace=this.data.skills[f.FID];else success=false;}
     else if(fun==='BuffAttack')success=this.buffAttack(owner,target,action,f,ctx,val);
     else if(fun==='DirectHPValueHit')this.directDamage(owner,target,val,action,true);
     else if(fun==='AddEventHPDiff'){if(event){event.hpDiff=F(event.hpDiff+val);event.adjust=true;}else success=false;}
     else throw new T.Incomplete('未验证效果 '+fun+'（'+(f._origin||'')+'）');
     if(success){if(f.ContinueFun)this.execute(owner,{...f.ContinueFun,_origin:f._origin},action,target,event);for(const sub of f.ContinueFuns||[])this.execute(owner,{...sub,_origin:f._origin},action,target,event);}
    }
   }
   if(attempted){if(key&&cd>0)owner.funCooldowns[key]=owner.nowRound+cd;if(key&&gcd>=0)owner.globalFunCooldowns[key]=this.actionNumber+gcd;for(const sub of f.SubFuns||[])this.execute(owner,{...sub,_origin:f._origin},action,defaultTarget,event);}
   return attempted;
  }finally{this.functionDepth--;}
 };
 P.retargetAddition=function(spec){const u=spec.actor,index=u.card.skillSlots.indexOf(spec.skill.id),rules=(this.data.autoAI||[]).filter(r=>(u.card.ai||[]).includes(r.ID)&&N(r.SkillIndex)===index).sort((a,b)=>N(b.Priority)-N(a.Priority));for(const r of rules){const t=this.aiTarget(u,spec.skill,r,spec);if(t)return t;}return null;};
 P.skillAction=function(spec){
  if(!spec.actor||spec.actor.dead||!spec.skill)return null;
  const u=spec.actor,action={...spec,originalSkill:spec.skill,normal:spec.skill.id===u.normal,damage:0,damageByTarget:{},hitType:'normal',hitTypes:{},directTargets:[],immortalRoles:new Set()},previous=this.action;this.action=action;
  try{
   let rr=C.resolveSkill(u.card,action.skill.id,{imprint:u.imprint,ascend:0});this.requireKnown(rr.unsupported,'技能配置');
   for(const f of [...this.functions(u),...rr.functions.filter(x=>x._origin!==u.card.id)].filter(f=>f.Fun==='ReplaceSkill'))this.execute(u,f,action,action.selected);
   if(action.replace){action.skill=action.replace;rr=C.resolveSkill(u.card,action.skill.id,{imprint:u.imprint,ascend:0});}
   action.normal=action.originalSkill.id===u.normal||C.resolveSkill(u.card,action.originalSkill.id,{imprint:u.imprint}).functions.some(f=>f._property==='IsNormalSkill'&&flag(f._value));action.resolved=rr;action.functions=rr.functions;
   action.directTargets=this.skillTargets(u,action.skill,action.selected,action);if(!action.directTargets.length){this.log('skip',u,null,'没有有效技能目标');return action;}
   if(action.main){if(action.originalSkill.id!==u.normal&&N(action.originalSkill.raw.CoolDown)>0)u.cooldowns[action.originalSkill.id]=N(action.originalSkill.raw.CoolDown);u.uses[action.originalSkill.id]=N(u.uses[action.originalSkill.id])+1;}
   const current=rr.functions.filter(f=>!f._property&&f._origin!==u.card.id&&f.Fun!=='ReplaceSkill'),phase=(name)=>{for(const f of current.filter(f=>(f.Trigger||'AfterSkill')===name).sort((a,b)=>N(a.ParamOrder)-N(b.ParamOrder)))this.execute(u,f,action,action.selected);this.trigger(u,name,action);};
   u.state='beforeSkill';phase('BeforeSkill');this.allTrigger('AnyOneBeforeSkill',action);action.skillProperties=this.skillProperties(u,action,action.selected);this.processNaturalFollowups(action,'beforeDamage');
   this.log('action',u,action.selected,action.skill.name,{skill:action.skill.id,kind:action.kind,ownTurn:u.mainCount+1});if(u.camp===0)this.row.members[u.slot].actions.push({skill:action.skill.id,name:action.skill.name,kind:action.kind,time:this.time,globalAction:this.actionNumber});
   u.state='skilling';for(const target of action.directTargets)if(N(action.skill.raw.AttRate)>0)this.attack(u,target,action);
   u.state='afterSkill';phase('PreAfterSkill');phase('None');phase('AfterSkill');this.processNaturalFollowups(action,'afterDamage');
   for(const target of action.directTargets)this.trigger(target,'TargetAfterSkill',action);
   for(const other of this.units){if(other!==u&&other.camp===u.camp)this.trigger(other,'AnyAllyAfterSkill',action);if(other.camp!==u.camp)this.trigger(other,'AnyEnemyAfterSkill',action);if(action.main){if(other!==u&&other.camp===u.camp)this.trigger(other,'AnyAllyAfterMainSkill',action);if(other.camp!==u.camp)this.trigger(other,'AnyEnemyAfterMainSkill',action);}}
   u.state='none';for(const x of this.units)this.refresh(x,action);return action;
  }finally{this.action=previous;}
 };
}
root.GLSimulationRules={install};if(typeof module!=='undefined'&&module.exports)module.exports=root.GLSimulationRules;
})(typeof globalThis!=='undefined'?globalThis:this);
