/* 试炼敌方档案。只读展示模块，沿用战斗数据及原生 AI 解析器。 */
(function(root){'use strict';
const n=(v,d=0)=>v===''||v===undefined||v===null?d:Number(v);
const flag=v=>v===true||v==='TRUE'||v===1||v==='1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=v=>String(v||'').replace(/\[([^\[\]:]+):[^\]]+\]/g,'$1').replace(/\\n/g,'\n').replace(/<[^>]*>/g,'');
const number=v=>Number(v).toLocaleString('en-US',{maximumFractionDigits:4});
const pct=v=>number(Number((100*n(v)).toFixed(4)))+'%';
const IMMUNITIES={AntiSilence:'息声',AntiStun:'晕眩',AntiTaunt:'嘲弄',AntiTargetTaunt:'指定嘲弄',AntiSleep:'静眠',AntiPoison:'浸毒'};
const PROPERTIES={HP:'生命',MaxHP:'生命上限',Attack:'攻击',Defence:'防御',Speed:'速度',CriticalRate:'暴击率',CriticalDamageRate:'暴击伤害',EffectHitRate:'效果命中',ResistanceRate:'效果抵抗',DodgeRate:'闪避率',HPFinalRate:'最终生命加成',AttackFinalRate:'最终攻击加成',BuffCount:'强化状态数量',DeBuffCount:'弱化状态数量',DebuffCount:'弱化状态数量',BuffGroupStack:'同组状态层数',BuffStack:'状态层数',NowHP:'当前生命',NowHPRate:'当前生命比例',LastHPRate:'已损生命百分数',NowTime:'行动值',EventHPDiff:'本次生命变化',RoleNoPinch:'禁止协战标记',ValueOne:'常量1'};
const KEYS={Fun:'效果',FID:'作用对象',FIDs:'作用对象列表',Target:'效果目标',TargetType:'目标范围',TargetCamp:'目标阵营',StatusRound:'持续回合',Trigger:'触发时点',Rate:'系数 / 基础概率',Value:'数值',ID:'效果编号',CD:'效果冷却',Property:'取值属性',Who:'取值对象',Base:'固定项',MaxValue:'取值上限',FinalMaxValue:'最终上限',ValueConvert:'数值计算',StatusValue:'状态数值计算',SelectInfo:'效果目标筛选',TargetInfo:'条件对象筛选',Conditions:'同时满足的条件',Condition:'条件',CheckFun:'判定',CheckID:'检查对象',Comparer:'比较',Value2:'第二阈值',SubFuns:'后续效果',PenetrateRate:'贯穿系数',ConditionAttack:'附加伤害乘区',HurtReduction:'受到伤害减免',SkillID:'技能',IgnoreResist:'忽略抵抗',IgnoreImmune:'忽略免疫',IgnoreDodge:'忽略闪避',IsShowTip:'显示提示',NoSelf:'排除自身',IsAura:'光环效果',DeadCanRun:'死亡后可触发',AbsoluteRemoveBuff:'绝对解除状态',IsForceAddSkill:'强制追加',RemoveWillPassRound:'排除将跳过行动者',IsAllWhoPass:'全部条件对象须满足',Invert:'反向判定',NextCondition:'后续条件',HPFinalRate:'最终生命加成',CriticalRate:'暴击率'};
const VALUES={AddStatus:'附加状态',RandomAddStatus:'随机附加状态',RemoveBuf:'解除强化状态',RemoveDeBuf:'解除弱化状态',RemoveBufsByID:'解除指定状态',AddHP:'生命变化',AddTime:'行动值变化',AddAllSkillCoolDown:'全部技能冷却变化',AddSkillCoolDown:'指定技能冷却变化',ReSetSkillCoolDown:'重置技能冷却',AddRound:'获得额外回合',AdditionSkill:'追加技能',ReplaceSkill:'替换技能',AddPinchSkill:'发动协战',CounterSkill:'反击',SplitDamage:'分摊伤害',TransferDeBuff:'转移弱化状态',AddAllBuffRound:'延长强化状态',ImmortalAddHP:'致命伤害时保留1点生命',My:'施放者同阵营',Enemy:'施放者对立阵营',All:'全体',Self:'自身',Source:'效果拥有者',Target:'效果上下文目标',SelectTarget:'技能选定目标',TriggerSource:'触发事件来源',TriggerTarget:'触发事件目标',AuraSource:'光环来源',SkillSelect:'技能选定目标',SkillSetting:'按技能目标设置',SkillSource:'技能施放者',HightestAtkOne:'攻击最高的目标',HightestSkillCD:'技能剩余冷却最长的目标',LessHPRate:'生命比例最低的目标',MostTime:'行动值最高的目标',MaxProperty:'指定属性最高的目标',Property:'常驻属性计算',BeforeRound:'自身行动回合开始前',AfterRound:'自身行动回合结束时',BeforeSkill:'施放技能前',TargetAfterSkill:'受到技能作用后',BeforeEvent:'生命事件结算前',AfterEvent:'生命事件结算后',AnyOneBeforeRound:'任意角色行动回合开始前',AnyOneAfterSkillHit:'任意角色技能命中后',PreSelfDead:'自身濒死时',ForceConquer:'强制属性克制',IsMainRound:'自身主回合',IsNormalSkill:'当前技能为战技',IsDamageSkill:'事件为伤害技能',IsDiffCamp:'事件双方阵营不同',IsNoSelf:'对象为其他角色',TargetIsOne:'当前技能为单体',TargetIsAll:'当前技能为全体',SkillID:'当前技能匹配',CheckSkillCooldown:'指定技能冷却已结束',CheckSkillNoUse:'指定技能处于冷却中',HaveBuff:'持有所列状态',Gt:'大于或等于',Gtn:'严格大于',Lt:'小于或等于',Ltn:'严格小于',Eq:'等于',Ne:'不等于',Between:'位于区间'};
const SPECIAL={
 Trial_C03_R_101S3:['受到伤害技能作用后，Boss仍存活且本被动冷却结束时，为敌方全队推进20%行动值。本被动冷却为2回合。'],
 C02_SSR_001S4:['自身主回合施放战技且自身强化状态数量达到1个及以上时，战技替换为80%倍率的全体攻击。','受到致命伤害时保留1点生命，随后附加坚忍相关状态，并使终结技冷却减少4回合。该保命效果的脚本冷却为9999回合。'],
 C04_SSR_002S1:['自身主回合施放本战技，且选定目标生命比例为30%及以下时，追加30%倍率全体攻击。追加效果冷却为1回合。'],
 C04_SSR_002S2:['已损生命百分数以0至100计。此技能的附加伤害乘区为 1 + 0.0022 × 目标已损生命百分数。'],
 C04_SSR_002S4:['受到伤害技能作用后，自身仍存活且本被动冷却结束时，获得1回合潜影并推进20%行动值，随后重置本被动的2回合冷却。'],
 C04_SR_003S3:['自身主回合施放战技前，以20%概率追加一次战技；追加效果冷却为1回合。']
};
function reference(data,id){return data.statuses?.[id]?.name||data.skills?.[id]?.name||id;}
function conditionText(c,data){
 const parts=[],who={Source:'自身',Target:'目标',SelectTarget:'选定目标',TriggerSource:'事件来源',TriggerTarget:'事件目标'}[c.Who]||'自身';
 if(c.CheckFun==='AnyAllyHaveCoolDown')parts.push('至少一名同伴有技能处于冷却中');
 else if(c.CheckFun)parts.push((VALUES[c.CheckFun]||c.CheckFun)+(c.CheckID?'（'+reference(data,c.CheckID)+'）':''));
 if(c.Property){const scope=c.TargetInfo?.TargetType==='All'?(c.IsAllWhoPass?'对面每一名角色':'对面至少一名角色'):who;const value=c.Property==='NowHPRate'?pct(c.Value):number(c.Value);parts.push(scope+'的'+(PROPERTIES[c.Property]||c.Property)+(VALUES[c.Comparer||'Eq']||c.Comparer)+value);}
 return parts.join('，');
}
function targetRule(t){
 const map={FrontRow:'尝试选阵容第1号位（60%概率）',Boss:'优先选择技能目标阵营中的Boss',ConquerOKTarget:'优先选择自身克制的目标，其次选择属性不克制自身的目标',LessHPRate:'选择生命比例最低的目标',HightestSkillCD:'选择技能剩余冷却最长的目标',HaveCoolDown:'选择有技能处于冷却中的目标'};
 let text=map[t.Type]||t.Type;
 if(t.Type==='FrontRow')text='尝试选阵容第1号位（'+pct(t.Rate??1)+'概率）';
 if(t.Condition?.Property==='NowHPRate')text+='，该目标生命比例须'+(VALUES[t.Condition.Comparer||'Eq']||t.Condition.Comparer)+pct(t.Condition.Value);
 return text;
}
function walk(value,fn){if(Array.isArray(value))value.forEach(x=>walk(x,fn));else if(value&&typeof value==='object'){fn(value);Object.values(value).forEach(x=>walk(x,fn));}}
function skillKind(enemy,skill){return skill.id.startsWith('Trial_')?'试炼专属':skill.raw.SkillType==='Passive'?'被动':enemy.hiddenSkills?.includes(skill.id)?'隐藏辅助技':enemy.skillSlots[0]===skill.id?'战技':enemy.skillSlots[1]===skill.id?'终结技':'辅助技能';}
function build(data,trial,options={}){
 return {floor:trial.floor,level:trial.level,enemies:trial.enemies.map(enemy=>{
  const skills=enemy.skills.map(id=>data.skills[id]).filter(Boolean),immunities=[];
  for(const c of enemy.configs||[])if(c.key==='AntiList')for(const code of String(c.value).split('~'))if(code&&!immunities.some(x=>x.code===code))immunities.push({code,name:IMMUNITIES[code]||code});
  const stackSkill=skills.find(s=>/^Trial_AttackStack/.test(s.id)),stackStatus=stackSkill&&data.statuses[stackSkill.id],stackProp=stackStatus?.configs?.find(c=>c.key==='AttackFinalRate');
  const stack=stackSkill?{skillID:stackSkill.id,rate:n(stackProp?.value),max:n(stackStatus.raw.MaxStack),resident:flag(stackStatus.raw.IsResident),duration:n(stackStatus.raw.RoundCount)}:null;
  const rules=(data.autoAI||enemy.aiRules||[]).filter(r=>enemy.ai.includes(r.ID)).map(r=>root.GLNativeAI.normalize(r)).sort((a,b)=>n(b.Priority)-n(a.Priority)).map(rule=>{
   const skill=data.skills[enemy.skillSlots[n(rule.SkillIndex)]];
   return {priority:n(rule.Priority),skillID:skill?.id,skillName:skill?.name,kind:skill&&skillKind(enemy,skill),conditions:rule.conditions.map(c=>conditionText(c,data)),targets:rule.targets.map(targetRule)};
  });
  const states=new Set();
  const entries=skills.map(skill=>{
   const incoming=[];for(const source of skills)walk(source.configs,fun=>{if(fun.FID===skill.id&&['ReplaceSkill','AdditionSkill'].includes(fun.Fun))incoming.push({sourceID:source.id,source:source.name,fun:VALUES[fun.Fun]});});
   walk(skill.configs,value=>{for(const id of [value.FID,value.CheckID,...(value.FIDs||[])])if(data.statuses[id]?.name&&data.statuses[id]?.description)states.add(id);});
   const description=clean(skill.description)||(n(skill.raw.AttRate)>0?'对'+(skill.raw.TargetCamp==='My'?'同阵营':'对立阵营')+(skill.raw.TargetType==='All'?'全体':'单体')+'施放'+pct(skill.raw.AttRate)+'攻击倍率的技能。':'');
   return {...skill,kind:skillKind(enemy,skill),description,notes:SPECIAL[skill.id]||[],incoming};
  });
  return {enemy,active:enemy.isBoss||options.includeMinion!==false,immunities,stack,rules,skills:entries,states:[...states].map(id=>({id,name:data.statuses[id].name,description:id==='Stealth'?'同伴存活时限制常规单体选取；受到全体攻击时减伤50%，受到造成伤害的攻击后解除。':clean(data.statuses[id].description)}))};
 })};
}
function configHTML(value,data,key=''){
 if(value===null)return '—';
 if(Array.isArray(value))return '<div class="trial-config-list">'+value.map((v,i)=>'<div>'+(value.length>1?'<span class="trial-config-index">'+(i+1)+'</span>':'')+configHTML(v,data,key)+'</div>').join('')+'</div>';
 if(typeof value==='object')return '<dl class="trial-config">'+Object.entries(value).map(([k,v])=>'<div><dt>'+esc(KEYS[k]||k)+'</dt><dd>'+configHTML(v,data,k)+'</dd></div>').join('')+'</dl>';
 if(typeof value==='boolean')return value?'是':'否';
 // 数值优先原样展示，避免角色/状态字典把回合数等数字映射成名字。
 if(typeof value==='number'||/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(String(value)))return esc(value);
 if(['FID','FIDs','CheckID'].includes(key))return '<span>'+esc(reference(data,value))+'</span>'+(reference(data,value)!==value?'<code>'+esc(value)+'</code>':'');
 if(key==='Property')return esc(PROPERTIES[value]||value);
 return esc(VALUES[value]||value);
}
function render(data,trial,options={}){
 const model=build(data,trial,options),assets=options.assets||{},role=options.roleIcon||(()=>''),thumb=e=>data.cards.find(c=>c.id===e.baseCardId)?.thumb;
 let html='<div class="trial-dossier"><p class="trial-dossier-intro">本层敌方档案包含关卡技能、免疫和自动行动规则。下列面板为基础属性，技能中的常驻属性增益会继续参与战斗结算。</p>';
 if(model.enemies.length>1)html+='<nav class="trial-unit-nav" aria-label="本层敌方">'+model.enemies.map(({enemy:e,active})=>'<button type="button" data-trial-unit="'+esc(e.id)+'">'+esc(e.name)+'<small>'+(!active?'已移出计算':e.isBoss?'Boss':'随从')+'</small></button>').join('')+'</nav>';
 for(const unit of model.enemies){const e=unit.enemy,s=e.stats,art=assets[thumb(e)];
  html+='<section class="trial-unit-detail" id="trial-detail-'+esc(e.id)+'" tabindex="-1"><header class="trial-unit-header">'+(art?'<img src="'+esc(art)+'" alt="'+esc(e.name)+'" decoding="async">':'')+'<div><p class="trial-unit-type">'+(e.isBoss?'BOSS':'随从')+' / LV.'+e.level+'</p><h3>'+esc(e.name)+'</h3><span class="trial-unit-role">'+role(e)+'</span>'+(!unit.active?'<p class="trial-inactive">当前已移出计算，以下保留原关卡资料。</p>':'')+'</div></header>';
  html+='<dl class="trial-stat-grid">'+[['MaxHP','生命'],['Attack','攻击'],['Defence','防御'],['Speed','速度'],['CriticalRate','暴击率'],['CriticalDamageRate','暴击伤害'],['EffectHitRate','效果命中'],['ResistanceRate','效果抵抗']].map(([k,l])=>'<div><dt>'+l+'</dt><dd>'+(['MaxHP','Attack','Defence','Speed'].includes(k)?number(s[k]):pct(s[k]))+'</dd></div>').join('')+'</dl>';
  if(unit.stack){const k=unit.stack;html+='<section class="trial-mechanism"><p class="trial-section-label">TRIAL RULE</p><h4>试炼专属叠攻</h4><p>该敌人每次自身行动回合开始前，叠加1层攻击提升，每层提供'+pct(k.rate)+'最终攻击加成，持续整场战斗，上限'+k.max+'层。</p><div class="trial-rule-formula">叠加 n 层后的最终攻击加成 = '+pct(k.rate)+' × n</div><p class="trial-detail-note">该叠攻状态属于常驻隐藏状态；强化状态数量判定对它的计数为0。层数随该敌人的自身行动回合增加，表格轮次按我方行动汇总。</p></section>';}
  html+='<section class="trial-immunity"><h4>状态免疫</h4><div class="trial-immunity-tags">'+unit.immunities.map(i=>'<span>'+esc(i.name)+'</span>').join('')+'</div><p class="trial-detail-note">基础效果抵抗 '+pct(s.ResistanceRate)+'；常驻技能与战场状态的抵抗加成继续参与弱化效果的概率结算。</p></section>';
  html+='<section class="trial-ai"><p class="trial-section-label">ACTION PATTERN</p><h4>自动行动规律</h4><p class="trial-detail-note">依优先级从上往下尝试。技能可用、施放条件满足且找到合法目标时，执行该技能；随后规则留到下次行动重新判断。</p><ol class="trial-ai-rules">';
  for(const rule of unit.rules)html+='<li><div class="trial-ai-title"><b>'+esc(rule.skillName===rule.kind?rule.kind:rule.kind+'：'+rule.skillName)+'</b><span>优先级 '+rule.priority+'</span></div><p>技能冷却结束且可用'+(rule.conditions.length?'；'+rule.conditions.map(esc).join('；'):'')+'。</p><ol>'+rule.targets.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ol></li>';
  html+='</ol><details class="trial-fold"><summary>目标筛选与特殊状态</summary><div class="trial-fold-body"><p>以上目标规则作用于技能规定的目标阵营，按顺序尝试；全体技能最终作用于其全体目标。最低生命比例规则按生命比例、站位排序，取1人；Boss或属性筛选保留多人时，先取其中最低生命比例，并列由怪物随机选择。</p><p>常规目标选择失败后，依次放宽无敌、潜影的筛选再尝试。全部行动规则失败时，回退战技，综合当前生命、属性克制、无敌和潜影选择目标。嘲弄等状态按其专用规则处理。</p><p>第1号位指固定阵容位置。该位置空缺或目标条件未通过时，继续尝试下一条目标规则。</p></div></details></section>';
  html+='<section class="trial-skill-table"><p class="trial-section-label">SKILLS</p><h4>关卡技能表 <span>'+unit.skills.length+'项</span></h4>';
  for(const sk of unit.skills){const r=sk.raw,params=[];if(r.SkillType!=='Passive'){params.push((r.TargetCamp==='My'?'同阵营':'对立阵营')+' / '+({All:'全体',Self:'自身',One:'单体'}[r.TargetType||'One']||r.TargetType));if(n(r.AttRate)>0)params.push('攻击倍率 '+pct(r.AttRate));if(r.Pow!=='')params.push('威力系数 '+number(r.Pow));}if(r.CoolDown!=='')params.push('冷却配置 '+number(r.CoolDown)+'回合');if(flag(r.IsInitCoolDown))params.push('入场时进入冷却');
   html+='<article class="skill-entry trial-skill"><h3>'+esc(sk.name)+'<span>'+esc(sk.kind)+'</span></h3><p>'+esc(sk.description)+'</p><div class="trial-skill-params">'+params.map(p=>'<span>'+esc(p)+'</span>').join('')+'</div>';
   if(sk.notes.length)html+='<ul class="trial-skill-notes">'+sk.notes.map(note=>'<li>'+esc(note)+'</li>').join('')+'</ul>';
   if(sk.incoming.length)html+='<p class="trial-detail-note">调用来源：'+sk.incoming.map(v=>esc(v.source)+'（'+esc(v.fun)+'）').join('，')+'。具体条件见来源技能。</p>';
   if(sk.configs.length)html+='<details class="trial-fold"><summary>效果参数与触发条件</summary><div class="trial-fold-body">'+sk.configs.map(c=>'<div class="trial-config-block">'+configHTML(c.key==='Fun'?c.value:{[c.key]:c.value},data)+'</div>').join('')+'</div></details>';
   html+='<small class="trial-skill-id">'+esc(sk.id)+'</small></article>';
  }
  html+='</section>';
  if(unit.states.length)html+='<details class="trial-fold trial-status-glossary"><summary>技能涉及的状态</summary><div class="trial-fold-body">'+unit.states.map(st=>'<article><h5>'+esc(st.name)+'</h5><p>'+esc(st.description)+'</p></article>').join('')+'</div></details>';
  html+='</section>';
 }
 return html+'</div>';
}
const API={build,render,conditionText,configHTML};root.GLTrialDetails=API;if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof globalThis!=='undefined'?globalThis:this);
