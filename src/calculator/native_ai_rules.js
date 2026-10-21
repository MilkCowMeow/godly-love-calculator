/* 014517 原生 AI；地址、边界见 research/native_ai_audit.md。 */
(function(root){'use strict';
const N=(v,d=0)=>v===undefined||v===null||v===''?d:Number(v),F=Math.fround;
const flag=v=>v===true||v===1||v==='1'||v==='TRUE';
function fail(s){throw new (root.GLTimeline?.Incomplete||Error)(s);}
const cache=new WeakMap();
// 原表的 JSON5 子集：对象、数组、单双引号、未引号键、数值及布尔。不执行文本。
function parse(v){
 if(v===undefined||v===null||v==='')return null;if(typeof v!=='string')return v;
 let i=0;const s=v,ws=()=>{while(/\s/.test(s[i]||'')&&i<s.length)i++;};
 function str(){const q=s[i++];let z='';while(i<s.length){let c=s[i++];if(c===q)return z;if(c==='\\'){c=s[i++];if(c==='u'){const h=s.slice(i,i+4);if(!/^[a-fA-F0-9]{4}$/.test(h))fail('AI 配置转义不合法');z+=String.fromCharCode(parseInt(h,16));i+=4;}else z+=({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'}[c]??c);}else z+=c;}fail('AI 配置字符串未闭合');}
 function value(){ws();let c=s[i];if(c==='"'||c==="'")return str();if(c==='{'){i++;const o={};ws();while(s[i]!=='}'){ws();const m=/^[A-Za-z_$][A-Za-z0-9_$]*/.exec(s.slice(i)),k=s[i]==='"'||s[i]==="'"?str():m?(i+=m[0].length,m[0]):fail('AI 配置键不合法');if(['__proto__','prototype','constructor'].includes(k))fail('AI 配置键不允许');ws();if(s[i++]!==':')fail('AI 配置缺少冒号');o[k]=value();ws();if(s[i]===','){i++;ws();continue;}if(s[i]!=='}')fail('AI 配置缺少逗号');}i++;return o;}if(c==='['){i++;const a=[];ws();while(s[i]!==']'){a.push(value());ws();if(s[i]===','){i++;ws();continue;}if(s[i]!==']')fail('AI 配置数组缺少逗号');}i++;return a;}const m=/^(?:-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|true|false|null)/i.exec(s.slice(i));if(!m)fail('AI 配置值未识别');i+=m[0].length;return m[0]==='true'?true:m[0]==='false'?false:m[0]==='null'?null:Number(m[0]);}
 const out=value();ws();if(i!==s.length)fail('AI 配置含多余内容');return out;
}
function normalize(r){if(cache.has(r))return cache.get(r);const a={...r,conditions:Array.isArray(r.conditions)?r.conditions.map(parse).filter(Boolean):[1,2,3].map(i=>parse(r['Condition'+i])).filter(Boolean),targets:Array.isArray(r.targets)?r.targets.map(parse).filter(Boolean):[1,2,3,4,5].map(i=>parse(r['TargetSetting'+i])).filter(Boolean)};cache.set(r,a);return a;}
function list(v){return Array.isArray(v)?v:typeof v==='string'?v.split('~').filter(Boolean):[];}
function hp(u){return F(F(u.hp)/F(u.stats.MaxHP||u.stats.HP||1));}
function pos(u){return N(u.campPosition,u.slot);}
function dead(u){return !!u.dead||u.hp<=0;}
function install(S){
 const P=S.prototype,B=root.GLBattle,select0=P.select,skillTargets0=P.skillTargets;
 if(P._nativeAIInstalled)return;P._nativeAIInstalled=true;
 P.nativeRandomTwoTargets=function(owner,setting,action=this.action){
  if(!action?.selected)return [];
  const state=action._nativeRandomTargets||(action._nativeRandomTargets={secondaryIDs:[]}),primary=action.selected;
  // BattleAction.RandomTargetList persists across SkillFunctionParam clones.
  // The cached path keeps dead targets and returns primary first (0x2305B30).
  if(state.secondaryIDs.length){const secondary=this.locate(state.secondaryIDs[0]);return secondary?[primary,secondary]:[primary];}
  const sc=setting.SelectInfo||setting;
  const includeStealth=sc.IncludeStealth===undefined?true:flag(sc.IncludeStealth),includeInvincible=sc.IncludeInvincible===undefined?true:flag(sc.IncludeInvincible);
  const all={...setting,SelectInfo:{...sc,TargetType:'All'}};
  const candidates=select0.call(this,owner,all,action,primary).filter(r=>r!==primary&&!dead(r)&&(!r.props.HideOut||flag(sc.IncludeHideOut))&&(includeStealth||!r.props.Stealth)&&(includeInvincible||!r.props.Invincible)).sort((a,b)=>pos(a)-pos(b));
  if(!candidates.length)return [primary];
  const secondary=candidates[Math.min(candidates.length-1,Math.floor(this.random()*candidates.length))];
  state.secondaryIDs.push(secondary.uid);
  // A new secondary consumes one RandomInt and the initial pair is position-sorted.
  return [primary,secondary].sort((a,b)=>pos(a)-pos(b));
 };
 P.select=function(owner,setting={},action=this.action,defaultTarget=null){
  const sc=setting.SelectInfo||setting,type=sc.TargetType||sc.Target;
  if(type==='RandomTwo')return this.nativeRandomTwoTargets(owner,setting,action);
  if(type!=='FrontRow'&&type!=='BackRow')return select0.call(this,owner,setting,action,defaultTarget);
  const all={...setting,SelectInfo:{...sc,TargetType:'All'}};
  return select0.call(this,owner,all,action,defaultTarget).filter(r=>!dead(r)&&pos(r)===(type==='FrontRow'?0:3)).slice(0,1);
 };
 P.skillTargets=function(owner,skill,chosen,action){
  if(!skill)return [];const raw=skill.raw,type=raw.TargetType||'One';
  // Prepare the shared native Action state before trigger() shallow-copies it.
  if(action&&!action._nativeRandomTargets)action._nativeRandomTargets={secondaryIDs:[]};
  if(type==='RandomTwo')return this.nativeRandomTwoTargets(owner,{TargetCamp:raw.TargetCamp||'Enemy',TargetType:type,NoSelf:flag(raw.NoSelf)},action).filter(r=>!dead(r)&&!r.props.HideOut);
  if(!['One','OneWithDead','DeadOne','DeadOneOrLessHPRate','SkillSelect','ParamTarget'].includes(type))return skillTargets0.call(this,owner,skill,chosen,action);
  // 单体已由 AI 处理隐匿的三阶段重选。执行时不得再次抹掉合法 chosen。
  if(!chosen||chosen.props.HideOut||flag(raw.NoSelf)&&chosen===owner)return [];
  const camp=raw.TargetCamp||'Enemy';if(camp==='My'&&chosen.camp!==owner.camp||camp==='Enemy'&&chosen.camp===owner.camp)return [];
  if(type==='DeadOne')return dead(chosen)&&this.nativeCanRevive(chosen)?[chosen]:[];
  if(dead(chosen)){if(['OneWithDead','DeadOneOrLessHPRate'].includes(type)&&this.nativeCanRevive(chosen))return [chosen];return [];}
  return [chosen];
 };
 P.nativeAIContext=function(u,target,action){
  // 创建上下文本身不应消耗 RNG；真正有概率条件时才按需读取。
  const rng=this.random;let ctx;try{this.random=()=>0;ctx=this.context(u,target,action,'AI');}finally{this.random=rng;}
  let drawn=false,r;Object.defineProperty(ctx,'randomUnit',{get(){if(!drawn){r=rng();drawn=true;}return r;},configurable:true});return ctx;
 };
 P.nativeAIRules=function(u,ids){
  if(!ids){const runtime=typeof this.nativePropertyList==='function'?this.nativePropertyList(u,'AI'):[];ids=runtime.length?runtime:list(u.card.ai||u.card.raw?.AIs);}
  const all=this.data.autoAI||[],out=[];for(const id of ids)for(const r of all)if(r.ID===id)out.push(normalize(r));
  return out.sort((a,b)=>N(b.Priority)-N(a.Priority));
 };
 P.nativeAIConditions=function(u,rule,action){if(!rule.conditions.length)return true;return this.condition({Conditions:rule.conditions},this.nativeAIContext(u,u,action));};
 P.nativeCanRevive=function(u){if(root.GLNativeComplex?.canRevive)return root.GLNativeComplex.canRevive(this,u);if(u.dieOut||u.IsDieOut||u.props.DieOut||u.props.IsDieOut)return false;if(this.units.some(x=>!dead(x)&&(x.props.AllCantRevive||(x.camp!==u.camp&&x.props.EnemyCantRevive))))fail('AI 复活目标需要 GLNativeComplex.canRevive');return true;};
 P.nativeCanSelect=function(u,skill,target,ignoreStealth=false){
  if(!target)return false;const r=skill.raw,t=r.TargetType||'One',camp=r.TargetCamp||'Enemy';
  if(t==='Self')return u===target;
  if(flag(r.NoSelf)&&u===target)return false;
  if(camp==='My'){if(u.camp!==target.camp)return false;if(dead(target)&&['AllWithDead','OneWithDead','DeadOne','DeadOneOrLessHPRate'].includes(t))return this.nativeCanRevive(target);return !dead(target);}
  if(camp==='Enemy'&&u.camp===target.camp)return false;
  return !dead(target)&&!target.props.HideOut&&(ignoreStealth||!target.props.Stealth);
 };
 P.nativeSkillCandidates=function(u,skill){let xs=this.units.filter(t=>this.nativeCanSelect(u,skill,t,false));if(!xs.length)xs=this.units.filter(t=>this.nativeCanSelect(u,skill,t,true));return xs;};
 P.canSkill=function(u,id){
  const s=this.data.skills[id];if(!s||dead(u)||s.raw.SkillType==='Passive'||!u.skills.includes(id))return false;
  // 0x2346314：无法使用技能时仅比较首普攻 ID，绕过 SP/CD/目标查询。
  if(u.props.Taunt||u.props.Sleep||u.props.Silence)return id===u.normal;
  if(N(u.cooldowns[id])>0)return false;const sp=N(s.raw.SP);if(sp<0){if(!Number.isFinite(u.sp))fail('负 SP 费用需要原生 NowSP 上下文');if(F(u.sp+sp)<0)return false;}
  return this.nativeSkillCandidates(u,s).length>0;
 };
 P.nativeAIProperty=function(target,key,id,action){
  if(key==='MaxHP'||key==='HP')return N(target.stats.MaxHP);if(key==='NowHP')return target.hp;if(key==='NowHPRate')return hp(target);if(key==='BuffCount')return target.buffCount||0;if(key==='DeBuffCount')return target.debuffCount||0;if(key==='NowTime')return target.progress;
  if(Object.prototype.hasOwnProperty.call(target.stats,key))return N(target.stats[key]);
  if(Object.prototype.hasOwnProperty.call(target.props,key))return N(target.props[key]);
  const ctx=this.nativeAIContext(action.actor,target,action),v=ctx.resolveProperty?.(key,target,id);if(v!==undefined)return v;fail('尚未验证 AI MaxProperty 属性 '+key);
 };
 P.nativeAITargetCandidates=function(u,skill,t,action,pass=0){
  const camp=skill.raw.TargetCamp||'Enemy',ally=camp==='My',type=t.Type||'One',includeInv=pass===1||ally||flag(t.IncludeInvincible),includeStealth=pass===2||ally||flag(t.IncludeStealth),noSelf=flag(t.NoSelf)||flag(skill.raw.NoSelf);
  let xs=this.units.filter(r=>(camp==='None'||camp==='All'||camp==='Both'?true:ally?r.camp===u.camp:r.camp!==u.camp)&&(!noSelf||r!==u)&&(!r.props.HideOut||flag(t.IncludeHideOut))&&(includeInv||!r.props.Invincible)&&(includeStealth||!r.props.Stealth));
  if(flag(t.RemoveWillPassRound))xs=xs.filter(r=>!this.willPass(r));
  xs=xs.filter(r=>this.condition({Condition:t.Condition,Conditions:t.Conditions},this.nativeAIContext(u,r,action)));
  const alive=xs.filter(r=>!dead(r)),take=(a,cmp,n=1)=>a.sort((x,y)=>cmp(x,y)||pos(x)-pos(y)).slice(0,n),roll=a=>a.length?[a[Math.min(a.length-1,Math.floor(this.random()*a.length))]]:[];
  switch(type){
   case'One':case'All':case'AllWithDead':return type==='AllWithDead'?xs:alive;
   case'Self':return xs.includes(u)&&!dead(u)?[u]:[];
   case'Boss':return alive.filter(r=>r.isBoss);
   case'FrontRow':return alive.filter(r=>pos(r)===0).slice(0,1);
   case'BackRow':return alive.filter(r=>pos(r)===3).slice(0,1);
   case'ConquerOKTarget':{const a=alive.filter(r=>B.conquers(u.card.element,r.card.element));return a.length?a:alive.filter(r=>!B.conquers(r.card.element,u.card.element));}
   case'ConquerTarget':return alive.filter(r=>B.conquers(u.card.element,r.card.element));
   case'LessHPRate':return take(alive,(a,b)=>hp(a)-hp(b));
   case'HaveDeBuffOne':return roll(alive.filter(r=>r.debuffCount>0));
   case'DeadOne':return roll(xs.filter(r=>dead(r)&&this.nativeCanRevive(r)));
   case'HaveCoolDown':return alive.filter(r=>(r.card.showSkills||r.card.skillSlots||r.skills).some(id=>!(r.card.hiddenSkills||[]).includes(id)&&N(r.cooldowns[id])>0));
   case'HightestSkillCD':return take(alive,(a,b)=>Math.max(0,...b.skills.map(id=>N(b.cooldowns[id])))-Math.max(0,...a.skills.map(id=>N(a.cooldowns[id])))||a.hp-b.hp);
   case'MostTime':return take(alive,(a,b)=>b.progress-a.progress||a.hp-b.hp);
   case'HightestAtkOne':return take(alive,(a,b)=>b.stats.Attack-a.stats.Attack);
   case'MaxProperty':case'MinProperty':return take(alive,(a,b)=>(type==='MaxProperty'?-1:1)*(this.nativeAIProperty(a,t.Property,t.PropertyID,action)-this.nativeAIProperty(b,t.Property,t.PropertyID,action))||a.hp-b.hp);
   case'TautSource':{const st=u.statuses.find(st=>{const p=root.GLConfig.nativeStatusProperties({...st,def:this.data.statuses[st.id]}).properties;return Object.prototype.hasOwnProperty.call(p,'Taunt');}),r=st&&this.locate(st.source);return r?[r]:[];}
   default:fail('尚未验证 AI 目标规则 '+type);
  }
 };
 P.aiTarget=function(u,skill,rawRule,action,preferred=null){
  const rule=normalize(rawRule);
  if(preferred&&(skill.raw.TargetCamp||'Enemy')==='Enemy'&&!u.props.Taunt&&!u.props.Dizzy&&!u.props.Sleep&&!u.props.HideOut&&this.nativeCanSelect(u,skill,preferred,false))return preferred;
  for(let pass=0;pass<3;pass++)for(const t of rule.targets){
   if(this.random()>N(t.Rate,Math.fround(1.1)))continue;
   let xs=this.nativeAITargetCandidates(u,skill,t,action,pass);if(!xs.length)continue;xs.sort((a,b)=>hp(a)-hp(b));const min=hp(xs[0]);xs=xs.filter(r=>hp(r)===min);
   return u.isMonster?xs[Math.min(xs.length-1,Math.floor(this.random()*xs.length))]:xs[0];
  }return null;
 };
 P.defaultTarget=function(u,skill,preferred=null,explicit=false){
  const xs=this.nativeSkillCandidates(u,skill);if(preferred&&xs.includes(preferred))return preferred;
  if(explicit)return [...xs].sort((a,b)=>hp(a)-hp(b))[0]||null;
  const score=r=>r.hp+(B.conquers(u.card.element,r.card.element)?-80000:0)+(B.conquers(r.card.element,u.card.element)?90000:0)+(r.props.Invincible?900000:0)+(r.props.Stealth?9000000:0);
  return [...xs].sort((a,b)=>score(a)-score(b))[0]||null;
 };
 P.nativeAIChoice=function(u,skill,selected){return {skill,selected,targets:skill&&selected&&skill.raw.TargetType!=='RandomTwo'?this.skillTargets(u,skill,selected,{actor:u,skill,selected}):[]};};
 P.nativeAIFind=function(u,rules,preferred=null,index=null){for(const rule of rules){if(index!==null&&N(rule.SkillIndex)!==index)continue;const skill=this.data.skills[u.card.skillSlots[N(rule.SkillIndex)]];if(!skill||!this.canSkill(u,skill.id))continue;const a={actor:u,skill,actionType:5,kind:'system',normal:skill.id===u.normal,selected:null,directTargets:[]};if(!this.nativeAIConditions(u,rule,a))continue;const t=this.aiTarget(u,skill,rule,a,preferred);if(t)return {skill,selected:t};}return null;};
 P.choose=function(u){
  if(u.passiveDummy||dead(u))return {skill:null,targets:[]};
  const raw=u.camp===0?(this.plan.actions?.[this.rowIndex]?.[u.slot]??u.config.mode??'auto'):'auto',cmd=typeof raw==='object'?raw:{mode:raw},mode=cmd.mode||cmd.skillID||cmd.skillId||'auto';
  const prefID=cmd.targetID||cmd.targetId||u.config.targetID||u.config.targetId,pref=prefID?this.locate(prefID):null,rules=this.nativeAIRules(u);
  if(u.props.Taunt){const ids=this.nativePropertyList?.(u,'TauntAI')||[],found=this.nativeAIFind(u,this.nativeAIRules(u,ids));if(found)return this.nativeAIChoice(u,found.skill,found.selected);const s=this.data.skills[u.normal];if(s){const a={actor:u,skill:s,kind:'system',actionType:5},xs=this.nativeAITargetCandidates(u,s,{Type:'TautSource',IncludeStealth:true,IncludeInvincible:true},a);if(xs.length)return this.nativeAIChoice(u,s,xs[0]);}}
  if(mode==='wait')return {skill:null,targets:[]};
  if(mode!=='auto'){
   const active=u.card.skillSlots.filter(id=>u.skills.includes(id)&&this.data.skills[id]?.raw.SkillType!=='Passive'&&!(u.card.hiddenSkills||[]).includes(id));
   const request=cmd.skillID||cmd.skillId||(mode==='basic'?u.normal:mode==='ultimate'?active[1]:mode),id=this.canSkill(u,request)?request:u.normal,skill=this.data.skills[id];
   if(!skill||!this.canSkill(u,id))return {skill:null,targets:[]};const found=this.nativeAIFind(u,rules,pref,u.card.skillSlots.indexOf(id));return this.nativeAIChoice(u,skill,found?.selected||this.defaultTarget(u,skill,pref,true));
  }
  const found=this.nativeAIFind(u,rules,pref);if(found)return this.nativeAIChoice(u,found.skill,found.selected);
  const skill=this.data.skills[u.normal];return this.nativeAIChoice(u,skill||null,skill?this.defaultTarget(u,skill,pref):null);
 };
 P.retargetAddition=function(spec){const u=spec.actor,skill=spec.originalSkill||spec.skill,index=u.card.skillSlots.indexOf(skill.id);if(index<0)fail('追加技能不在原生技能索引中：'+skill.id);const found=this.nativeAIFind(u,this.nativeAIRules(u),null,index);return found?.selected||this.defaultTarget(u,skill,null,true);};
}
const API={install,parse,normalize};root.GLNativeAI=API;if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof globalThis!=='undefined'?globalThis:this);
