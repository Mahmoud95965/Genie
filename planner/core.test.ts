// @ts-nocheck
import { test, expect } from 'vitest';
import assert from 'node:assert';
import * as Z from './core';
const spec = {
  "day": {"start": "07:00", "end": "23:00"},
  "noAfter": "22:00",
  "buffer": 10,
  "fixed": [
    {"id": "work", "title": "شغل", "start": "09:00", "end": "15:00"},
    {"id": "errand", "title": "مشوار", "start": "16:00", "end": "17:00"}
  ],
  "tasks": [
    {"id": "t1", "title": "مهمة ١", "minutes": 90, "deadline": "20:00"},
    {"id": "t2", "title": "مهمة ٢", "minutes": 60, "deadline": "20:00"}
  ]
};

test('schedule places both tasks with no violations', () => {
  const r = Z.schedule(spec);
  assert.deepStrictEqual(r.postponed, []);
  assert.deepStrictEqual(r.violations, []);
  assert.strictEqual(r.plan.length, 2);
});
test('check catches overlap with a fixed event', () => {
  const v = Z.check(spec, [{ id: 't1', start: '08:30', end: '10:00' }, { id: 't2', start: '15:10', end: '16:10' }]);
  assert.ok(v.some((x) => x.rule === 'overlap'));
});
test('check catches missed deadline, duration, unscheduled', () => {
  const v = Z.check(spec, [{ id: 't1', start: '19:00', end: '20:30' }]);
  const rules = v.map((x) => x.rule);
  assert.ok(rules.includes('deadline'));
  assert.ok(rules.includes('unscheduled'));
  const v2 = Z.check(spec, [{ id: 't1', start: '07:00', end: '08:00' }, { id: 't2', start: '08:10', end: '09:00' }]);
  assert.ok(v2.some((x) => x.rule === 'duration'));
});
test('check enforces buffer and noAfter', () => {
  const v = Z.check(spec, [{ id: 't1', start: '17:05', end: '18:35' }, { id: 't2', start: '20:30', end: '22:30' }]);
  assert.ok(v.some((x) => x.rule === 'buffer'));
  assert.ok(v.some((x) => x.rule === 'after_limit'));
});
test('impossible load postpones with a reason instead of faking a plan', () => {
  const s = JSON.parse(JSON.stringify(spec));
  s.tasks.push({ id: 't3', title: 'مهمة ٣', minutes: 600, deadline: '20:00' });
  const r = Z.schedule(s);
  assert.ok(r.postponed.some((p) => p.id === 't3' && p.reason));
  assert.deepStrictEqual(r.violations, []);
});
test('replan after delayed errand moves remaining tasks, keeps rules', () => {
  const r = Z.replan(spec, { now: '16:30', done: ['t1'], delay: [{ id: 'errand', byMin: 90 }] });
  assert.deepStrictEqual(r.violations, []);
  assert.ok(r.plan.every((p) => Z.toMin(p.start) >= Z.toMin('16:30')));
  const errandEnd = Z.toMin('18:30');
  assert.ok(r.plan.every((p) => Z.toMin(p.start) >= errandEnd + 10 || Z.toMin(p.end) <= Z.toMin('16:00') - 10));
});
test('invalid spec is rejected', () => {
  assert.throws(() => Z.normalizeSpec({ fixed: [{ id: 'a', start: '10:00', end: '09:00' }] }));
});
