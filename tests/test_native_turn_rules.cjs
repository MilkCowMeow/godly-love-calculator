const assert=require('node:assert/strict');
global.GLConfig={nativeStatusProperties(){return {lists:{}}},resolveSkill(){return {functions:[]}}};
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
sim=new S();sim.units=[a,b];sim.nowRoundRole=a;sim.data.skills.s={id:'s',raw:{AttRate:'1'}};sim.skillAction=x=>sim.trace.push(x.kind+':'+(x.priority||0));sim.queues=['addition','pinch','continue','counter','pinch'].map((kind,i)=>({actor:a,selected:b,kind,priority:i,skill:sim.data.skills.s}));sim.followups();assert.deepEqual(sim.trace,['continue:2','pinch:4','counter:3','addition:0']);
sim=new S();a=unit('a');b=unit('b',1);sim.units=[a,b];sim.nowRoundRole=a;sim.data.skills.s={id:'s',raw:{AttRate:'1'}};sim.random=()=>.4;a.stats.PinchRate=1;b.props.CounterRate=1;let action={actor:a,selected:b,skill:sim.data.skills.s,main:true,directTargets:[b]};sim.processNaturalFollowups(action,'beforeDamage');assert.equal(sim.queues.length,0);sim.processNaturalFollowups(action,'afterDamage');assert.equal(sim.queues[0].kind,'counter');
sim=new S();a=unit('a');b=unit('b',1);sim.units=[a,b];sim.data.skills.s={id:'s',raw:{AttRate:'1'}};sim.step();assert.equal(a.nowRound,2);assert.equal(a.displayRound,2);assert.equal(a.cooldowns.s,2);assert.equal(sim.nowRoundRole,a);assert.ok(sim.trace.indexOf('status:before')<sim.trace.indexOf('main'));assert.ok(sim.trace.indexOf('a:AfterRound')<sim.trace.indexOf('status:after'));assert.ok(sim.trace.includes('b:AnyEnemyAfterRound'));assert.ok(sim.trace.includes('b:AnyOtherAfterRound'));
console.log('native turn rules: 6 groups passed');
