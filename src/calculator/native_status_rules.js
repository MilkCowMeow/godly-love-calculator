/* 014517 状态规则。RVA 与推导见 research/status_turns_audit.md。 */
(function(root){'use strict';
const F=Math.fround;
const number=(x,d=0)=>x===undefined||x===null||x===''?d:Number(x);
const flag=(x,d=false)=>x===undefined||x===null||x===''?d:x===true||x==='TRUE'||x==='1'||x===1;
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function incomplete(message){const E=root.GLTimeline?.Incomplete;if(E)throw new E(message);const e=new Error(message);e.name='Incomplete';throw e;}
function finite(x,label){x=Number(x);if(!Number.isFinite(x))incomplete(label+'不是有限数');return x;}
const rules={
 _nativeStatusDefinition(id){const def=this.data.statuses[id];if(!def)incomplete('缺少状态定义 '+id);return def;},
 _nativeStatusProperties(instance){const r=root.GLConfig.nativeStatusProperties({...instance,def:this._nativeStatusDefinition(instance.id)});this.requireKnown(r.unsupported.filter(x=>!['状态字符串属性尚未解释：BuffStackReplace','状态字符串属性尚未解释：AntiBuffGs','状态字符串属性尚未解释：AI'].includes(x)),'原生状态属性');return r;},
 _nativeStatusFunction(action,provided){return provided||action?.functionInfo||action?.nativeFunction||{};},
 _nativeHasStatus(u,s){return u.statuses.some(x=>x.id===s.id&&x.until===s.until&&F(x.value)===F(s.value)&&x.source===s.source);},
 _nativeStatusRound(u,s){const raw=this._nativeStatusDefinition(s.id).raw;if(number(raw.RoundCount,1)<0)return -1;return Math.max(0,s.until-(flag(raw.IsReduceBeforeRound)?u.nowRound:u.displayRound));},
 _nativeSyncStatusRounds(u){for(const s of u.statuses)s.rounds=this._nativeStatusRound(u,s);},
 _nativeRequireDamageAPI(){if(this.nativeDamageEvents!==true)incomplete('状态结算需要 applyDamage 原生事件接口（nativeDamageEvents）');},
 _nativeSourceStatusEvent(phase,owner,target,action,event){
  // ProcessSourceBeforeEvent 0x23830F8 / ProcessSourceAfterEvent 0x23830FC 均仅 ret。
  // 保留显式调用位置，不人为执行 SourceBeforeEvent / SourceAfterEvent 配置。
  return event;
 },
 nativeStatusMutation(owner,target,action,spec,mutate){
  if((this._nativeStatusMutationDepth||0)>=80)incomplete('状态事件链超过核验上限');
  this._nativeStatusMutationDepth=(this._nativeStatusMutationDepth||0)+1;
  const event={damage:false,target,source:owner,hpDiff:0,beforeHP:target.hp,eventFun:spec.eventFun||'No',eventFunValue:number(spec.eventFunValue),newStatuses:spec.newStatuses||[],removedStatuses:spec.removedStatuses||[],nativeEvent:{damageHit:false,ordinaryHit:false,eventFun:spec.eventFun||'No',eventFunValue:number(spec.eventFunValue),hitType:spec.hitType||'NoHit',sourceRole:owner,statusMutation:true}};
  try{
   this.trigger(target,'BeforeEvent',action,event);
   if(owner)this._nativeSourceStatusEvent('SourceBeforeEvent',owner,target,action,event);
   // 当前 583 技能 / 97 状态没有能把该事件的 0 HP 差改成非零的配置。
   // 这类额外注入不能绕过死亡、保命、伤势桥接后擅自入账。
   if(F(event.hpDiff)!==0)incomplete('状态变动事件产生非零生命变化，尚未接入对应原生回写');
   const result=mutate(event);
   event.afterHP=target.hp;
   this.trigger(target,'AfterEvent',action,event);
   if(owner)this._nativeSourceStatusEvent('SourceAfterEvent',owner,target,action,event);
   if(target.hp>0)this.refresh(target);
   return result;
  }finally{this._nativeStatusMutationDepth--;}
 },

 addStatus(owner,target,id,rounds,value,action,customValue){
  const def=this._nativeStatusDefinition(id),raw=def.raw,type=raw.IsBuffType||'DeBuff';
  // 施加抗性/具体状态免疫由 execute 统一检查；此处处理结构门槛。
  if(type==='Buff'&&target.props.SealBuff||type==='DeBuff'&&target.props.SealDeBuff)return false;
  const shown=flag(raw.IsShowIcon,true),maxShown=number(this.data.publicVariables?.BattleRoleMaxStatusCount,10);
  if(shown&&target.statuses.filter(s=>flag(this._nativeStatusDefinition(s.id).raw.IsShowIcon,true)).length>=maxShown)return false;
  const duration=number(rounds)>=1?Math.trunc(number(rounds)):number(raw.RoundCount,1);
  const before=target.ownerBeforeSkill===undefined?['beforeRound','beforeSkill'].includes(target.state):!!target.ownerBeforeSkill;
  let until=target.nowRound+duration;
  if(before&&!flag(raw.IsReduceBeforeRound))until--;
  const incoming={id,source:owner.uid,stack:1,value:F(finite(customValue===undefined?number(value,number(raw.Value)):customValue,'状态值')),until,rounds:duration,inSelfStartDisplayRound:!before&&target.nowRound!==target.displayRound?target.displayRound:-1};
  return this.nativeStatusMutation(owner,target,action,{eventFun:'AddStatus',eventFunValue:1,hitType:'Buff',newStatuses:[incoming]},()=>this._nativeAddPreparedStatus(owner,target,incoming,action));
 },

 _nativeAddPreparedStatus(owner,target,incoming,action){
  const id=incoming.id,def=this._nativeStatusDefinition(id),raw=def.raw;
  const shown=flag(raw.IsShowIcon,true),maxShown=number(this.data.publicVariables?.BattleRoleMaxStatusCount,10);
  if(shown&&target.statuses.filter(s=>flag(this._nativeStatusDefinition(s.id).raw.IsShowIcon,true)).length>=maxShown)return false;
  const group=raw.Group||'',old=flag(raw.CanMerge,true)?target.statuses.find(s=>(this._nativeStatusDefinition(s.id).raw.Group||'')===group):null;
  let st;
  if(old){
   const oldRaw=this._nativeStatusDefinition(old.id).raw,oldStack=number(old.stack,1);
   if(oldStack+1<=number(oldRaw.MaxStack))old.stack=oldStack+1;
   else old.stack=oldStack;
   old.value=F(Math.max(old.value,incoming.value));
   old.until=Math.max(old.until,incoming.until); // Merge 不读取 CanUpdateRound。
   old.source=incoming.source;
   if(number(raw.Level)>number(oldRaw.Level))old.id=id;
   else {
    const replace=this._nativeStatusProperties(incoming).lists?.BuffStackReplace||def.configs.filter(c=>c.key==='BuffStackReplace').flatMap(c=>Array.isArray(c.value)?c.value:String(c.value).split('~'));
    if(replace.length&&old.stack-1<replace.length){const next=replace[old.stack-1];this._nativeStatusDefinition(next);old.id=next;}
   }
   st=old;
  }else {st={...incoming,serial:++this.statusSerial};target.statuses.push(st);}
  // 原生 ProessAddStatusFunction 对新传入实例（并非合并后的旧实例）执行 AddTime 属性。
  const immediate=this._nativeStatusProperties(incoming).properties.AddTime;
  if(immediate!==undefined)target.progress=F(Math.max(0,F(target.progress+immediate)));
  this._nativeSyncStatusRounds(target);this.refresh(target);
  this.log('status',owner,target,'附加 '+(def.name||id),{status:id,merged:!!old,stack:st.stack,value:st.value,until:st.until});
  return true;
 },

 addStatusClone(owner,target,st,action){
  const incoming={...st},def=this._nativeStatusDefinition(incoming.id),raw=def.raw,type=raw.IsBuffType||'DeBuff';
  if(type==='Buff'&&target.props.SealBuff||type==='DeBuff'&&target.props.SealDeBuff)return false;
  const p=this._nativeStatusProperties(incoming).properties;
  // 0x238335C 原生此列表不含 Dizzy；不能按状态名称补造分支。
  const immunities={Sleep:'AntiSleep',Taunt:'AntiTaunt',Restrict:'AntiRestrict',Silence:'AntiSilence',Brand:'AntiBrand',ReduceSpeed:'AntiReduceSpeed',Poison:'AntiPoison',Burn:'AntiBurn',Bleed:'AntiBleed',EnemyCantRevive:'AntiCantRevive'};
  for(const [property,anti] of Object.entries(immunities))if(p[property]&&(target.props[anti]||target.immuneList?.includes(anti)))return false;
  const groups=[...(target.immuneGroups||[])];
  for(const entry of target.global||[])if(entry._property==='AntiBuffGs')groups.push(...String(entry._value).split('~'));
  for(const instance of target.statuses)groups.push(...(this._nativeStatusProperties(instance).lists.AntiBuffGs||[]));
  if(groups.includes(raw.Group))return false;
  incoming.stack=number(incoming.stack,1);incoming.value=F(finite(incoming.value,'转移状态值'));
  finite(incoming.until,'转移状态期限');
  return this._nativeAddPreparedStatus(owner,target,incoming,action);
 },

 removeStatuses(owner,target,filter,count,kind,action,provided){
  const f=this._nativeStatusFunction(action,provided),expiration=!!f._nativeExpiration;
  let candidates=target.statuses.filter(filter);
  if(!expiration)candidates=candidates.filter(s=>!flag(this._nativeStatusDefinition(s.id).raw.IsResident)||flag(f.AbsoluteRemoveBuff));
  if(!candidates.length)return [];
  if(!expiration&&(f.Fun==='RemoveBuf'||kind==='驱散增益')&&!f._resistChecked){
   if(typeof this.nativeEffectResisted!=='function')incomplete('驱散需要已核验的原生效果抵抗接口');
   const ctx=this.context(owner,target,action,f.Trigger||'AfterSkill',f._status);
   if(this.nativeEffectResisted(owner,target,f,action,ctx,{ignoreImmune:true}))return [];
  }
  const n=count===-1?candidates.length:Math.max(0,Math.trunc(finite(count,'移除数量'))),selected=candidates.slice(0,n);
  if(!selected.length)return [];
  const mutate=()=>{
   target.OldBuffCount=target.buffCount;
   target.statuses=target.statuses.filter(s=>!selected.includes(s));
   target.LastRemoveDebuffCount=selected.filter(s=>this.statusType(s)==='DeBuff').length;
   this._nativeSyncStatusRounds(target);this.refresh(target);
   this.log('status',owner,target,kind,{removed:selected.map(s=>s.id)});
   return selected;
  };
  if(f._nativeContainerOnly)return mutate();
  const firstIsBuff=this.statusType(selected[0])==='Buff';
  return this.nativeStatusMutation(owner,target,action,{eventFun:expiration?'No':firstIsBuff?'RemoveBuf':'RemoveDeBuf',eventFunValue:expiration?0:firstIsBuff?5:4,hitType:expiration?'NoHit':'RemoveBuff',removedStatuses:selected},mutate);
 },

 tickStatuses(u,action={}){
  const after=action.statusPhase==='after';
  if(!after&&!u.dead){
   // 每个阶段取各自的快照；第一阶段中的新状态可参与第二阶段。
   for(const trigger of ['BuffRound','AfterBuffRound'])for(const s of [...u.statuses]){
    if(!this._nativeHasStatus(u,s))continue;
    const def=this._nativeStatusDefinition(s.id),properties=this._nativeStatusProperties(s);
    const functions=properties.functions||def.configs.filter(c=>c.key==='Fun').map(c=>c.value);
    for(const rawFun of functions){
     if(rawFun.Trigger!==trigger)continue;
     const f={...rawFun,_origin:s.id,_field:rawFun._field||trigger,_status:s};
     const statusAction={...action,actor:u,skill:{id:'',raw:{AttRate:'0',TargetType:'One'}},status:s,kind:'status',main:false,normal:false,hitType:'normal',selected:u,directTargets:[]};
     this.execute(u,f,statusAction,u);
    }
   }
  }
  const expired=s=>{
   const raw=this._nativeStatusDefinition(s.id).raw;
   if(after&&u.dead)return !flag(raw.DeadResident);
   return number(raw.RoundCount,1)>=0&&u.nowRound>=s.until&&(after||flag(raw.IsReduceBeforeRound));
  };
  this.removeStatuses(u,u,expired,-1,after?'行动后状态到期':'行动前状态到期',action,{_nativeExpiration:true,_nativeContainerOnly:after&&u.dead});
  this._nativeSyncStatusRounds(u);this.refresh(u);
 },

 heal(owner,target,value,action,provided,providedContext){
  const f=this._nativeStatusFunction(action,provided),ctx=providedContext||this.context(owner,target,action,f.Trigger||'AfterSkill',f._status);
  let amount=Math.trunc(F(finite(value,'生命变化')));
  if(amount>0&&target.props.SealHeal){this.log('heal',owner,target,'封愈阻止治疗',{heal:0});return false;}
  if(amount<0&&flag(f.CantAddToDie)&&amount+target.hp<0)amount=1-target.hp;
  const withInjury=f.Fun==='AddHPWithInjury';
  if(withInjury&&!this.nativeInjuryEvents)incomplete('AddHPWithInjury 的原生伤势回写尚未接入');
  const nativeEvent={eventFun:withInjury?'AddHPWithInjury':'AddHP',hitType:amount<0?'HPChange':'NoHit',ordinaryHit:false,damageHit:false,bypassInvincible:true,bypassShield:true,sourceRole:owner,withInjury};
  const ev={damage:false,target,source:owner,hpDiff:amount,nativeEvent};
  this.trigger(target,'BeforeEvent',action,ev);this._nativeSourceStatusEvent('SourceBeforeEvent',owner,target,action,ev);
  amount=root.GLBattle.roundEven(F(ev.hpDiff));
  if(amount<0){
   this._nativeRequireDamageAPI();
   const source=f._status?.source?this.locate(f._status.source)||owner:owner;
   const result=this.applyDamage(source,target,action,{damage:-amount,beforeShield:-amount,absorbed:0,remainingShield:0,nativeEvent},'dot',null);
   this._nativeSourceStatusEvent('SourceAfterEvent',owner,target,action,result);
   return true;
  }
  const actual=target.unlimited?0:Math.max(0,Math.min(amount,target.stats.MaxHP-target.hp));
  target.hp+=actual;this.refresh(target);
  if(owner.camp===0)this.row.members[owner.slot].heal+=actual;
  this.log('heal',owner,target,'恢复生命',{heal:actual,hp:target.unlimited?null:target.hp});
  this.trigger(target,'AfterEvent',action,{...ev,hpDiff:actual});
  this._nativeSourceStatusEvent('SourceAfterEvent',owner,target,action,{...ev,hpDiff:actual});
  return true;
 },

 buffAttack(owner,target,action,f,ctx,val){
  this._nativeRequireDamageAPI();
  const instance=f?._status||ctx?.buffInstance||action?.status;
  if(!instance)incomplete('BuffAttack 缺少原生状态实例');
  const stored=F(finite(instance.value,'BuffAttack 状态快照值'));
  // 0x22FE930：普通状态参数没有 SkillData，因此不进入 BuffAttackRate 技能分支。
  if(ctx?.statusSkillData)incomplete('带 SkillData 的 BuffAttackRate 分支尚未接入');
  const publicVars=this.data.publicVariables||{},power=F(number(publicVars.AttackPowerRate,1.871)),constant=F(number(publicVars.BattleAttackDefenceConstant,2000));
  this.refresh(target);
  const ev={damage:true,target,source:null,hpDiff:0,nativeEvent:{eventFun:'BuffAttack',hitType:'BuffHit',ordinaryHit:false,damageHit:true,sourceRole:null,creditSource:instance.source,preSettled:true}};
  const incomingCtx=this.context(target,target,action,'BeforeEvent',instance,ev);
  incomingCtx.triggerSource=null;incomingCtx.useFunRole=target;incomingCtx.source=target;incomingCtx.target=target;
  // 标量 getter 只检查条件，不按触发时点筛选转换器；排除无关 ValueConvert 等。
  const relevant=this.functions(target).filter(x=>x.DefenceRate||x.HurtReduction).map(x=>({Trigger:'AfterSkill',DefenceRate:x.DefenceRate,HurtReduction:x.HurtReduction,PreCond:x.PreCond,Condition:x.Condition,Conditions:x.Conditions,_origin:x._origin,_field:x._field}));
  const analysis=root.GLConfig.analyzeFunctions(relevant,incomingCtx);this.requireKnown(analysis.unsupported,'持续伤害防御与减伤');
  const defenceRate=F(1+(analysis.sums.DefenceRate||0));
  let defence=F(defenceRate*F(Math.trunc(target.stats.Defence)));
  defence=F(defence*F(.3));
  const denominator=F(1+F(defence/constant));
  let damage=F(F(stored*power)/denominator);
  const reduction=root.GLBattle.reduction({hurtReductions:(analysis.valueLists.HurtReduction||[]).filter(Number.isFinite),runtimeHurtReduction:target.props.HurtReductionRate||0,ignoreHurtReduction:!!target.props.IgnoreBeHurtReduction});
  damage=F(damage*reduction.multiplier);ev.hpDiff=F(-damage);
  this.trigger(target,'BeforeEvent',{...action,triggerSource:null},ev);
  const signedHP=root.GLBattle.roundEven(F(ev.hpDiff));
  let finalHP=signedHP;
  damage=Math.max(0,-signedHP);
  const shield=target.statuses.find(s=>this._nativeStatusProperties(s).flags.shield);
  let absorbed=0,remainingShield=shield?.value||0;
  if(target.props.Invincible){damage=0;finalHP=0;}
  else if(shield&&signedHP>=0){remainingShield=F(shield.value+signedHP);damage=0;finalHP=0;}
  else if(shield&&damage>0){
   if(shield.value<damage){absorbed=root.GLBattle.roundEven(shield.value);damage-=absorbed;remainingShield=0;}
   else {absorbed=damage;remainingShield=F(shield.value-damage);damage=0;}
   finalHP=-damage;
  }
  ev.nativeEvent.hpDiff=finalHP;
  const source=this.locate(instance.source)||owner;
  const settled={damage,beforeShield:-root.GLBattle.roundEven(F(ev.hpDiff)),floatBeforeShield:F(-ev.hpDiff),absorbed,remainingShield,denominator,reduction,nativeEvent:ev.nativeEvent};
  this.applyDamage(source,target,action,settled,'dot',shield);
  return true;
 }
};
function install(Simulation){if(typeof Simulation!=='function')throw new TypeError('需要 Simulation 类');Object.assign(Simulation.prototype,rules);return Simulation;}
const api={install,rules};root.GLNativeStatus=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
