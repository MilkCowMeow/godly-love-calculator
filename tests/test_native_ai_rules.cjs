const assert=require('node:assert/strict'),fs=require('node:fs');
global.GLTimeline={Incomplete:class Incomplete extends Error{}};
global.GLBattle={conquers:(a,b)=>a==='Red'&&b==='Green'||a==='Green'&&b==='Blue'||a==='Blue'&&b==='Red'};
global.GLConfig={nativeStatusProperties(s){return {properties:s.properties||{},lists:{}}}};
const ai=require('./native_ai_rules.js');
class S{
 constructor(){this.data={skills:{basic:{id:'basic',raw:{TargetCamp:'Enemy',TargetType:'One'}},ult:{id:'ult',raw:{TargetCamp:'Enemy',TargetType:'One'}},heal:{id:'heal',raw:{TargetCamp:'My',TargetType:'One'}}},autoAI:[],statuses:{}};this.units=[];this.plan={actions:{}};this.rowIndex=1;this.random=()=>.5;}
 context(u,t,a){return {source:u,target:t,randomUnit:this.random(),action:a};}
 condition(f,c){return [f.Condition,...(f.Conditions||[])].filter(Boolean).every(v=>v.Property==='NowHPRate'?c.target.hp/c.target.stats.MaxHP<Number(v.Value):v.CheckFun==='AllyHaveDeBuff'?this.units.some(t=>t.camp===c.source.camp&&t.debuffCount):v.pass!==false);}
 nativePropertyList(u,k){return u.lists?.[k]||[];}
 willPass(u){return !!u.props.Sleep;}
 locate(id){return this.units.find(u=>u.uid===id);}
 skillTargets(u,s,t){return t?[t]:[];}
 select(u,f){const camp=(f.SelectInfo||f).TargetCamp||'Enemy';return this.units.filter(r=>!r.dead&&(camp==='My'?u.camp===r.camp:u.camp!==r.camp));}
}
ai.install(S);
function u(id,camp=0,slot=0){return {uid:id,camp,slot,campPosition:slot,hp:100,hpRate:1,stats:{MaxHP:100,Attack:10},props:{},card:{id,ai:['a'],skillSlots:['basic','ult','heal'],hiddenSkills:[],element:'None'},skills:['basic','ult','heal'],normal:'basic',cooldowns:{},config:{mode:'auto'},statuses:[],isMonster:camp===1};}
function setup(){const s=new S(),a=u('a'),b=u('b',1),c=u('c',1,1);s.units=[a,b,c];return {s,a,b,c};}
function rule(skill=1,targets=[{Type:'LessHPRate'}]){return {ID:'a',Priority:2,SkillIndex:skill,targets};}
// 原表必须真正读入；禁止旧实现静默忽略 Condition1/TargetSetting1。
const data=JSON.parse(fs.readFileSync(__dirname+'/calculator_data.json','utf8')),rr=data.autoAI.map(ai.normalize);assert.equal(rr.length,48);assert(rr.every(r=>r.targets.length>0));assert(rr.some(r=>r.conditions.length));assert.equal(ai.parse('{Type:"FrontRow",Rate:.6,NoSelf:true}').Rate,.6);assert.throws(()=>ai.parse('{__proto__:1}'));
let {s,a,b,c}=setup();s.data.autoAI=[{ID:'a',Priority:'2',SkillIndex:'1',Condition1:'{pass:false}',TargetSetting1:'{Type:"Boss"}'},rule(0)];b.isBoss=true;assert.equal(s.choose(a).skill.id,'basic');
({s,a,b,c}=setup());s.data.autoAI=[rule(1,[{Type:'Boss'},{Type:'LessHPRate'}])];b.isBoss=true;c.hp=1;assert.equal(s.choose(a).selected,b);a.cooldowns.ult=2;assert.equal(s.choose(a).skill.id,'basic');
// 自动 AI 全失败只回普攻，不能错误选择另一个可用技能。
({s,a,b,c}=setup());s.data.autoAI=[];assert.equal(s.choose(a).skill.id,'basic');b.hp=90;c.hp=80;assert.equal(s.defaultTarget(a,s.data.skills.basic),c);a.card.element='Red';b.card.element='Green';assert.equal(s.defaultTarget(a,s.data.skills.basic),b);
// 指定每行方案；不可用究极或无效 skillID 都退首技能。
({s,a,b,c}=setup());s.plan.actions={1:{0:'ultimate'},2:{0:'wait'},3:{0:{skillID:'heal'}}};assert.equal(s.choose(a).skill.id,'ult');a.cooldowns.ult=2;assert.equal(s.choose(a).skill.id,'basic');s.rowIndex=2;assert.equal(s.choose(a).skill,null);s.rowIndex=3;assert.equal(s.choose(a).skill.id,'heal');s.plan.actions[3][0]='missing';assert.equal(s.choose(a).skill.id,'basic');
// 沉默/嘲讽阻止技能；普攻按原生直接返回 true，不检查 CD。
({s,a,b,c}=setup());a.props.Silence=1;a.cooldowns.basic=5;assert.equal(s.canSkill(a,'basic'),true);assert.equal(s.canSkill(a,'ult'),false);
// 目标设置 Rate每次仍抽；三轮依次默认 / 含无敌 / 含隐匿。
({s,a,b,c}=setup());let calls=0;s.random=()=>{calls++;return .5;};b.props.Invincible=1;c.props.Stealth=1;const act={actor:a,skill:s.data.skills.ult};assert.equal(s.aiTarget(a,s.data.skills.ult,rule(),act),b);assert.equal(calls,2);b.props.Stealth=1;b.props.Invincible=0;calls=0;assert.equal(s.aiTarget(a,s.data.skills.ult,rule(),act),b);assert.equal(calls,3);
// FrontRow 精确第0站位；首位缺失不会从第1站位递补。
({s,a,b,c}=setup());const ac={actor:a,skill:s.data.skills.basic};assert.deepEqual(s.nativeAITargetCandidates(a,s.data.skills.basic,{Type:'FrontRow'},ac),[b]);b.dead=true;assert.deepEqual(s.nativeAITargetCandidates(a,s.data.skills.basic,{Type:'FrontRow'},ac),[]);
// 全部同优先目标中，Monster 最低血比并列抽样；LessHPRate本身已先取首站位1人。
({s,a,b,c}=setup());a.isMonster=true;b.isBoss=true;c.isBoss=true;s.random=()=>.9;assert.equal(s.aiTarget(a,s.data.skills.basic,rule(0,[{Type:'Boss'}]),ac),c);assert.equal(s.aiTarget(a,s.data.skills.basic,rule(0,[{Type:'LessHPRate'}]),ac),b);
// 运行时 AI 规则覆盖静态 AI；技能索引固定，不因追加目标死亡改放另一个技能。
({s,a,b,c}=setup());s.data.autoAI=[rule(1),{...rule(0),ID:'new'}];a.lists={AI:['new']};assert.equal(s.choose(a).skill.id,'basic');a.lists={};a.cooldowns.ult=3;assert(s.retargetAddition({actor:a,skill:s.data.skills.ult}));
// 友方 AI 天生含无敌/隐匿，且目标 Condition 应逐候选判断。
({s,a,b,c}=setup());c.camp=0;c.props={Stealth:1,Invincible:1};c.hp=40;s.data.autoAI=[rule(2,[{Type:'LessHPRate',Condition:{Who:'Target',Property:'NowHPRate',Comparer:'Lt',Value:.8}}])];assert.equal(s.choose(a).selected,c);
// 包装层保留合法 AI 隐匿目标；目标死/躲藏则禁止执行。
({s,a,b,c}=setup());b.props.Stealth=1;assert.deepEqual(s.skillTargets(a,s.data.skills.basic,b,{}),[b]);b.props.HideOut=1;assert.deepEqual(s.skillTargets(a,s.data.skills.basic,b,{}),[]);b.props.HideOut=0;b.dead=true;assert.deepEqual(s.skillTargets(a,s.data.skills.basic,b,{}),[]);assert.deepEqual(s.select(a,{TargetCamp:'Enemy',TargetType:'FrontRow'}),[]);assert.deepEqual(s.select(a,{TargetCamp:'Enemy',TargetType:'BackRow'}),[]);c.campPosition=3;assert.deepEqual(s.select(a,{TargetCamp:'Enemy',TargetType:'BackRow'}),[c]);
console.log('native_ai_rules：原始48条配置、11组AI/方案/回退/可选目标测试通过');
