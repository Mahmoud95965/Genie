/* eslint-disable */
// @ts-nocheck
  const toMin = (s) => {
    if (typeof s === 'number') return s;
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s));
    if (!m) throw new Error('bad time: ' + s);
    return +m[1] * 60 + +m[2];
  };
  const fmt = (n) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');

  // Spec: { day:{start,end}, noAfter?, buffer?, fixed:[{id,title,start,end}], tasks:[{id,title,minutes,deadline?,earliest?,priority?}] }
  function normalizeSpec(spec) {
    const errs = [];
    if (!spec || typeof spec !== 'object') throw new Error('spec must be an object');
    const day = { start: toMin(spec.day && spec.day.start != null ? spec.day.start : '07:00'), end: toMin(spec.day && spec.day.end != null ? spec.day.end : '23:00') };
    if (day.end <= day.start) errs.push('day end must be after start');
    const buffer = spec.buffer == null ? 0 : +spec.buffer;
    const noAfter = spec.noAfter == null ? null : toMin(spec.noAfter);
    const ids = new Set();
    const fixed = (spec.fixed || []).map((f) => {
      const o = { id: f.id, title: f.title || f.id, start: toMin(f.start), end: toMin(f.end) };
      if (o.end <= o.start) errs.push('fixed ' + o.id + ': end must be after start');
      if (ids.has(o.id)) errs.push('duplicate id ' + o.id); ids.add(o.id);
      return o;
    });
    const tasks = (spec.tasks || []).map((t) => {
      const o = { id: t.id, title: t.title || t.id, minutes: +t.minutes, deadline: t.deadline == null ? null : toMin(t.deadline), earliest: t.earliest == null ? null : toMin(t.earliest), priority: t.priority == null ? 2 : +t.priority };
      if (!(o.minutes > 0)) errs.push('task ' + o.id + ': minutes must be > 0');
      if (ids.has(o.id)) errs.push('duplicate id ' + o.id); ids.add(o.id);
      return o;
    });
    if (errs.length) { const e = new Error('invalid spec: ' + errs.join('; ')); e.errors = errs; throw e; }
    return { day, buffer, noAfter, fixed, tasks };
  }

  // plan: [{id,start,end}] covering tasks only (fixed events come from spec). Returns violations list.
  function check(specIn, plan) {
    const spec = normalizeSpec(specIn);
    const v = [];
    const limitEnd = spec.noAfter == null ? spec.day.end : Math.min(spec.day.end, spec.noAfter);
    const items = [];
    spec.fixed.forEach((f) => items.push({ kind: 'fixed', id: f.id, title: f.title, start: f.start, end: f.end }));
    const byTask = new Map(spec.tasks.map((t) => [t.id, t]));
    const got = new Map();
    (plan || []).forEach((p) => {
      const s = toMin(p.start), e = toMin(p.end);
      const t = byTask.get(p.id);
      if (!t) { v.push({ rule: 'unknown_item', id: p.id, msg: 'plan item not in spec: ' + p.id }); return; }
      if (e <= s) { v.push({ rule: 'bad_block', id: p.id, msg: p.id + ': end before start' }); return; }
      items.push({ kind: 'task', id: p.id, title: t.title, start: s, end: e });
      got.set(p.id, (got.get(p.id) || 0) + (e - s));
      if (s < spec.day.start) v.push({ rule: 'before_day', id: p.id, msg: t.title + ' starts before the day window' });
      if (e > limitEnd) v.push({ rule: 'after_limit', id: p.id, msg: t.title + ' ends after ' + fmt(limitEnd) });
      if (t.deadline != null && e > t.deadline) v.push({ rule: 'deadline', id: p.id, msg: t.title + ' ends ' + fmt(e) + ', deadline ' + fmt(t.deadline) });
      if (t.earliest != null && s < t.earliest) v.push({ rule: 'earliest', id: p.id, msg: t.title + ' starts before ' + fmt(t.earliest) });
    });
    spec.tasks.forEach((t) => {
      const g = got.get(t.id) || 0;
      if (g === 0) v.push({ rule: 'unscheduled', id: t.id, msg: t.title + ' is not in the plan' });
      else if (g !== t.minutes) v.push({ rule: 'duration', id: t.id, msg: t.title + ' scheduled ' + g + ' min, needs ' + t.minutes });
    });
    items.sort((a, b) => a.start - b.start || a.end - b.end);
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1], b = items[i];
      if (b.start < a.end) v.push({ rule: 'overlap', id: b.id, msg: a.title + ' overlaps ' + b.title });
      else if (b.start - a.end < spec.buffer && (a.kind === 'task' || b.kind === 'task')) v.push({ rule: 'buffer', id: b.id, msg: 'less than ' + spec.buffer + ' min between ' + a.title + ' and ' + b.title });
    }
    return v;
  }

  // Greedy earliest-deadline-first into free gaps. Never splits a task. Unfit tasks are postponed with a reason.
  function schedule(specIn, opts) {
    const spec = normalizeSpec(specIn);
    const from = opts && opts.from != null ? toMin(opts.from) : spec.day.start;
    const limitEnd = spec.noAfter == null ? spec.day.end : Math.min(spec.day.end, spec.noAfter);
    const busy = spec.fixed.map((f) => [f.start, f.end]).sort((a, b) => a[0] - b[0]);
    const placed: any[] = [];
    const postponed: any[] = [];
    const order = spec.tasks.slice().sort((a, b) => (a.deadline == null ? 1e9 : a.deadline) - (b.deadline == null ? 1e9 : b.deadline) || a.priority - b.priority);
    for (const t of order) {
      let start = Math.max(from, spec.day.start, t.earliest == null ? 0 : t.earliest);
      let done = false, why = 'no free gap before ' + fmt(limitEnd); let code = 'no_gap'; let info: any = { limit: limitEnd };
      const blocks = busy.concat(placed.map((p) => [p.start, p.end])).sort((a, b) => a[0] - b[0]);
      let guard = 0;
      while (!done && guard++ < 1000) {
        const end = start + t.minutes;
        if (end > limitEnd) break;
        const clash = blocks.find((b) => start < b[1] + spec.buffer && end + spec.buffer > b[0]);
        if (clash) { start = clash[1] + spec.buffer; continue; }
        if (t.deadline != null && end > t.deadline) { why = 'would finish ' + fmt(end) + ', after deadline ' + fmt(t.deadline); code = 'deadline'; info = { finish: end, deadline: t.deadline }; break; }
        placed.push({ id: t.id, title: t.title, start, end }); done = true;
      }
      if (!done) postponed.push({ id: t.id, title: t.title, minutes: t.minutes, reason: why, code, info });
    }
    placed.sort((a, b) => a.start - b.start);
    const plan = placed.map((p) => ({ id: p.id, start: fmt(p.start), end: fmt(p.end) }));
    // Check only the placed subset against the spec restricted to it, so postponed items are reported, not hidden.
    const sub = Object.assign({}, specIn, { tasks: (specIn.tasks || []).filter((t) => placed.some((p) => p.id === t.id)) });
    const violations = check(sub, plan);
    return { plan, postponed, violations };
  }

  // Replan after a change. events: {now, done:[ids], delay:[{id,byMin}], addFixed:[...], addTasks:[...]}
  function replan(specIn, ev) {
    const spec = JSON.parse(JSON.stringify(specIn));
    const done = new Set(ev.done || []);
    spec.tasks = (spec.tasks || []).filter((t) => !done.has(t.id)).concat(ev.addTasks || []);
    (ev.delay || []).forEach((d) => {
      const f = (spec.fixed || []).find((x) => x.id === d.id);
      if (!f) throw new Error('no fixed item ' + d.id);
      f.end = fmt(toMin(f.end) + d.byMin);
    });
    spec.fixed = (spec.fixed || []).concat(ev.addFixed || []);
    return schedule(spec, { from: ev.now });
  }


export { toMin, fmt, normalizeSpec, check, schedule, replan };
