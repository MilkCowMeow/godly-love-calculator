/* 014517 BattleCalculator 的标量结算；各运算点保留 float32。 */
(function(root){'use strict';
const f=Math.fround,clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
function roundEven(n){if(!Number.isFinite(n))throw Error('非有限数值');const lo=Math.floor(n),d=n-lo;return d<.5?lo:d>.5?lo+1:lo%2===0?lo:lo+1;}
const conquers=(s,t)=>({Ice:'Fire',Fire:'Earth',Earth:'Ground',Ground:'Ice',Light:'Dark',Dark:'Light'})[s]===t;
function relation(s,t,p={}){const attack=!p.noConquer&&(p.forceConquer||conquers(s,t));const defence=!p.targetNoConquer&&!p.forceConquer&&!p.noDefenceConquer&&conquers(t,s);return {attack,defence,multiplier:attack?1.1:1};}
function hitChances(p){const rel=relation(p.sourceElement,p.targetElement,p);let d=p.mustDodge>=1?1:p.noDodge>0||p.mustHit>0?0:clamp(f(f((p.dodgeRate||0)+(rel.defence&&!['Light','Dark'].includes(p.targetElement)?.5:0))-(p.hitRate||0)));let c=p.mustCritical>=1?1:p.noCritical>=1?0:clamp(f(f((p.criticalRate||0)+(rel.attack?.15:0))-(p.deCriticalRate||0)));let b=p.mustBigHit>=1?1:p.noBigHit>=1?0:.25;return {dodge:d,critical:(1-d)*c,big:(1-d)*(1-c)*b,normal:(1-d)*(1-c)*(1-b),raw:{dodge:d,critical:c,big:b},relation:rel};}
function rawSkillDamage(p,hit=1){
 const anti=Math.max(0,f(1-(p.antiPenetrate||0)));const rem=(p.penetrations||[0,0,0]).map(x=>Math.max(0,f(1-f(f(x)*anti))));
 let attack=f(f(p.attRate||0)*f(Math.trunc(p.attack||0)));
 let defence=f(f(p.defenceRate===undefined?1:p.defenceRate)*f(Math.trunc(p.defence||0)));
 defence=f(defence*rem[0]);const pow=f(f(p.attackPowerRate===undefined?1.871:p.attackPowerRate)*f(p.pow===undefined?1:p.pow));
 attack=f(f(p.constAttack||0)+attack);defence=f(defence*rem[1]);attack=f(attack*pow);attack=f(f(p.conditionMultiplier===undefined?1:p.conditionMultiplier)*attack);defence=f(defence*rem[2]);attack=f(f(p.conquerMultiplier===undefined?1:p.conquerMultiplier)*attack);const defRatio=f(defence/f(p.defenceConstant||2000));const numerator=f(f(hit)*attack),denominator=f(defRatio+1);
 return {value:f(numerator/denominator),numerator,denominator,effectiveDefence:defence,remainingPenetrations:rem};
}
function reduction(p){const positives=(p.hurtReductions||[]).filter(x=>x>=0),negatives=(p.hurtReductions||[]).filter(x=>x<0);let positive=Math.max(0,...positives),negative=negatives.reduce((a,b)=>f(a+b),0),runtime=p.runtimeHurtReduction||0;if(runtime>0)positive=f(positive+runtime);else negative=f(negative+runtime);if(p.ignoreHurtReduction)positive=0;return {positive,negative,multiplier:f(1-f(positive+negative))};}
function settle(p,multiplier){const raw=rawSkillDamage(p,multiplier);let value=f(raw.value*Math.max(0,f(1+f(p.sourceDamageRate||0))));const red=reduction(p);value=f(value*red.multiplier);if(p.maxSkillDamage>0)value=Math.min(value,f(p.maxSkillDamage));const beforeShield=roundEven(value);let damage=beforeShield,shield=Math.max(0,f(p.shield||0)),remainingShield=shield,absorbed=0;
 if(p.invincible||p.noDamage){damage=0;remainingShield=shield;}else if(damage>0&&shield>0){if(shield<damage){absorbed=roundEven(shield);damage-=absorbed;remainingShield=0;}else{absorbed=damage;remainingShield=f(shield-damage);damage=0;}}
 const currentHP=p.currentHP===undefined?Infinity:Math.max(0,p.currentHP),hpFloor=p.immortal&&currentHP>0?1:0,hpLoss=Math.max(0,Math.min(damage,currentHP-hpFloor));return {...raw,floatBeforeShield:value,beforeShield,damage,hpLoss,remainingHP:Number.isFinite(currentHP)?currentHP-hpLoss:null,absorbed,remainingShield,reduction:red};
}
function calculate(p,branch){const chances=hitChances(p),specs=[['normal','普通',1],['critical','暴击',p.criticalDamageRate===undefined?1.3:p.criticalDamageRate],['big','强击',1.15],['dodge','闪避',.75]];let rows=specs.map(([id,name,multiplier])=>{const overrides=branch?branch(id):{};const merged={...p,...overrides,conquerMultiplier:chances.relation.multiplier};return {id,name,probability:chances[id],multiplier,...settle(merged,id==='critical'&&p.mustCritical>=1?(p.forcedCriticalDamageRate||p.criticalDamageRate||1.3):multiplier),params:merged};});return {chances,rows,expectedDamage:rows.reduce((s,r)=>s+r.damage*r.probability,0),expectedBeforeShield:rows.reduce((s,r)=>s+r.beforeShield*r.probability,0),expectedHPLoss:rows.reduce((s,r)=>s+r.hpLoss*r.probability,0)};}
function effectChance(base,hit,resist,ignoreBuiltin=false){const threshold=f(f(1+f(hit||0))-f(resist||0));return clamp(base)*clamp(Math.min(threshold,ignoreBuiltin?1:f(1-.15)));}
function finalStat(base,rate=0,value=0,finalRate=0,kind='Attack'){const n=f((base*f(1+f(rate))+Math.trunc(value))*f(1+f(finalRate)));return ['HP','MaxHP','Speed'].includes(kind)?roundEven(n):Math.trunc(n);}
const api={f,clamp,roundEven,conquers,relation,hitChances,rawSkillDamage,reduction,settle,calculate,effectChance,finalStat};root.GLBattle=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
