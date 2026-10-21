/* 014517 原生行动调度。证据与地址见 research/round_schedule_audit.md。 */
(function(root){'use strict';
const F=Math.fround,N=(x,d=0)=>x===undefined||x===null||x===''?d:Number(x);
function fail(message){const E=root.GLTimeline?.Incomplete||Error;throw new E(message);}
function list(v){return Array.isArray(v)?v:v instanceof Set?[...v]:v===undefined||v===null?[]:String(v).split('~').filter(Boolean);}
function actionType(a){return a?.actionType??(a?.main?0:({counter:1,pinch:2,addition:3,buff:4,system:5,additionDamage:6,continue:7}[a?.kind]??null));}
function install(Simulation){
 const P=Simulation.prototype,C=root.GLConfig;
 if(P._nativeTurnsInstalled)return;
 P._nativeTurnsInstalled=true;
 P.nativePropertyList=function(u,key){
  const out=list(u.props?.[key]);
  for(const f of this.ownFunctions(u))if(f._property===key)out.push(...list(f._value));
  for(const s of u.statuses){const p=C.nativeStatusProperties({...s,def:this.data.statuses[s.id]});out.push(...list(p.lists?.[key]));}
  return [...new Set(out.map(String))];
 };
 P.nativeAntiFun=function(u,number,name){const xs=this.nativePropertyList(u,'AntiFun');return xs.includes(String(number))||xs.includes(name);};
 P.nativeMainCooldownSkills=function(u){
  // SkillContainer.GetAllMainCoolDownSkills 0x234B7A8 skips index 0,
  // then requires Active and a false static IsNormalSkill property (139).
  return u.skills.slice(1).filter(id=>{
   const skill=this.data.skills[id];if(!skill||!['',undefined,'Active',0,'0'].includes(skill.raw.SkillType))return false;
   return !(skill.configs||[]).some(c=>c.key==='IsNormalSkill'&&['TRUE','true',true,1,'1'].includes(c.value));
  });
 };
 P.nativeSkillFlag=function(action,key){
  if(action.skillProperties&&Object.prototype.hasOwnProperty.call(action.skillProperties,key))return N(action.skillProperties[key]);
  const u=action.actor,rr=C.resolveSkill(u.card,action.skill.id,{imprint:u.imprint,ascend:0});
  let v=N(u.props[key]);
  for(const f of rr.functions){
   if(f._origin===u.card.id)continue;
   if(f._property===key)v=F(v+N(f._value));
   else if(f.Trigger==='SkillProperty'&&f.Property===key)fail('条件性技能属性 '+key+' 尚未提供原生合并值');
  }
  return v;
 };
 P.nativeFollowSkill=function(u,kind){
  if(kind==='pinch'){
   // 0x2346898 仅读 RoleStaticData 的 PinchSkill，不读状态覆盖。
   const sid=(u.card.configs||[]).find(x=>x.key==='PinchSkill')?.value;
   return sid&&this.data.skills[sid]||this.data.skills[u.normal];
  }
  const explicit=this.nativePropertyList(u,'CounterSkill')[0];
  if(explicit&&u.skills.includes(explicit))return this.data.skills[explicit];
  if(N(u.props.ReplaceCounterSkill)>0)fail('ReplaceCounterSkill 的被动反击技能选择尚未完整核验');
  return this.data.skills[u.normal];
 };
 P.nextActor=function(){
  // 额外回合优先FIFO；不清原条，也不推进其他人的条。
  while(this.extraRounds.length){const u=this.locate(this.extraRounds.shift());if(u&&!u.dead)return u;}
  const roles=this.alive();let chosen=null,dt=Infinity;
  for(const u of roles){const p=F(u.progress),speed=F(u.stats.Speed),t=p>1?F(1-p):F(F(1-p)/(speed===0?F(1e-4):speed));if(!Number.isFinite(t))fail('行动条出现非有限值：'+u.card.name);if(t<dt){dt=t;chosen=u;}}
  if(!chosen)return null;
  if(dt>0){for(const u of roles)u.progress=F(F(u.progress)+F(F(u.stats.Speed)*dt));this.time+=dt;}
  chosen.progress=0;return chosen;
 };
 P.processNaturalFollowups=function(action,phase){
  if(!['beforeDamage','afterDamage'].includes(phase))fail('天然协战/反击必须在 beforeDamage、afterDamage 两阶段分别调用');
  if(actionType(action)!==0||!action.selected||action.actor.camp===action.selected.camp||(action.skill.raw.TargetCamp||'Enemy')!=='Enemy')return;
  const actor=action.actor;
  if(phase==='beforeDamage'){
   if(action._nativePinchChecked)return;action._nativePinchChecked=true;
   // 协战入口比较替换后的实际ID；不沿用条件版旧普攻身份。
   if(action.skill.id!==actor.normal||this.nativeSkillFlag(action,'NoPinch')>=1)return;
   for(const candidate of this.units.filter(u=>u.camp===actor.camp)){
    if(candidate===actor||this.nativeAntiFun(candidate,28,'AddPinchSkill'))continue;
    const draw=this.random(); // 原生先抽样，之后才检查HP/WillPassRound。
    if(candidate.hp<=0||this.willPass(candidate)||N(candidate.stats.PinchRate)<draw)continue;
    const skill=this.nativeFollowSkill(candidate,'pinch');if(!skill)fail('协战来源缺少首技能：'+candidate.card.name);
    this.queues.push({actor:candidate,skill,selected:action.selected,kind:'pinch',main:false,actionType:2,priority:1});
    break;
   }
   return;
  }
  if(action._nativeCounterChecked)return;action._nativeCounterChecked=true;
  if(!C.isDamageHit(action.skill)||this.nativeSkillFlag(action,'NoCounter')>0)return;
  this._nativeCounterSources=this._nativeCounterSources||new Set();
  for(const q of this.queues)if(q.kind==='counter')this._nativeCounterSources.add(q.actor.uid);
  for(const target of action.directTargets||[]){
   if(target.dead||target.hp<=0||this.willPass(target)||this.nativeAntiFun(target,9,'AddCounterSkill')||this._nativeCounterSources.has(target.uid))continue;
   if(this.random()>N(target.props.CounterRate))continue;
   const skill=this.nativeFollowSkill(target,'counter');if(!skill)fail('反击来源缺少首技能：'+target.card.name);
   this.queues.push({actor:target,skill,selected:actor,kind:'counter',main:false,actionType:1,priority:1});
   this._nativeCounterSources.add(target.uid);
  }
 };
 P.nativeExecuteAddition=function(spec,canRetarget){
  const u=spec.actor;if(!u||u.dead||this.willPass(u))return;
  if(spec.kind==='counter'&&N(u.props.RoleNoCounter))return;
  if(spec.kind==='pinch'&&N(u.props.RoleNoPinch))return;
  if(u!==this.nowRoundRole&&['continue','addition'].includes(spec.kind)&&u.statuses.some(s=>this.data.statuses[s.id]?.raw.Group==='Suppress'))return;
  if(canRetarget&&spec.selected?.dead){
   if(typeof this.retargetAddition!=='function')fail('追加技能目标已死亡，尚未接入固定原技能索引的原生AI重选');
   const target=this.retargetAddition(spec);if(!target||target.dead)return;spec={...spec,selected:target};
  }
  if(!spec.skill)fail('追加动作缺少技能定义');
  this.skillAction({...spec,main:false,actionType:actionType(spec)});
 };
 P.followups=function(){
  this._nativeCounterSources=this._nativeCounterSources||new Set();
  for(let batch=0;batch<10&&this.queues.length;batch++){
   const snapshot=this.queues.slice();this.queues=[];
   for(const s of snapshot){if(!['continue','pinch','counter','addition'].includes(s.kind))fail('未验证的追加动作类型 '+s.kind);if(s.kind==='counter')this._nativeCounterSources.add(s.actor.uid);}
   for(const s of snapshot.filter(x=>x.kind==='continue'))this.nativeExecuteAddition(s,false);
   const pinch=snapshot.filter(x=>x.kind==='pinch').map((s,i)=>({s,i})).sort((a,b)=>N(b.s.priority,1)-N(a.s.priority,1)||a.i-b.i)[0];
   if(pinch)this.nativeExecuteAddition(pinch.s,false);
   for(const s of snapshot.filter(x=>x.kind==='counter'))this.nativeExecuteAddition(s,false);
   // 当前伤害入口已同步应用死亡；若以后拆为原生死亡队列，此处接显式hook。
   if(typeof this.processNativeDeaths==='function')this.processNativeDeaths();
   for(const s of snapshot.filter(x=>x.kind==='addition'))this.nativeExecuteAddition(s,true);
  }
  if(this.queues.length)fail('追加技能超过原生10批次上限，未把剩余动作计入总伤害');
 };
 P.nativeAfterRoundSkill=function(u,action){
  if(!action)return;const rr=C.resolveSkill(u.card,action.skill.id,{imprint:u.imprint,ascend:0});
  for(const f of rr.functions.filter(f=>!f._property&&f._origin!==u.card.id&&f.Trigger==='AfterRound'))this.execute(u,f,action,action.selected);
  this.trigger(u,'AfterRound',action);
 };
 P.step=function(){
  const u=this.nextActor();if(!u)return false;
  this.actionNumber++;this.nowRoundRole=u;this._nativeCounterSources=new Set();
  for(const other of this.units)this.refresh(other); // 原生select之后重算全体。
  const generic={actor:u,skill:{id:'',raw:{AttRate:'0'}},main:false,kind:'system',actionType:5,normal:false,selected:u,directTargets:[]};
  this.action=generic;
  for(const other of [...this.units])this.trigger(other,'AnyOneBeforeRound',generic);
  this.trigger(u,'BeforeRound',generic);
  u.nowRound++;u.state='beforeRound';
  this.tickStatuses(u,generic); // 状态模块协议：开始DOT/AfterBuffRound及提前到期清理。
  if(typeof this.flushComplexDamage==='function')this.flushComplexDamage(generic);
  if(typeof this.processNativeDeaths==='function')this.processNativeDeaths();
  if(typeof this.flushRevives==='function')this.flushRevives(generic);
  if(this.queues.length)fail('回合开始阶段产生追加技能，独立原生上下文队列处理尚未核验');
  let mainAction=null;
  if(u.dead||this.willPass(u))this.log('skip',u,u,u.dead?'回合开始伤害导致倒下':'控制状态跳过行动');
  else{
   const chosen=this.choose(u);
   if(chosen.skill){mainAction=this.skillAction({actor:u,skill:chosen.skill,selected:chosen.selected,main:true,kind:'main',actionType:0});if(!mainAction)fail('skillAction 必须返回完整主动作，不能用空技能替代回合结束上下文');}
   else if(!u.passiveDummy)this.log('skip',u,u,'按方案停手或没有有效技能');
  }
  if(mainAction){
   for(const other of [...this.units])if(other!==u)this.trigger(other,'AfterOtherSkill',mainAction);
   this.followups();
  }
  this._nativeCounterSources=new Set();
  if(typeof this.processNativeDeaths==='function')this.processNativeDeaths();
  u.displayRound++;u.state='none';
  for(const id of Object.keys(u.cooldowns)){const cd=N(u.cooldowns[id])-1;if(cd>0)u.cooldowns[id]=cd;else delete u.cooldowns[id];}
  // 函数CD/GCD是until阈值，绝不能在此统一递减。
  this.action=mainAction||generic;
  this.nativeAfterRoundSkill(u,mainAction);
  const endAction=mainAction||generic;
  for(const other of [...this.units]){
   this.trigger(other,'AnyOneAfterRound',endAction);
   if(other!==u){this.trigger(other,other.camp===u.camp?'AnyAllyAfterRound':'AnyEnemyAfterRound',endAction);this.trigger(other,'AnyOtherAfterRound',endAction);}
  }
  if(typeof this.flushComplexDamage==='function')this.flushComplexDamage(endAction);
  if(typeof this.processNativeDeaths==='function')this.processNativeDeaths();
  if(typeof this.flushRevives==='function')this.flushRevives(endAction);
  this.tickStatuses(u,{...endAction,statusPhase:'after'});
  if(this.queues.length)fail('回合结束阶段产生追加技能，原生阶段队列处理尚未核验');
  u.mainCount++;
  if(u.camp===0){this.rowActions.add(u.uid);this.row.mainActions++;}
  for(const other of this.units)this.refresh(other);
  if(!this.alive(0).length)this.result='defeat';else if(!this.alive(1).length)this.result='victory';
  const living=this.alive(0);if(living.length&&living.every(r=>this.rowActions.has(r.uid)))this.finishRow();
  this.action=null;return this.result==='running';
 };
}
const API={install,actionType};root.GLNativeTurns=API;if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof globalThis!=='undefined'?globalThis:this);
