/* 014517 原生复杂效果。RVA 与伪代码见 research/complex_effects_audit.md。 */
(function(root){'use strict';
const F=Math.fround, own=(x,k)=>Object.prototype.hasOwnProperty.call(x||{},k),
 num=(x,d=0)=>x===''||x===undefined||x===null?d:Number(x),
 truth=(x,d=false)=>x===''||x===undefined||x===null?d:x===true||x==='TRUE'||x==='1',
 clone=x=>JSON.parse(JSON.stringify(x));
function fail(message){const E=root.GLTimeline?.Incomplete||Error;throw new E('原生复杂效果：'+message);}
function roundEven(value){if(root.GLBattle?.roundEven)return root.GLBattle.roundEven(value);const lo=Math.floor(value),d=value-lo;return d<.5?lo:d>.5?lo+1:lo%2===0?lo:lo+1;}
function anti(u,key){return !!(u?.props?.[key]||(u?.immuneList||[]).includes(key));}
function statusRaw(sim,st){const s=sim.data.statuses[st.id];if(!s)fail('缺少状态定义 '+st.id);return s.raw||{};}
function inStart(sim,st,u){if(typeof sim.statusIsInStartRound==='function')return !!sim.statusIsInStartRound(st,u);return num(st.inSelfStartDisplayRound??st.InSelfStartDisplayRound,-1)===num(u.displayRound);}
function rounds(sim,st,u){if(typeof sim._nativeStatusRound==='function')return sim._nativeStatusRound(u,st);if(typeof sim.statusRounds==='function')return sim.statusRounds(st,u);const raw=statusRaw(sim,st);if(num(raw.RoundCount,1)<0)return -1;return Math.max(0,num(st.until)-num(truth(raw.IsReduceBeforeRound)?u.nowRound:u.displayRound));}
function canReceive(sim,u,st){const raw=statusRaw(sim,st),ty=raw.IsBuffType||'DeBuff';if(ty==='Buff'&&u.props?.SealBuff)return false;if(ty==='DeBuff'&&u.props?.SealDeBuff)return false;return true;}
function addClone(sim,owner,to,st,from,action){
 const until=num(st.until)-num(from.displayRound)-Number(inStart(sim,st,from))+num(to.nowRound),copy={...clone(st),source:owner.uid,until};
 if(typeof sim.addStatusClone==='function')return sim.addStatusClone(owner,to,copy,action);
 if(!canReceive(sim,to,st))return false;
 const before=new Map(to.statuses.map(s=>[s,{until:s.until,stack:s.stack}]));
 const success=sim.addStatus(owner,to,st.id,Math.max(1,until-num(to.nowRound)),st.value,action);
 if(!success)return false;
 const added=to.statuses.find(s=>!before.has(s));
 if(added){added.stack=num(st.stack,1);added.until=until;added.inSelfStartDisplayRound=num(st.inSelfStartDisplayRound??st.InSelfStartDisplayRound,-1);}
 else{const group=statusRaw(sim,st).Group||'';const merged=to.statuses.find(s=>(statusRaw(sim,s).Group||'')===group);if(merged)merged.until=Math.max(before.get(merged)?.until??merged.until,until);}
 sim.refresh(to);return true;
}
function resisted(sim,owner,target,f,action,ctx,ignoreImmune){if(typeof sim.effectResisted!=='function')fail('缺少统一 effectResisted 判定入口');return sim.effectResisted(owner,target,{...f,_nativeAntiChecked:true},action,{...ctx,target},ignoreImmune);}
function statusEvent(sim,owner,target,f,action,removed,added,apply,metadata={}){
 const event={damage:false,target,source:owner,hpDiff:num(metadata.hpDiff),removed:removed||[],added:added||[],nativeEvent:{eventFun:f.Fun,hitType:'NoHit',ordinaryHit:false,damageHit:false,...metadata}};
 if(typeof sim.trigger==='function')sim.trigger(target,'BeforeEvent',action,event);
 apply(event);sim.refresh(target);
 if(typeof sim.trigger==='function')sim.trigger(target,'AfterEvent',action,event);
}
function transfer(sim,owner,f,action,target,ctx,val){
 const kind=f.Fun,fromSetting=kind.endsWith('From'),debuff=kind==='TransferDeBuff'||kind==='TransferDeBuffFrom';
 let from,to;
 if(fromSetting){if(!f.FromSelect)return false;from=sim.select(owner,f.FromSelect,action,target)[0];to=target;}
 else if(debuff){from=owner;to=target;}else{from=target;to=owner;}
 if(!from||!to)return false;
 const key=[owner.uid,f.ID||'',f._origin||'',f._field||'',kind,from.uid].join('|');
 const cacheHost=action||ctx||f;cacheHost.transferCache=cacheHost.transferCache||{};
 let selected=cacheHost.transferCache[key];
 if(!selected){const candidates=from.statuses.filter(st=>{const raw=statusRaw(sim,st);return ((raw.IsBuffType||'DeBuff')==='DeBuff')===debuff&&!truth(raw.IsResident)&&!truth(raw.DeadResident)&&truth(raw.IsShowIcon,true);});const count=Math.max(0,Math.trunc(val));selected=count?candidates.slice(-count):[];}
 if(!selected.length)return false;
 // Native: TransferBuffFrom checks AntiTransferBuff on recipient, then resistance on donor.
 const antiTarget=kind==='TransferBuffFrom'?to:debuff?to:from;
 if(anti(antiTarget,debuff?'AntiTransferDeBuff':'AntiTransferBuff'))return false;
 const resistTarget=debuff?to:from;
 if(resisted(sim,owner,resistTarget,f,action,ctx,!debuff))return false;
 if(truth(f.IsTransferBuffRemove,true)&&!cacheHost.transferCache[key]){
  statusEvent(sim,owner,from,f,action,selected,[],()=>{from.statuses=from.statuses.filter(st=>!selected.includes(st));});
  cacheHost.transferCache[key]=selected;
  sim.log('status',owner,from,'转出状态',{removed:selected.map(s=>s.id),nativeFunction:kind});
 }
 // Native emits a successful transfer event even if each copied status is rejected by recipient immunity.
 let added=0;statusEvent(sim,owner,to,f,action,[],selected,()=>{for(const st of selected)if(canReceive(sim,to,st)&&addClone(sim,owner,to,st,from,action))added++;});
 sim.refresh(to);sim.log('status',owner,to,'转入状态',{transferred:selected.map(s=>s.id),added,nativeFunction:kind});return true;
}
function canRevive(sim,target){
 if(anti(target,'AntiCantRevive'))return true;
 if(target.dieOut||target.IsDieOut||target.props?.DieOut||target.props?.IsDieOut)return false;
 if(sim.alive(1-target.camp).some(u=>u.props?.EnemyCantRevive))return false;
 if(sim.alive().some(u=>u.props?.AllCantRevive))return false;
 return true;
}
function reviveNow(sim,item){
 const {owner,target,action,value,f}=item;if(!target||!target.dead)return false;
 if(item.queued?(target.dieOut||target.IsDieOut):!canRevive(sim,target))return false;
 statusEvent(sim,owner,target,f,action,[],[],event=>{target.hp=Math.max(0,Math.min(num(target.stats.MaxHP),roundEven(F(event.hpDiff))));target.dead=target.hp<=0;},{hpDiff:Math.trunc(value),hitType:'Revive'});
 if(target.hp>0)sim._nativeProcessedDeaths?.delete(target.uid);
 sim.refresh(target);sim.log('revive',owner,target,'复活',{hp:target.hp,funId:f.FID||'',nativeFunction:f.Fun});
 if(typeof sim.trigger==='function'){sim.trigger(target,'AfterRevive',action);if(!item.queued||owner!==target)sim.trigger(owner,'AfterRevive',action);}
 return true;
}
function splitDamage(sim,owner,f,action,target,event,ctx,val){
 const eventFun=event?.eventFun||event?.function||event?.nativeEvent?.eventFun;
 if(!event||!event.damage||event.split||event.isSplit||event.kind==='split'||eventFun==='SplitDamage'||eventFun==='SetHPRate')return false;
 if(f.IsAura&&target!==(ctx.auraSource||sim.locate(f._auraSource)))return false;
 if(!target||target===owner||target.dead||event.isSystemPunish||event.nativeEvent?.isSystemPunish)return false;
 const originalTarget=event.target;if(!originalTarget||originalTarget.props?.BeDamageNoSplit)return false;
 const source=event.source||action?.actor;
 if(source&&!originalTarget.isBoss){let noSplit=source.props?.NoSplitDamage||0;if(typeof sim.mathFunctions==='function'&&action?.skill){const a=sim.mathFunctions(source,originalTarget,action);noSplit=a.skillProps?.NoSplitDamage||noSplit;}if(noSplit>=1)return false;}
 const hpDiff=F(F(val)*F(event.hpDiff));if(!Number.isFinite(hpDiff))fail('分摊伤害非有限值');
 event.splits=event.splits||[];event.splits.push({target,source:owner,owner,originalSource:source,hpDiff,value:Math.max(0,-hpDiff),fraction:val,action,kind:'split',isSplit:true});return true;
}
function blast(sim,owner,f,action,target,ctx,val){
 if(!f.FID||!sim.data.statuses[f.FID])return false;const states=target.statuses.filter(s=>s.id===f.FID);if(!states.length)return false;
 const status=sim.data.statuses[f.FID],hasBuffAttack=(status.configs||[]).some(c=>c.key==='Fun'&&c.value?.Fun==='BuffAttack');
 sim.nativeComplexDamageQueue=sim.nativeComplexDamageQueue||[];
 sim.nativeComplexDamageQueue.push({owner,target,action,f,value:F(val),noDefence:!hasBuffAttack,statuses:[...states],kind:'blast'});
 statusEvent(sim,owner,target,{...f,Fun:(status.raw.IsBuffType||'DeBuff')==='Buff'?'RemoveBuf':'RemoveDeBuf'},action,states,[],()=>{target.statuses=target.statuses.filter(s=>!states.includes(s));},{hitType:'RemoveBuff'});
 sim.log('status',owner,target,'爆破并移除 '+(status.name||f.FID),{removed:states.map(s=>s.id),pendingDamage:F(val),nativeFunction:f.Fun});return true;
}
function removeDeathStates(sim,owner,target,states,action){
 if(!states.length)return;
 if(typeof sim.removeStatuses==='function')sim.removeStatuses(owner,target,s=>states.includes(s),-1,'死亡清理状态',action,{_nativeExpiration:true,_nativeContainerOnly:true});
 else{target.statuses=target.statuses.filter(s=>!states.includes(s));sim.refresh(target);}
}
function sourceDeathFlag(sim,st){
 // This getter reads StatusStaticData, not the instance's stack/value-scaled properties.
 const def=sim.data.statuses[st.id];if(!def)fail('缺少状态定义 '+st.id);
 const value=(def.configs||[]).filter(c=>c.key==='IsSourceDeadRemove').reduce((v,c)=>v+num(c.value),0);
 return value!==0;
}
function install(Simulation){
 if(!Simulation?.prototype)throw Error('GLNativeComplex.install 需要 Simulation class');
 const p=Simulation.prototype;if(p._nativeComplexInstalled)return Simulation;
 p.executeComplex=function(owner,f,action,target,event,ctx,val){let success;
  if(['TransferBuff','TransferBuffFrom','TransferDeBuff','TransferDeBuffFrom'].includes(f.Fun))success=transfer(this,owner,f,action,target,ctx,val);
  else if(f.Fun==='Revive'||f.Fun==='DirectRevive'){
   success=!!target?.dead&&canRevive(this,target);
   if(success){const item={owner,target,action,value:Math.trunc(val),f};if(f.Fun==='DirectRevive')success=reviveNow(this,item);else{this.reviveQueue=this.reviveQueue||[];this.reviveQueue.push({...item,queued:true});}}
  }else if(f.Fun==='SplitDamage')success=splitDamage(this,owner,f,action,target,event,ctx,val);
  else if(f.Fun==='DirectHPValueHit'){
   this.nativeComplexDamageQueue=this.nativeComplexDamageQueue||[];
   this.nativeComplexDamageQueue.push({owner,target,action,f,value:F(val),noDefence:true,statuses:[],kind:'directValue'});success=true;
  }
  else if(f.Fun==='BlastBuff'||f.Fun==='BlastBuffWithInjury'){
   if(f.Fun==='BlastBuffWithInjury')fail('当前卡池未引用 BlastBuffWithInjury，伤势路径尚未接入');
   success=blast(this,owner,f,action,target,ctx,val);
  }else return {handled:false,success:false};
  return {handled:true,success:!!success};
 };
 p.flushRevives=function(){const queue=this.reviveQueue||[];this.reviveQueue=[];queue.sort((a,b)=>num(b.f.ParamOrder)-num(a.f.ParamOrder));let successes=0;for(const item of queue)if(reviveNow(this,item))successes++;return successes;};
 p.flushComplexDamage=function(){const queue=this.nativeComplexDamageQueue||[];this.nativeComplexDamageQueue=[];for(const item of queue){if(typeof this.directDamage!=='function')fail('缺少 directDamage(owner,target,value,action,noDefence) 伤害入口');const damageCredit=item.kind==='blast'&&item.f._status?.source?this.locate(item.f._status.source)||item.owner:item.owner;this.directDamage(item.owner,item.target,item.value,item.action,item.noDefence,{kind:item.kind,sourceRole:null,nativeOwner:item.owner,damageCredit,statuses:item.statuses,eventFun:item.f.Fun,function:item.f.Fun});}return queue.length;};
 p.nativeBlastRoundValue=function(target,id){return target.statuses.filter(s=>s.id===id).reduce((total,st)=>F(total+F(F(st.value)*F(rounds(this,st,target)))),0);};
 p.processNativeSourceDeath=function(dead,action=this.action){
  // ProcessEvent calls this after SelfDead only if HP is still <1, before its AfterEvent.
  if(!dead||dead.hp>=1)return 0;let count=0;
  for(const target of this.units.filter(u=>u!==dead&&u.hp>0)){
   const states=target.statuses.filter(st=>st.source===dead.uid&&sourceDeathFlag(this,st));if(!states.length)continue;
   const buff=(statusRaw(this,states[0]).IsBuffType||'DeBuff')==='Buff';
   const mutate=()=>removeDeathStates(this,dead,target,states,action);
   if(typeof this.nativeStatusMutation==='function')this.nativeStatusMutation(dead,target,action,{eventFun:buff?'RemoveBuf':'RemoveDeBuf',eventFunValue:buff?5:4,hitType:'RemoveBuff',removedStatuses:states},mutate);
   else statusEvent(this,dead,target,{Fun:buff?'RemoveBuf':'RemoveDeBuf'},action,states,[],mutate,{eventFunValue:buff?5:4,hitType:'RemoveBuff'});
   count+=states.length;
  }
  return count;
 };
 p.processNativeDeaths=function(action=this.action){
  this._nativeProcessedDeaths=this._nativeProcessedDeaths||new Set();let count=0;
  for(const dead of [...this.units]){
   if(dead.hp>=1){this._nativeProcessedDeaths.delete(dead.uid);continue;}
   const states=dead.statuses.filter(st=>!truth(statusRaw(this,st).DeadResident));
   removeDeathStates(this,dead,dead,states,action);count+=states.length;
   if(this._nativeProcessedDeaths.has(dead.uid))continue;
   this._nativeProcessedDeaths.add(dead.uid);
   // Native dispatches OtherDeadAfter only after own statuses have been removed.
   const event={damage:false,target:dead,source:dead,hpDiff:0,nativeEvent:{eventFun:'DeadTip',ordinaryHit:false,damageHit:false}};
   for(const other of this.units.filter(u=>u.hp>0))this.trigger(other,'OtherDeadAfter',action,event);
  }
  return count;
 };
 p._nativeComplexInstalled=true;return Simulation;
}
const API={install,canRevive,rounds};root.GLNativeComplex=API;if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof globalThis!=='undefined'?globalThis:this);
