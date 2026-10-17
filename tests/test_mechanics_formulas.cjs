'use strict';
const assert=require('node:assert/strict'),B=require('./battle_core.js'),{T}=require('./load_simulation.cjs');
assert.equal(B.finalStat(1000,.15+.2),1350,'same-type percentages are additive');
assert.equal(B.roundEven(2.5),2);assert.equal(B.roundEven(3.5),4);
const penetration=B.rawSkillDamage({attack:1000,defence:2000,attRate:1,penetrations:[.5,.5,0]});
assert.equal(penetration.effectiveDefence,500,'two separate 50% paths leave 25% defence');
const hits=B.hitChances({sourceElement:'None',targetElement:'None',criticalRate:.15});
assert.ok(Math.abs(hits.big-.2125)<1e-7,'25% is conditional after the critical branch');
assert.ok(Math.abs(B.effectChance(.75,.2,.1)-.6375)<1e-6);
const damage={attack:267,defence:0,attRate:1,currentHP:100};
const ordinary=B.settle(damage,1),immortal=B.settle({...damage,immortal:true},1);
assert.equal(ordinary.damage,500); // 267 × 1.871 rounds to 500 after float32 resolution.
assert.equal(ordinary.hpLoss,100);assert.equal(immortal.hpLoss,99);
const samples=[10,20,30].map(total=>({ok:true,total,bossDamage:0,rows:[],result:'limit'}));
const mean=T.aggregate(samples,1);assert.equal(mean.total,20);assert.ok(Math.abs(mean.standardError-Math.sqrt(100/3))<1e-9);
console.log('通过：机制说明的同类加成、穿透、条件命中概率、效果概率、舍入、保命与标准误示例。');
