'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
require('./load_simulation.cjs');
const B=global.GLBattle;
const fixture=JSON.parse(fs.readFileSync(__dirname+'/native_trial37_20261023.json','utf8'));

// 输入固定为原生日志已观察的命中分支及标量参数。
// 该夹具覆盖公式与取整；行动、属性生成、状态、AI和随机序列各有独立回归。
assert.equal(fixture.schemaVersion,1);
assert.equal(fixture.samples.length,29,'完整保存29条实测标量伤害');
assert.equal(fixture.loggedPrecisionTolerance,.005,'容差仅对应原生日志的小数输出精度');
const lines=new Set(),hits=new Set();
for(const sample of fixture.samples){
  assert.deepEqual(Object.keys(sample).sort(),['expectedInteger','expectedRaw','hitMultiplier','line','params'],'夹具只保留脱敏战斗字段');
  assert.ok(Number.isSafeInteger(sample.line)&&sample.line>0);
  assert.ok(!lines.has(sample.line),'每个原生日志行只记一条样本');lines.add(sample.line);
  assert.ok(Number.isFinite(sample.expectedRaw));
  assert.ok(Number.isSafeInteger(sample.expectedInteger));
  assert.ok(Number.isFinite(sample.hitMultiplier));hits.add(sample.hitMultiplier);
  for(const [key,value]of Object.entries(sample.params)){
    const values=Array.isArray(value)?value:[value];
    assert.ok(values.every(Number.isFinite),`原生日志第${sample.line}行参数${key}必须为有限数值`);
  }
  const label=`原生日志第${sample.line}行`;
  const actual=B.rawSkillDamage(sample.params,sample.hitMultiplier).value;
  assert.ok(Math.abs(actual-sample.expectedRaw)<=fixture.loggedPrecisionTolerance,`${label}浮点伤害：${actual}，期望${sample.expectedRaw}`);
  assert.equal(B.roundEven(actual),sample.expectedInteger,`${label}伤害取整`);
  assert.equal(B.roundEven(sample.expectedRaw),sample.expectedInteger,`${label}原生日志与整数预期一致`);
  const settled=B.settle(sample.params,sample.hitMultiplier);
  assert.equal(settled.beforeShield,sample.expectedInteger,`${label}标量结算入口的取整结果`);
}
assert.deepEqual([...hits].sort((a,b)=>a-b),[.75,1,1.15,1.3],'覆盖闪避、普通、强击和暴击四种实测倍率');
assert.ok(fixture.samples.some(s=>s.params.conditionMultiplier>1),'保留条件增伤的实测样本');
assert.ok(fixture.samples.some(s=>s.params.conquerMultiplier===1.1),'保留有利属性倍率的实测样本');
assert.ok(fixture.samples.some(s=>s.params.penetrations.some(x=>x>0)),'保留穿透的实测样本');
console.log('通过：试炼第37层29条实测标量伤害、四种命中倍率、条件增伤、属性倍率、穿透与最终取整。');
