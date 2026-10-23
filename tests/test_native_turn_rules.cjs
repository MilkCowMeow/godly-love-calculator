const assert=require('node:assert/strict');
global.GLBattle=require('./battle_core.js');
global.GLConfig={isDamageHit:require('./config_engine.js').isDamageHit,nativeStatusProperties(){return {lists:{}}},resolveSkill(){return {functions:[]}}};
const native=require('./native_turn_rules.js');
class S{
 constructor(){this.units=[];this.extraRounds=[];this.queues=[];this.time=0;this.actionNumber=0;this.result='running';this.rowActions=new Set();this.row={mainActions:0};this.data={skills:{},statuses:{}};this.trace=[];}
 alive(camp){return this.units.filter(x=>!x.dead&&(camp===undefined||x.camp===camp));}
 locate(id){return this.units.find(x=>x.uid===id);}
 ownFunctions(){return [];}
 willPass(u){return !!u.props.Dizzy;}
 refresh(){}
 log(kind,u,t,text){this.trace.push(kind);}
 trigger(u,name){this.trace.push(u.uid+':'+name);}
 tickStatuses(u,a){this.trace.push('status:'+(a.statusPhase||'before'));}
 choose(u){return {skill:this.data.skills[u.normal],selected:this.units.find(x=>x.camp!==u.camp)};}
 skillAction(a){this.trace.push(a.kind);return a;}
 execute(){}
 finishRow(){this.trace.push('finish');}
}
native.install(S);
const unit=(id,camp=0,p=0,speed=100)=>({uid:id,camp,progress:p,stats:{Speed:speed,PinchRate:0},props:{},statuses:[],card:{id,name:id,configs:[]},skills:['s'],normal:'s',cooldowns:{s:3},nowRound:1,displayRound:1,mainCount:0,hp:10});
let sim=new S(),a=unit('a'),b=unit('b',1);sim.units=[a,b];assert.equal(sim.nextActor(),a);assert.equal(b.progress,1);assert.equal(sim.time,Math.fround(1/100));
sim=new S();a=unit('a',0,1.25);b=unit('b',1,.7);sim.units=[a,b];assert.equal(sim.nextActor(),a);assert.equal(b.progress,.7);assert.equal(sim.time,0);
sim=new S();a=unit('a',0,.2);b=unit('b',1,.7);sim.units=[a,b];sim.extraRounds=['a'];assert.equal(sim.nextActor(),a);assert.equal(a.progress,.2);assert.equal(b.progress,.7);
sim=new S();sim.units=[a,b];sim.nowRoundRole=a;sim.data.skills.s={id:'s',raw:{AttRate:'1',Pow:'1'}};sim.skillAction=x=>sim.trace.push(x.kind+':'+(x.priority||0));sim.queues=['addition','pinch','continue','counter','pinch'].map((kind,i)=>({actor:a,selected:b,kind,priority:i,skill:sim.data.skills.s}));sim.followups();assert.deepEqual(sim.trace,['continue:2','pinch:4','counter:3','addition:0']);
sim=new S();a=unit('a');b=unit('b',1);sim.units=[a,b];sim.nowRoundRole=a;sim.data.skills.s={id:'s',raw:{AttRate:'1',Pow:'1'}};sim.random=()=>.4;a.stats.PinchRate=1;b.props.CounterRate=1;let action={actor:a,selected:b,skill:sim.data.skills.s,main:true,directTargets:[b]};sim.processNaturalFollowups(action,'beforeDamage');assert.equal(sim.queues.length,0);sim.processNaturalFollowups(action,'afterDamage');assert.equal(sim.queues[0].kind,'counter');
// 原生天然协战看Enemy阵营和首技能ID，反击还检查当前SourceSkill是否造成伤害。
sim=new S();a=unit('a');b=unit('b',1);const ally=unit('ally');ally.stats.PinchRate=1;sim.units=[a,b,ally];sim.nowRoundRole=a;sim.random=()=>.4;sim.data.skills.s={id:'s',raw:{TargetCamp:'Enemy',AttRate:'0',Pow:'0'}};b.props.CounterRate=1;action={actor:a,selected:b,skill:sim.data.skills.s,main:true,directTargets:[b]};sim.processNaturalFollowups(action,'beforeDamage');assert.deepEqual(sim.queues.map(x=>x.kind),['pinch']);sim.processNaturalFollowups(action,'afterDamage');assert.deepEqual(sim.queues.map(x=>x.kind),['pinch'],'零倍率NoHit仅保留满足条件的天然协战');
sim=new S();a=unit('a');b=unit('b',1);sim.units=[a,b];sim.data.skills.s={id:'s',raw:{AttRate:'1',Pow:'1'}};sim.step();assert.equal(a.nowRound,2);assert.equal(a.displayRound,2);assert.equal(a.cooldowns.s,2);assert.equal(sim.nowRoundRole,a);assert.ok(sim.trace.indexOf('status:before')<sim.trace.indexOf('main'));assert.ok(sim.trace.indexOf('a:AfterRound')<sim.trace.indexOf('status:after'));assert.ok(sim.trace.includes('b:AnyEnemyAfterRound'));assert.ok(sim.trace.includes('b:AnyOtherAfterRound'));
// U04原版试炼45：Boss死亡后，尚有17024HP随从被独立系统事件清场。
function bossFixture(){const sim=new S(),owner=unit('owner'),boss=unit('boss',1),minion=unit('minion',1);boss.isMonster=true;boss.isBoss=true;boss.hp=0;boss.dead=true;minion.hp=17024;minion.statuses=[{id:'shield',value:3000},{id:'poison',value:500}];sim.data.statuses={shield:{raw:{IsBuffType:'Buff'}},poison:{raw:{IsBuffType:'DeBuff'}}};sim.statusType=s=>sim.data.statuses[s.id].raw.IsBuffType;sim.row.total=440;sim.units=[owner,boss,minion];sim.nativeStatusMutation=(source,target,action,spec,mutate)=>{assert.equal(source,null);assert.equal(target.hp,17024);assert.deepEqual(spec.removedStatuses.map(s=>s.id),['shield','poison']);assert.equal(spec.hitType,'RemoveBuff');assert.equal(spec.eventFun,'RemoveBuf');return mutate();};return {sim,owner,boss,minion};}
{
 const {sim,minion}=bossFixture();const previous={kind:'main'};sim.action=previous;
 assert.equal(sim.processNativeBossDead(),1);assert.equal(minion.hp,0);assert.equal(minion.dead,true);assert.equal(minion.IsDieOut,true);assert.deepEqual(minion.statuses,[]);assert.equal(sim.row.total,440,'系统清场保留此前440追加伤害，不添加17024伤害');assert.equal(sim.action,previous);assert.ok(sim._nativeProcessedDeaths.has(minion.uid));assert.equal(sim.processNativeBossDead(),0,'退场事件保持幂等');assert.ok(!sim.trace.some(t=>/SelfDead|OtherDead/.test(t)),'HP归零后的NoHit事件跳过常规死亡触发');assert.deepEqual(sim.trace.slice(-3),['minion:BeforeEvent','minion:AfterEvent','death']);
}
{
 const {sim,boss,minion}=bossFixture();boss.hp=1;boss.dead=false;assert.equal(sim.processNativeBossDead(),0,'Boss被保命或复活后继续战斗');assert.equal(minion.hp,17024);boss.hp=0;boss.dead=true;boss.isBoss=false;assert.equal(sim.processNativeBossDead(),0,'无怪物Boss的场景保持全员清空判定');
}
{
 const {sim,boss,minion}=bossFixture(),second=unit('second-boss',1);second.isMonster=true;second.isBoss=true;second.hp=9000;sim.units.push(second);assert.equal(sim.processNativeBossDead(),1);assert.equal(second.hp,9000,'首个Boss触发清场时，其它Boss不在非Boss列表内');assert.equal(minion.hp,0);
}
{
 const {sim,boss,minion}=bossFixture(),first=unit('first-boss',1);first.isMonster=true;first.isBoss=true;first.hp=1;sim.units.unshift(first);assert.equal(sim.processNativeBossDead(),0,'BossRole沿用原容器首Boss语义');assert.equal(minion.hp,17024);
}
{
 const sim=new S(),owner=unit('owner'),boss=unit('boss',1),minion=unit('minion',1);boss.isMonster=true;boss.isBoss=true;boss.hp=1;minion.hp=17464;sim.units=[owner,boss,minion];sim.row.total=0;sim.data.skills.s={id:'s',raw:{AttRate:'1',Pow:'1'}};sim.statusType=()=>'';
 sim.skillAction=function(a){if(a.main){boss.hp=0;boss.dead=true;this.queues.push({actor:owner,skill:this.data.skills.s,selected:minion,kind:'addition',main:false});}else{assert.equal(minion.hp,17464,'追加技能发生在清场前');minion.hp-=440;this.row.total+=440;this.trace.push('native-extra-440');}return a;};
 sim.nativeAfterRoundSkill=function(){assert.equal(minion.hp,17024,'角色AfterRound发生在清场前');this.trace.push('native-after-round');};
 sim.step();assert.equal(sim.result,'victory');assert.equal(sim.row.total,440);assert.equal(minion.hp,0);assert.ok(sim.trace.indexOf('native-extra-440')<sim.trace.indexOf('native-after-round'));assert.ok(sim.trace.indexOf('native-after-round')<sim.trace.lastIndexOf('death'));
}
{
 const sim=new S(),owner=unit('owner'),boss=unit('boss',1),minion=unit('minion',1);boss.isMonster=true;boss.isBoss=true;sim.units=[owner,boss,minion];sim.data.skills.s={id:'s',raw:{AttRate:'1',Pow:'1'}};sim.statusType=()=>'';sim.nativeAfterRoundSkill=function(){boss.hp=0;boss.dead=true;};sim.step();assert.equal(sim.result,'victory','行动后触发伤害使Boss死亡时，同阶段完成清场');assert.equal(minion.hp,0);
}
{
 const sim=new S(),owner=unit('owner'),boss=unit('boss',1),minion=unit('minion',1);boss.isMonster=true;boss.isBoss=true;sim.units=[owner,boss,minion];sim.data.skills.s={id:'s',raw:{AttRate:'1',Pow:'1'}};sim.statusType=()=>'';sim.tickStatuses=function(u,a){if(a.statusPhase!=='after'){boss.hp=0;boss.dead=true;}};sim.choose=()=>{throw Error('开始状态伤害已结束波次，应跳过主行动');};sim.nativeAfterRoundSkill=()=>{throw Error('波次结束应跳过AfterRound');};assert.equal(sim.step(),false);assert.equal(sim.result,'victory');assert.equal(minion.hp,0);assert.equal(owner.displayRound,1);assert.equal(owner.cooldowns.s,3);
}
console.log('native turn rules: 13 groups passed');
