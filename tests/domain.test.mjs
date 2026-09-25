import test from 'node:test';import assert from 'node:assert/strict';import{distance,reduce,initial,validate,pointAt,totalSeconds}from'../dist/domain.mjs';
const event=(t,status='matched')=>({timestamp:`2026-09-06T00:00:${String(t).padStart(2,'0')}Z`,status,latitude:13,longitude:100,confidence:.9});
test('distance known equatorial arc',()=>assert.ok(Math.abs(distance([0,0],[0,.001])-111.195)<.1));
test('unmatched preserves trusted target and breaks subsequent trail',()=>{let s=reduce(initial(),event(1));let u=reduce(s,event(2,'unmatched'));assert.deepEqual(s.target,u.target);assert.equal(u.segments.length,1);let b=reduce(u,event(3));assert.equal(b.segments.length,2);assert.equal(b.segments[0].length,1);});
test('low confidence also breaks trail',()=>{let s=reduce(initial(),event(1));s=reduce(s,event(2,'low_confidence'));assert.ok(s.gap);assert.equal(s.matchedTime,event(1).timestamp);});
test('out of order events discarded',()=>{const s=reduce(initial(),event(4));assert.equal(reduce(s,event(3)),s);});
test('private data and invalid values rejected',()=>{assert.throws(()=>validate({...event(1),cellname:'test'}));assert.throws(()=>validate({...event(1),latitude:NaN}));assert.throws(()=>validate({...event(1),confidence:1.5}));});
test('synthetic interpolation clamped',()=>{assert.deepEqual(pointAt(-10),pointAt(0));assert.deepEqual(pointAt(999),pointAt(totalSeconds));});
