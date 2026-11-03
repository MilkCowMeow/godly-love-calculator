const assert=require('node:assert/strict');
const Native=require('./native_complex_rules.js');
class Simulation{
 constructor(){this.data={statuses:{A:{raw:{IsBuffType:'Buff',Group:'A',RoundCount:'3'},configs:[]},B:{raw:{IsBuffType:'Buff',Group:'B',RoundCount:'3'},configs:[]},R:{raw:{IsBuffType:'Buff',Group:'R',IsResident:'TRUE'},configs:[]},D:{raw:{Group:'D',RoundCount:'2'},configs:[]},Burn:{raw:{Group:'Burn',RoundCount:'2',IsReduceBeforeRound:'TRUE'},name:'炽燃',configs:[{key:'Fun',value:{Fun:'BuffAttack'}}]},Plain:{raw:{Group:'Plain'},configs:[]}}};this.units=[];this.events=[];this.reviveQueue=[];this.nativeComplexDamageQueue=[];this.calls=[];}
 unit(id,camp,extra={}){const u={uid:id,camp,props:{},immuneList:[],statuses:[],stats:{MaxHP:100},nowRound:4,displayRound:3,hp:100,dead:false,...extra};this.units.push(u);return u;}
 alive(camp){return this.units.filter(u=>!u.dead&&(camp===undefined||u.camp===camp));}
 locate(id){return this.units.find(u=>u.uid===id);}
 select(owner,setting,action,target){return action.directTargets||[target];}
 effectResisted(owner,target,f,action,ctx,ignoreImmune){assert.equal(f._nativeAntiChecked,true);return !!target.blocked;}
 addStatusClone(owner,target,st){target.statuses.push({...st});return true;}
 refresh(){}
 log(kind,actor,target,text,extra){this.events.push({kind,actor,target,text,extra});}
 trigger(owner,trigger){this.calls.push(['trigger',owner.uid,trigger]);}
 directDamage(...args){this.calls.push(['directDamage',...args]);}
}
Native.install(Simulation);assert.equal(Native.install(Simulation),Simulation);
const st=(id,extra={})=>({id,source:'old',stack:1,value:5,until:8,inSelfStartDisplayRound:-1,...extra});
let tests=0;function test(name,fn){fn();tests++;console.log('PASS '+name);}
test('steal selects TakeLast and excludes resident',()=>{const s=new Simulation(),a=s.unit('a',0),e=s.unit('e',1);e.statuses=[st('A'),st('B'),st('R')];const r=s.executeComplex(a,{Fun:'TransferBuff',_origin:'S',_field:'1'}, {},e,null,{},1);assert.equal(r.success,true);assert.deepEqual(e.statuses.map(x=>x.id),['A','R']);assert.deepEqual(a.statuses.map(x=>x.id),['B']);assert.equal(a.statuses[0].source,'a');});
test('TransferDeBuff moves owner negative state to enemy',()=>{const s=new Simulation(),a=s.unit('a',0),e=s.unit('e',1);a.statuses=[st('D')];s.executeComplex(a,{Fun:'TransferDeBuff'}, {},e,null,{},1);assert.equal(a.statuses.length,0);assert.equal(e.statuses[0].id,'D');});
test('TransferBuffFrom shares removed source set and translates UntilRound',()=>{const s=new Simulation(),a=s.unit('a',0),b=s.unit('b',0,{nowRound:8}),e=s.unit('e',1,{displayRound:2});e.statuses=[st('A'),st('B',{until:6,inSelfStartDisplayRound:2,stack:2})];const action={directTargets:[e]},f={Fun:'TransferBuffFrom',FromSelect:{TargetType:'SkillDirectTargets'},_origin:'S',_field:'1'};s.executeComplex(a,f,action,a,null,{},1);s.executeComplex(a,f,action,b,null,{},1);assert.deepEqual(e.statuses.map(x=>x.id),['A']);assert.equal(a.statuses[0].id,'B');assert.equal(b.statuses[0].id,'B');assert.equal(a.statuses[0].until,7);assert.equal(b.statuses[0].until,11);assert.equal(b.statuses[0].stack,2);});
test('dedicated transfer immunity blocks before removal',()=>{const s=new Simulation(),a=s.unit('a',0),e=s.unit('e',1,{immuneList:['AntiTransferBuff']});e.statuses=[st('A')];assert.equal(s.executeComplex(a,{Fun:'TransferBuff'}, {},e,null,{},1).success,false);assert.equal(e.statuses.length,1);});
test('multi-status transfer emits one removal and one addition event batch',()=>{const s=new Simulation(),a=s.unit('a',0),e=s.unit('e',1);e.statuses=[st('A'),st('B')];s.executeComplex(a,{Fun:'TransferBuff'}, {},e,null,{},2);assert.deepEqual(s.calls,[['trigger','e','BeforeEvent'],['trigger','e','AfterEvent'],['trigger','a','BeforeEvent'],['trigger','a','AfterEvent']]);});
test('DirectRevive truncates HP and does not force minimum one',()=>{const s=new Simulation(),a=s.unit('a',0),b=s.unit('b',0,{dead:true,hp:0});s.executeComplex(a,{Fun:'DirectRevive'}, {},b,null,{},48.9);assert.equal(b.hp,48);b.dead=true;b.hp=0;s.executeComplex(a,{Fun:'DirectRevive'}, {},b,null,{},0);assert.equal(b.hp,0);assert.equal(b.dead,true);});
test('Revive queue prioritizes larger ParamOrder and remains delayed',()=>{const s=new Simulation(),a=s.unit('a',0),b=s.unit('b',0,{dead:true,hp:0});s.executeComplex(a,{Fun:'Revive',ParamOrder:1}, {},b,null,{},20);s.executeComplex(a,{Fun:'Revive',ParamOrder:99}, {},b,null,{},30);assert.equal(b.dead,true);assert.equal(s.flushRevives(),1);assert.equal(b.hp,30);});
test('revive event completes before AfterRevive callbacks',()=>{const s=new Simulation(),a=s.unit('a',0),b=s.unit('b',0,{dead:true,hp:0});s.executeComplex(a,{Fun:'DirectRevive'}, {},b,null,{},20);assert.deepEqual(s.calls,[['trigger','b','BeforeEvent'],['trigger','b','AfterEvent'],['trigger','b','AfterRevive'],['trigger','a','AfterRevive']]);});
test('queued revival does not re-evaluate later anti-revive aura',()=>{const s=new Simulation(),a=s.unit('a',0),b=s.unit('b',0,{dead:true,hp:0}),e=s.unit('e',1);s.executeComplex(a,{Fun:'Revive'}, {},b,null,{},30);e.props.EnemyCantRevive=1;s.flushRevives();assert.equal(b.hp,30);});
test('enemy no-revive aura blocks DirectRevive; AntiCantRevive bypasses',()=>{const s=new Simulation(),a=s.unit('a',0),b=s.unit('b',0,{dead:true,hp:0}),e=s.unit('e',1,{props:{EnemyCantRevive:1}});assert.equal(s.executeComplex(a,{Fun:'DirectRevive'}, {},b,null,{},20).success,false);b.immuneList=['AntiCantRevive'];assert.equal(s.executeComplex(a,{Fun:'DirectRevive'}, {},b,null,{},20).success,true);});
test('SplitDamage records candidate even on dodge and prevents recursive splits',()=>{const s=new Simulation(),protectedUnit=s.unit('protected',0),guard=s.unit('guard',0),enemy=s.unit('enemy',1),event={target:protectedUnit,source:enemy,damage:true,hpDiff:-100},action={actor:enemy,hitType:'dodge'};assert.equal(s.executeComplex(protectedUnit,{Fun:'SplitDamage',IsAura:true},action,guard,event,{auraSource:guard},.15).success,true);assert.equal(event.splits[0].hpDiff,-15.000000953674316);event.isSplit=true;assert.equal(s.executeComplex(protectedUnit,{Fun:'SplitDamage'},action,guard,event,{},.15).success,false);});
test('BlastBuff removes exactly FID states and queues defence-aware damage',()=>{const s=new Simulation(),a=s.unit('a',0),e=s.unit('e',1);e.statuses=[st('Burn'),st('Burn'),st('D')];assert.equal(s.executeComplex(a,{Fun:'BlastBuff',FID:'Burn'}, {},e,null,{},22).success,true);assert.deepEqual(e.statuses.map(x=>x.id),['D']);assert.equal(s.calls.filter(x=>x[0]==='directDamage').length,0);s.flushComplexDamage();const x=s.calls.find(x=>x[0]==='directDamage');assert.equal(x[5],false);assert.equal(x[3],22);});
test('native BlastRoundValue sums instance value times remaining native rounds',()=>{const s=new Simulation(),e=s.unit('e',1,{nowRound:4,displayRound:3});e.statuses=[st('Burn',{until:6,value:10}),st('Burn',{until:5,value:5})];assert.equal(s.nativeBlastRoundValue(e,'Burn'),25);});
test('DirectHPValueHit also queues and clears native trigger source',()=>{const s=new Simulation(),a=s.unit('a',0),e=s.unit('e',1);s.executeComplex(a,{Fun:'DirectHPValueHit'}, {},e,null,{},33);assert.equal(s.calls.length,0);s.flushComplexDamage();const x=s.calls[0];assert.equal(x[3],33);assert.equal(x[5],true);assert.equal(x[6].sourceRole,null);assert.equal(x[6].eventFun,'DirectHPValueHit');});
test('source death only removes marked states on living others; nonzero numeric flag',()=>{const s=new Simulation(),d=s.unit('d',0,{dead:true,hp:0}),a=s.unit('a',0),e=s.unit('e',1,{dead:true,hp:0});s.data.statuses.A.configs=[{key:'IsSourceDeadRemove',value:-2}];d.statuses=[st('A',{source:'d'})];a.statuses=[st('A',{source:'d'}),st('B',{source:'d'}),st('A',{source:'someoneElse'})];e.statuses=[st('A',{source:'d'})];assert.equal(s.processNativeSourceDeath(d,{}),1);assert.equal(a.statuses.length,2);assert.equal(d.statuses.length,1);assert.equal(e.statuses.length,1);assert.deepEqual(s.calls,[['trigger','a','BeforeEvent'],['trigger','a','AfterEvent']]);});
test('source death flag ignores instance multiplication and no marker means retain',()=>{const s=new Simulation(),d=s.unit('d',0,{dead:true,hp:0}),a=s.unit('a',0);s.data.statuses.A.raw.IsMergeProperty='TRUE';s.data.statuses.A.raw.IsValueMultiplyProp='TRUE';s.data.statuses.A.configs=[{key:'IsSourceDeadRemove',value:1}];a.statuses=[st('A',{source:'d',value:0,stack:0}),st('B',{source:'d'})];assert.equal(s.processNativeSourceDeath(d,{}),1);assert.deepEqual(a.statuses.map(x=>x.id),['B']);});
test('death cleanup retains only DeadResident and emits OtherDeadAfter once',()=>{const s=new Simulation(),d=s.unit('d',0,{dead:true,hp:0}),a=s.unit('a',0),e=s.unit('e',1,{dead:true,hp:0});s.data.statuses.B.raw.DeadResident='TRUE';d.statuses=[st('A'),st('B'),st('R')];s.trigger=function(owner,trigger){if(trigger==='OtherDeadAfter')assert.deepEqual(d.statuses.map(x=>x.id),['B']);this.calls.push(['trigger',owner.uid,trigger]);};assert.equal(s.processNativeDeaths({}),2);assert.deepEqual(d.statuses.map(x=>x.id),['B']);assert.deepEqual(s.calls,[['trigger','a','OtherDeadAfter'],['trigger','a','OtherDeadAfter']]);s.processNativeDeaths({});assert.equal(s.calls.length,2);});
test('revival clears death dedup so a second death dispatches again',()=>{const s=new Simulation(),d=s.unit('d',0,{dead:true,hp:0}),a=s.unit('a',0);s.processNativeDeaths({});s.executeComplex(a,{Fun:'DirectRevive'}, {},d,null,{},30);d.hp=0;d.dead=true;s.processNativeDeaths({});assert.equal(s.calls.filter(x=>x[2]==='OtherDeadAfter').length,2);});
test('unhandled functions remain available to main interpreter',()=>{const s=new Simulation();assert.deepEqual(s.executeComplex(null,{Fun:'AddHP'}),{handled:false,success:false});});

