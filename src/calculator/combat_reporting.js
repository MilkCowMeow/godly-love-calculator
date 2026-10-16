/* Read-only accounting around the native event stream; never draws RNG or changes battle state. */
(function(root){'use strict';
const keys=['healing','attempted','overheal','blocked','shield','receivedHealing','receivedShield','damageTaken','absorbed'];
function blank(){return {members:Array.from({length:4},()=>Object.fromEntries(keys.map(k=>[k,0]))),flows:[],snapshot:[]};}
function flow(report,kind,source,target){let f=report.flows.find(f=>f.kind===kind&&f.source===source&&f.target===target);if(!f){f={kind,source,target,amount:0,attempted:0,overheal:0,blocked:0,count:0};report.flows.push(f);}return f;}
function addEvent(report,kind,actor,target,extra){
 const source=extra.healingSource||actor?.uid,dest=target?.uid,si=source?.startsWith('0_')?Number(source.split('_')[1]):-1,ti=target?.camp===0?target.slot:-1;
 if(kind==='heal'){
  const actual=Math.max(0,Number(extra.heal)||0),attempt=Math.max(actual,Number(extra.healAttempted)||0),blocked=extra.healBlocked?attempt:0,overheal=extra.healBlocked?0:Math.max(0,Number(extra.overheal??(attempt-actual))||0);
  const f=flow(report,'healing',source,dest);f.amount+=actual;f.attempted+=attempt;f.overheal+=overheal;f.blocked+=blocked;f.count++;
  if(si>=0){const m=report.members[si];m.healing+=actual;m.attempted+=attempt;m.overheal+=overheal;m.blocked+=blocked;}
  if(ti>=0)report.members[ti].receivedHealing+=actual;
 }
 if(kind==='status'&&extra.status==='Shield'&&Number.isFinite(extra.shieldGranted)){
  const amount=Math.max(0,extra.shieldGranted),f=flow(report,'shield',source,dest);f.amount+=amount;f.count++;
  if(si>=0)report.members[si].shield+=amount;if(ti>=0)report.members[ti].receivedShield+=amount;
 }
 if(extra.damage!==undefined&&ti>=0){report.members[ti].damageTaken+=Math.max(0,Number(extra.actual??extra.damage)||0);report.members[ti].absorbed+=Math.max(0,Number(extra.shieldAbsorbed)||0);}
}
function totals(result){const report=blank();for(const row of result.rows||[]){const r=row.report||blank();for(let i=0;i<4;i++)for(const k of keys)report.members[i][k]+=r.members[i][k]||0;for(const f of r.flows){const to=flow(report,f.kind,f.source,f.target);for(const k of ['amount','attempted','overheal','blocked','count'])to[k]+=f[k]||0;}}return report;}
function install(T){
 if(T.__combatReporting)return;T.__combatReporting=true;
 const S=T.Simulation,oldLog=S.prototype.log,oldFinish=S.prototype.finishRow,oldRun=T.run,oldAggregate=T.aggregate;
 S.prototype.log=function(kind,actor,target,text,extra={}){const event=oldLog.call(this,kind,actor,target,text,extra);this.row.report??=blank();addEvent(this.row.report,kind,actor,target,extra);return event;};
 S.prototype.finishRow=function(){oldFinish.call(this);const row=this.rows.at(-1);row.report??=blank();row.report.snapshot=this.units.filter(u=>u.camp===0).map(u=>({slot:u.slot,hp:u.hp,maxHP:u.stats.MaxHP,alive:u.dead?0:1,shield:u.statuses.filter(s=>s.id==='Shield').reduce((a,s)=>a+s.value,0)}));};
 T.run=function(...args){const result=oldRun(...args);if(result.ok)result.report=totals(result);return result;};
 T.aggregate=function(samples,rounds){
  const result=oldAggregate(samples,rounds);if(!result.ok)return result;const n=samples.length;
  for(const row of result.rows){
   const report=blank();
   for(const sample of samples){
    const r=sample.rows.find(r=>r.round===row.round)?.report;
    if(r){
     for(let i=0;i<4;i++)for(const k of keys)report.members[i][k]+=(r.members[i][k]||0)/n;
     for(const f of r.flows){const to=flow(report,f.kind,f.source,f.target);for(const k of ['amount','attempted','overheal','blocked','count'])to[k]+=(f[k]||0)/n;}
    }
    // A completed battle retains its final health state; later output is zero.
    const snapshot=r?.snapshot||sample.rows.filter(r=>r.round<=row.round).at(-1)?.report?.snapshot||[];
    for(const snap of snapshot){let to=report.snapshot.find(s=>s.slot===snap.slot);if(!to){to={slot:snap.slot,hp:0,maxHP:0,alive:0,shield:0};report.snapshot.push(to);}for(const k of ['hp','maxHP','alive','shield'])to[k]+=(snap[k]||0)/n;}
   }
   row.report=report;
  }
  result.report=totals(result);return result;
 };
}
function series(result,key){return (result.rows||[]).map(row=>({round:row.round,values:Array.from({length:4},(_,slot)=>key==='hp'?row.report?.snapshot.find(s=>s.slot===slot)?.hp??0:['damage','direct','dot'].includes(key)?row.members[slot]?.[key]||0:row.report?.members[slot]?.[key]||0)}));}
const api={blank,keys,addEvent,totals,series,install};root.GLReports=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
