const assert=require('node:assert/strict');
const C=require('./config_engine.js'),fs=require('fs');
const data=JSON.parse(fs.readFileSync(__dirname+'/calculator_data.json','utf8'));C.setData(data);
let ctx={source:{stats:{Attack:1000,MaxHP:10000},hpRate:.4,statuses:[]},target:{stats:{Attack:200,MaxHP:5000},hpRate:.8,statuses:[]},skill:{id:'C01_SSR_002S2',raw:{AttRate:'1.44'}},mainRound:true,pinch:false,critical:false,skillCooldowns:{}};
assert.equal(C.convert({Rate:.1,Property:'MaxHP'},ctx).value,1000,'Who默认Source');
assert.equal(C.convert({Who:'Target',Rate:.1,Property:'MaxHP'},ctx).value,500);
assert.equal(C.convert({Rate:.1,Property:'MaxHP',MaxValue:400,FinalMaxValue:30},ctx).value,30,'先属性上限，后最终上限');
assert.equal(C.convert({Property:'ValueOne',Base:.1,Rate:.2},ctx).value,Math.fround(.3));
assert.equal(C.convert({Property:'BuffCountByID',theValue:.08},ctx).value,null,'异常字段不得偷偷推断');
assert.ok(C.convert({Property:'BuffCountByID',theValue:.08},ctx).unsupported.length);
let a=C.analyzeFunctions([{ConditionAttack:{Property:'ValueOne',Rate:.2,Class:'A'}},{ConditionAttack:{Property:'ValueOne',Rate:.3,Class:'A'}},{ConditionAttack:{Property:'ValueOne',Rate:.1,Class:'B'}}],ctx);
assert.ok(Math.abs(a.conditionMultiplier-1.65)<1e-6,'同Class加算，异Class乘算');
const fv={Property:'Attack',Rate:.000377,Base:.231,ExtraRate:{Property:'ValueOne',Rate:.9123},ExtraRatePlus:.0782,ValueConvert:{Property:'ValueOne',Rate:.0000321}};
const f=Math.fround;let native=f(f(f(f(1000)*f(.000377))*f(f(.9123)+f(.0782)))+f(.231));native=f(native+f(.0000321));
assert.equal(C.convert(fv,ctx).value,native,'GetValue逐指令保留单精度乘、加顺序');
const grouped=C.analyzeFunctions([{ConditionAttack:{Property:'ValueOne',Rate:.10000003,Class:'A'}},{ConditionAttack:{Property:'ValueOne',Rate:.20000003,Class:'A'}},{ConditionAttack:{Property:'ValueOne',Rate:.10000003,Class:'B'}}],ctx);
assert.equal(grouped.conditionClasses.A,f(f(.10000003)+f(.20000003)));
assert.equal(grouped.conditionMultiplier,f(f(1+grouped.conditionClasses.A)*f(1+grouped.conditionClasses.B)));
assert.equal(C.evaluateCondition({Property:'NowHPRate',Comparer:'Lt',Value:.5},ctx).pass,true,'条件Who默认Source');
// 原生 ValueCompare RVA 0x2340A70 的跳表依次为 Eq/Ne/Lt/Gt/Ltn/Gtn/Between。
// Lt/Gt 包含等值，Ltn/Gtn 严格比较；每种比较覆盖阈值两侧及恰好相等。
for(const [op,expected]of Object.entries({Lt:[true,true,false],Gt:[false,true,true],Ltn:[true,false,false],Gtn:[false,false,true],Eq:[false,true,false],Ne:[true,false,true]})){
 for(const [i,hpRate]of [.49,.5,.51].entries())assert.equal(C.evaluateCondition({Property:'NowHPRate',Comparer:op,Value:.5},{...ctx,source:{...ctx.source,hpRate}}).pass,expected[i],op+' 在 '+hpRate+' 的原生边界');
}
for(const [low,high]of [[.4,.6],[.6,.4]])for(const [hpRate,pass]of [[.39,false],[.4,true],[.5,true],[.6,true],[.61,false]])assert.equal(C.evaluateCondition({Property:'NowHPRate',Comparer:'Between',Value:low,Value2:high},{...ctx,source:{...ctx.source,hpRate}}).pass,pass,'Between 对区间端点采用闭区间');
assert.equal(C.evaluateCondition({CheckFun:'CheckSkillCooldown',CheckID:'missing'},ctx).pass,null);
for(const [cooldown,uses]of [[0,0],[0,3],[2,0],[2,3]]){
 const checkCtx={...ctx,skillCooldowns:{test:cooldown},skillUseCounts:{test:uses}};
 assert.equal(C.evaluateCondition({CheckFun:'CheckSkillNoUse',CheckID:'test'},checkCtx).pass,cooldown>0,'CheckSkillNoUse 读取当前冷却 '+cooldown+'，已使用 '+uses+' 次');
 assert.equal(C.evaluateCondition({CheckFun:'CheckSkillCooldown',CheckID:'test'},checkCtx).pass,cooldown<=0);
}
assert.equal(C.evaluateCondition({CheckFun:'UnverifiedFunction'},ctx).pass,null);
let card=data.cards.find(c=>c.id==='C01_SSR_001');
assert.equal(C.resolveSkill(card,card.skills[0],{imprint:0}).passiveFunctions.length,0,'刻印不足3不启用刻印解锁被动');
assert.ok(C.resolveSkill(card,card.skills[0],{imprint:3}).passiveFunctions.length>0);
assert.equal(C.nativeStatusProperties({id:'AddAttack',stack:3}).properties.AttackFinalRate,Math.fround(.2),'IsMergeProperty默认false时不按层数擅自缩放');
assert.equal(C.nativeStatusProperties({id:'Shield',value:2000}).flags.shield,true);
assert.equal(C.nativeStatusProperties({id:'Shield',value:2000}).properties.Shield,1,'护罩属性是开关，不是容量');
assert.equal(C.nativeStatusProperties({id:'custom',stack:3,value:2,def:{raw:{IsMergeProperty:'TRUE',IsValueMultiplyProp:'TRUE'},configs:[{key:'AttackFinalRate',value:.1}]}}).properties.AttackFinalRate,Math.fround(.6));
assert.equal(C.nativeStatusProperties({id:'Bleed'}).isDebuff,true,'状态空类型原生默认为DeBuff');
assert.equal(C.evaluateCondition({CheckFun:'Position',CheckID:'3'},{...ctx,source:{...ctx.source,campPosition:3}}).pass,true);
assert.equal(C.evaluateCondition({CheckFun:'Position',CheckID:'3'},{...ctx,source:{...ctx.source,campPosition:2}}).pass,false,'Position不能自己加1');
assert.equal(C.evaluateCondition({Property:'BuffGroupStack',Who:'Target',CheckID:'Taunt',Comparer:'Gt',Value:1},{...ctx,target:{...ctx.target,statuses:[{id:'Taunt',stack:1},{id:'TargetTaunt',stack:1}]}}).pass,true,'按Group而非ID累计状态层数');
assert.equal(C.evaluateCondition({Property:'BuffGroupStack',Who:'Target',CheckID:'Taunt',Comparer:'Gt',Value:1},{...ctx,target:{...ctx.target,statuses:[{id:'Taunt',stack:1}]}}).pass,true,'Gt 在状态数量恰好等于1时成立');
assert.equal(C.evaluateCondition({Property:'Taunt',Value:1},{...ctx,source:{...ctx.source,statuses:[{id:'Taunt'}]}}).pass,true);
const anti=C.analyzeFunctions([{_property:'AntiList',_value:'AntiStun~AntiSleep'}],ctx);assert.deepEqual(anti.immuneList,['AntiStun','AntiSleep']);assert.equal(anti.unsupported.length,0);
let fake={id:'fake',skills:[{id:'test',raw:{AttRate:'1'},configs:[{key:'Fun',value:{ID:'known',LV:1,PenetrateRate:{Property:'ValueOne',Rate:.3}}}]}],ascend:[{LV:'3',configs:[{key:'Fun',value:{ID:'known',LV:2,PenetrateRate:{Property:'ValueOne',Rate:.6}}}]}]};
assert.equal(C.resolveSkill(fake,'test',{ascend:3}).functions[0].PenetrateRate.Rate,.6,'明确ID匹配按更高LV替换');
for(const card of data.cards)for(const id of card.skills){const s=C.resolveSkill(card,id,{imprint:5,ascend:5});assert.ok(s.raw.ID,id);C.analyzeFunctions([...s.functions,...s.passiveFunctions],{...ctx,skill:{id,raw:s.raw}});}
// 连续战斗通过对象上下文读取被检查角色的冷却，与独立配置解释器保持一致。
const {T,data:simulationData}=require('./load_simulation.cjs');
for(const [cardID,skillID]of [['C04_SSR_009','C04_SSR_009S1'],['C02_SR_002','C02_SR_002S2']]){
 const sim=new T.Simulation(simulationData,{members:[{cardId:cardID,level:80,imprint:0}],target:'dummy',dummy:{referenceHP:100000,defence:0,speed:1,resistance:0},rounds:1},1),owner=sim.units[0],target=sim.units[1];
 const conditions=simulationData.skills[skillID].configs.map(x=>x.value?.Condition).filter(x=>x?.CheckFun==='CheckSkillNoUse');assert.equal(conditions.length,1);
 for(const [cooldown,uses]of [[0,0],[0,3],[2,0],[2,3]]){
  const id=conditions[0].CheckID;owner.cooldowns[id]=cooldown;owner.uses[id]=uses;
  const nativeCtx=sim.context(owner,target,{actor:owner,selected:target,skill:simulationData.skills[owner.normal]});
  assert.equal(C.evaluateCondition(conditions[0],nativeCtx).pass,cooldown>0,cardID+' 的实际条件按冷却生效');
 }
}
// Newtonsoft 对未知 EFunction 名称抛异常；客户端逐条捕获后跳过该 DynamicField。
const invalidForceIDs=['C02_SSR_013S1','C02_SSR_013S2','C04_SSR_013S1','C04_SSR_013S2'];
for(const skillID of invalidForceIDs){
 const skill=simulationData.skills[skillID],cardID=skillID.slice(0,-2),card=simulationData.cards.find(c=>c.id===cardID),before=JSON.stringify(skill);
 assert.equal(skill.configs.filter(c=>c.key==='Fun'&&c.value?.Fun==='ForceConquer').length,1);
 const parsed=C.configFunctions(skill.configs,skillID);
 assert.equal(parsed.length,skill.configs.length-1,'只丢弃非法枚举所在的一条配置');
 assert.ok(parsed.every(f=>f.Fun!=='ForceConquer'));
 const resolved=C.resolveSkill(card,skillID,{imprint:0});assert.equal(resolved.unsupported.length,0);
 const sim=new T.Simulation(simulationData,{members:[{cardId:cardID,level:80,imprint:0}],target:'dummy',dummy:{referenceHP:100000,defence:0,speed:1,resistance:0},rounds:1},1),owner=sim.units[0],target=sim.units[1],action={actor:owner,selected:target,skill,normal:skillID===owner.normal};
 assert.equal(sim.hitParams(owner,target,action).forceConquer,false,skillID+' 按原生忽略错误Fun别名');
 assert.equal(JSON.stringify(skill),before,'原始配置保持完整');
}
const validForceID='C01_SR_002S2',validForce=simulationData.skills[validForceID];
assert.ok(C.configFunctions(validForce.configs,validForceID).some(f=>f.Trigger==='ForceConquer'),'ETrigger.ForceConquer 保留有效');
{
 const sim=new T.Simulation(simulationData,{members:[{cardId:'C01_SR_002',level:80,imprint:0}],target:'dummy',dummy:{referenceHP:100000,defence:0,speed:1,resistance:0},rounds:1},1),owner=sim.units[0],target=sim.units[1];
 assert.equal(sim.hitParams(owner,target,{actor:owner,selected:target,skill:validForce}).forceConquer,true,'正确Trigger字段仍触发强制克制');
}
assert.deepEqual(C.configFunctions([{key:'Fun',value:{Fun:'AddHP',Value:1,SubFuns:[{Fun:'ForceConquer'}]}}],'nested-invalid'),[],'嵌套非法枚举导致整条DynamicField丢弃');
// 原生装载按声明类型解释枚举，Target与Who分别属于不同枚举。
const invalidTargetIDs=['C01_SR_006S3','C02_SR_007S3'];
for(const skillID of invalidTargetIDs){
 const skill=data.skills[skillID],before=JSON.stringify(skill),bad=skill.configs.find(c=>c.field==='DynamicField1');
 assert.equal(bad.value.Target,'TriggerTarget');
 const parsed=C.loadNativeFunction(bad.value);
 assert.equal(parsed.value,null);
 assert.deepEqual(parsed.errors.map(e=>[e.path,e.type,e.value]),[['$.Target','ETargetType','TriggerTarget']]);
 assert.deepEqual(C.configFunctions([bad],skillID),[],'原生拒绝整条效果，连同护罩/反击/重置冷却后续效果一起丢弃');
 const nativeCard=data.cards.find(c=>c.skills.includes(skillID)),resolved=C.resolveSkill(nativeCard,skillID,{imprint:3});
 assert.ok(!resolved.functions.some(f=>f._field==='DynamicField1'));
 assert.equal(JSON.stringify(skill),before,'源Description及全部raw/configs保持原样');
}
const legalTyped={Fun:'AddHP',Target:'ParamTarget',ValueConvert:{Who:'TriggerTarget',Property:'MaxHP',Rate:.1},Condition:{Who:'TriggerTarget',CheckFun:'HaveBuff',CheckID:'TriggerTarget'}};
assert.deepEqual(C.loadNativeFunction(legalTyped),{value:legalTyped,errors:[],ignored:[]},'合法Who.TriggerTarget、Target.ParamTarget及字符串CheckID均保留');
const numericTyped=C.loadNativeFunction({Fun:3,Target:'42',ValueConvert:{Who:'6',Property:'MaxHP',Rate:.1}});
assert.equal(numericTyped.errors.length,0);assert.equal(numericTyped.value.Fun,'AddHP');assert.equal(numericTyped.value.Target,'ParamTarget');assert.equal(numericTyped.value.ValueConvert.Who,'TriggerTarget');
const caseTyped=C.loadNativeFunction({fun:'addhp',TARGET:'paramtarget',valueconvert:{who:'triggertarget',property:'DeBuffCount',Rate:.1}});
assert.equal(caseTyped.errors.length,0);assert.deepEqual(caseTyped.value,{Fun:'AddHP',Target:'ParamTarget',ValueConvert:{Who:'TriggerTarget',Property:'DebuffCount',Rate:.1}},'字段和成员忽略大小写，输出原生规范名');
const namedCombination=C.loadNativeFunction({Trigger:'BeforeSkill, BeforeRound',Fun:'No'});
assert.equal(namedCombination.errors.length,0);assert.equal(namedCombination.value.Trigger,'AfterRound','Enum.Parse按位OR合法名字，即使枚举没有Flags标记');
for(const invalid of [{Fun:null},{Target:''},{Trigger:'  '},{Fun:'UnknownNativeFunction'},{Condition:{Who:'ParamTarget'}},{ValueConvert:{Property:'UnknownProperty'}},{SelectInfo:{TargetType:'TriggerTarget'}}])assert.ok(C.loadNativeFunction(invalid).errors.length,'仅真实声明的枚举字段验证：'+JSON.stringify(invalid));
const unknownFields={Fun:'AddHP',Value:1,Who:'NotADeclaredWho',CheckFun:'NotADeclaredCondition',Unknown:{Fun:'ForceConquer'},ValueConvert:{Property:'ValueOne',theValue:.08,CheckID:'TriggerTarget'}};
const unknownBefore=JSON.stringify(unknownFields),projected=C.loadNativeFunction(unknownFields);
assert.equal(projected.errors.length,0,'未知字段整体忽略，内部像Fun/Who的键不按其他类枚举误判');
assert.deepEqual(projected.value,{Fun:'AddHP',Value:1,ValueConvert:{Property:'ValueOne'}});
assert.equal(projected.ignored.length,5);assert.equal(JSON.stringify(unknownFields),unknownBefore);
const customExtension={Fun:'AddHP',Target:'ParamTarget',Who:'CustomContext',ExtraCustom:{Fun:'ExtensionFunction'},Value:3};
const customParsed=C.configFunctions([{key:'Fun',field:'CustomEffect0',value:customExtension}],'CUSTOM_keepS1')[0];
assert.equal(customParsed.Who,'CustomContext');assert.deepEqual(customParsed.ExtraCustom,customExtension.ExtraCustom);assert.equal(customParsed._origin,'CUSTOM_keepS1');assert.equal(customParsed._field,'CustomEffect0');
const invalidStatus=C.nativeStatusProperties({id:'typed-status',def:{raw:{},configs:[{key:'AttackFinalRate',value:.2},{key:'Fun',value:{Fun:'AddHP',Target:'TriggerTarget',Value:10}}]}});
assert.equal(invalidStatus.functions.length,0);assert.equal(invalidStatus.properties.AttackFinalRate,Math.fround(.2),'状态装载同样拒绝非法函数，其他静态字段保留');
const badOfficial=[];
function scanOfficial(configs,label){for(const config of configs||[])if(config.key==='Fun'&&C.loadNativeFunction(config.value).errors.length)badOfficial.push(label+'.'+config.field);}
for(const [identifier,skill]of Object.entries(data.skills))scanOfficial(skill.configs,'skill:'+identifier);
for(const [identifier,status]of Object.entries(data.statuses))scanOfficial(status.configs,'status:'+identifier);
for(const nativeCard of data.cards){scanOfficial(nativeCard.configs,'role:'+nativeCard.id);for(const kind of ['imprint','ascend'])for(const stage of nativeCard[kind]||[])scanOfficial(stage.configs,kind+':'+nativeCard.id+'@'+stage.LV);}
assert.deepEqual(badOfficial.sort(),[
 'skill:C01_SR_006S3.DynamicField1','skill:C02_SR_007S3.DynamicField1',
 'skill:C02_SSR_013S1.DynamicField2','skill:C02_SSR_013S2.DynamicField3',
 'skill:C04_SSR_013S1.DynamicField2','skill:C04_SSR_013S2.DynamicField3',
].sort(),'全量原卡、状态、升星及预置强化的非法枚举集合与原生独立扫描完全一致');
console.log('通过：默认对象、双重上限、条件默认、分组乘区、明确ID补丁、异常字段、刻印被动解锁，以及全部角色技能配置可解释性遍历。',data.cards.length,Object.keys(data.skills).length);