// 015084 C01_SR_009S3: exercise the shipped configuration through the complete
// selector, condition, continuation and status interpreter, with real statuses.
const live=require('./load_simulation.cjs'),LiveConfig=global.GLConfig;
function updatedTransferFixture(teammates=3){
 const skillID='C01_SR_009S3',skill=live.data.skills[skillID],raw=skill.configs.find(c=>c.key==='Fun').value;
 assert.equal(raw.Fun,'TransferBuffFrom');assert.equal(raw.Target,'Self');
 assert.equal(raw.IsTransferBuffRemove,false);assert.equal(raw.Value,2);
 assert.equal(raw.ContinueFun.Fun,'TransferBuffFrom');assert.equal(raw.ContinueFun.Target,'All');
 assert.equal(raw.ContinueFun.TargetCamp,'My');assert.equal(raw.ContinueFun.NoSelf,true);
 assert.equal(raw.ContinueFun.FromSelect.TargetType,'SkillDirectTargets');
 const ids=['C01_SR_009',...['C01_R_001','C02_R_001','C03_R_001'].slice(0,teammates)];
 const sim=new live.T.Simulation(live.data,{members:ids.map(cardId=>({cardId,level:60,imprint:3})),target:'dummy',dummy:{referenceHP:100000,defence:0,speed:1,resistance:0},rounds:1},1);
 const owner=sim.units[0],donor=sim.alive(1)[0],allies=sim.alive(0).filter(u=>u!==owner);
 // Scope this integration to the one real passive; unrelated card passives and
 // opening states are excluded, while production execution remains unchanged.
 for(const u of sim.units){u.global=[];u.statuses=[];sim.refresh(u);}
 owner.global=LiveConfig.configFunctions(skill.configs,skillID);
 owner.cooldowns[skillID]=0;sim.random=()=>.01;sim.nowRoundRole=owner;
 for(const id of ['AddAttack','AddDefence','IncreaseSpeed'])assert.equal(sim.addStatus(donor,donor,id,3,0,null),true);
 sim.events.length=0;
 const action={actor:owner,skill:live.data.skills[owner.normal],selected:donor,directTargets:[donor],damage:0,main:true,normal:true,kind:'main',actionType:0};
 return {sim,owner,donor,allies,action,fire(){sim.trigger(owner,'AfterSkill',action);}};
}
test('native removable counts use visible non-resident instances for both status types',()=>{
 const {sim,owner,donor,action}=updatedTransferFixture(0);
 const definitions={
  visibleBuff:{IsBuffType:'Buff'},deadResidentBuff:{IsBuffType:'Buff',DeadResident:'TRUE',IsShowIcon:'TRUE'},
  hiddenBuff:{IsBuffType:'Buff',IsShowIcon:'FALSE'},residentBuff:{IsBuffType:'Buff',IsResident:'TRUE'},
  visibleDebuff:{IsBuffType:''},hiddenDebuff:{IsBuffType:'DeBuff',IsShowIcon:'FALSE'},
  residentDebuff:{IsBuffType:'DeBuff',IsResident:'TRUE'},otherType:{IsBuffType:'None',IsShowIcon:'TRUE'}
 };
 sim.data={...sim.data,statuses:{...sim.data.statuses,...Object.fromEntries(Object.entries(definitions).map(([id,raw])=>[id,{raw,configs:[]}]))}};
 donor.statuses=Object.keys(definitions).map(id=>({id,stack:99,value:999}));
 const ctx=sim.context(owner,donor,action);
 assert.equal(ctx.resolveProperty('CanRemoveBuffCount',donor),2);
 assert.equal(ctx.resolveProperty('CanRemoveDebuffCount',donor),1);
 donor.statuses[0].stack=0;donor.statuses[1].value=0;
 assert.equal(ctx.resolveProperty('CanRemoveBuffCount',donor),2,'merged stack/value never multiply the count');
 donor.statuses.push({id:'visibleBuff',stack:30});
 assert.equal(ctx.resolveProperty('CanRemoveBuffCount',donor),3,'each distinct status instance contributes one');
});
test('015084 real C01_SR_009S3 copies to self then shares one removed pair with all teammates',()=>{
 const {sim,owner,donor,allies,fire}=updatedTransferFixture();fire();
 for(const u of [owner,...allies])assert.deepEqual(u.statuses.map(s=>s.id),['AddDefence','IncreaseSpeed'],u.uid);
 assert.deepEqual(donor.statuses.map(s=>s.id),['AddAttack']);
 const removals=sim.events.filter(e=>e.text==='转出状态');assert.equal(removals.length,1);
 assert.equal(removals[0].target,donor.uid);assert.deepEqual(removals[0].removed,['AddDefence','IncreaseSpeed']);
 const incoming=sim.events.filter(e=>e.text==='转入状态');assert.equal(incoming.length,4);
 assert.ok(incoming.find(e=>e.target===owner.uid).n<removals[0].n,'self copy precedes donor removal');
 for(const u of [owner,...allies])assert.ok(u.statuses.every(s=>s.source===owner.uid));
});
test('015084 real C01_SR_009S3 solo copy keeps the donor buffs without continuation recipients',()=>{
 const {sim,owner,donor,fire}=updatedTransferFixture(0);fire();
 assert.deepEqual(owner.statuses.map(s=>s.id),['AddDefence','IncreaseSpeed']);
 assert.deepEqual(donor.statuses.map(s=>s.id),['AddAttack','AddDefence','IncreaseSpeed']);
 assert.equal(sim.events.filter(e=>e.text==='转出状态').length,0);
});
test('015084 real C01_SR_009S3 recipient transfer immunity preserves the self copy and donor states',()=>{
 const {sim,owner,donor,allies,fire}=updatedTransferFixture();
 for(const u of allies)u.immuneList.push('AntiTransferBuff');fire();
 assert.deepEqual(owner.statuses.map(s=>s.id),['AddDefence','IncreaseSpeed']);
 for(const u of allies)assert.deepEqual(u.statuses,[]);
 assert.deepEqual(donor.statuses.map(s=>s.id),['AddAttack','AddDefence','IncreaseSpeed']);
 assert.equal(sim.events.filter(e=>e.text==='转出状态').length,0);
});
console.log('native complex rules: '+tests+' tests passed');
