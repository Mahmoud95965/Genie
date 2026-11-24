import React, { useEffect, useState } from 'react';
import { Callout, Caption, Closing, ChoiceRow, FileButton, FileCard, Group, Header, NavLink, Route, Routes, Row, Rows, TextField, useLocalState } from '@instinct/files';
import { fmt, schedule, toMin } from './core';

type Fixed = { id: string; title: string; start: string; end: string; late: number };
type Task = { id: string; title: string; minutes: number; deadline: string; done: boolean };
type State = { dayStart: string; noAfter: string; buffer: number; now: string; fixed: Fixed[]; tasks: Task[] };

const BASE: State = {
    dayStart: '07:00', noAfter: '22:00', buffer: 10, now: '07:00',
    fixed: [
        { id: 'f1', title: 'الشغل', start: '09:00', end: '15:00', late: 0 },
        { id: 'f2', title: 'المشوار', start: '16:00', end: '17:00', late: 0 },
    ],
    tasks: [
        { id: 't1', title: 'مراجعة الحسابات', minutes: 90, deadline: '20:00', done: false },
        { id: 't2', title: 'تجهيز العرض', minutes: 60, deadline: '20:00', done: false },
    ],
};
const SCENARIOS: Record<string, State> = {
    home: BASE,
    busy: { ...BASE, now: '07:00', tasks: [
        { id: 't1', title: 'مراجعة الحسابات', minutes: 90, deadline: '20:00', done: false },
        { id: 't2', title: 'تجهيز العرض', minutes: 120, deadline: '18:00', done: false },
        { id: 't3', title: 'مذاكرة', minutes: 180, deadline: '20:00', done: false },
        { id: 't4', title: 'تمرين', minutes: 60, deadline: '21:00', done: false },
    ] },
    late: { ...BASE, now: '16:30', fixed: [
        { id: 'f1', title: 'الشغل', start: '09:00', end: '15:00', late: 0 },
        { id: 'f2', title: 'المشوار', start: '16:00', end: '17:00', late: 90 },
    ], tasks: [
        { id: 't1', title: 'مراجعة الحسابات', minutes: 90, deadline: '20:00', done: true },
        { id: 't2', title: 'تجهيز العرض', minutes: 60, deadline: '20:00', done: false },
    ] },
};

const AR = '٠١٢٣٤٥٦٧٨٩';
function parseTime(raw: string): string | null {
    const s = raw.trim().replace(/[٠-٩]/g, (d) => String(AR.indexOf(d))).replace('.', ':');
    const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(s);
    if (!m) return null;
    const h = +m[1], mi = m[2] ? +m[2] : 0;
    if (h > 23 || mi > 59) return null;
    return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
}
function parseNum(raw: string): number | null {
    const n = +raw.trim().replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)));
    return Number.isFinite(n) && n > 0 && n <= 1440 ? Math.round(n) : null;
}
const T = (s: string) => <bdi dir="ltr">{s}</bdi>;
const effEnd = (f: Fixed) => fmt(toMin(f.end) + f.late);

function specOf(s: State, tasks: Task[]) {
    return {
        day: { start: s.dayStart, end: '23:59' }, noAfter: s.noAfter, buffer: s.buffer,
        fixed: s.fixed.map((f) => ({ id: f.id, title: f.title, start: f.start, end: effEnd(f) })),
        tasks: tasks.map((t) => ({ id: t.id, title: t.title, minutes: t.minutes, deadline: t.deadline || null })),
    };
}

function freeMinutes(s: State, from: string) {
    const lo = Math.max(toMin(from), toMin(s.dayStart)), hi = toMin(s.noAfter);
    if (hi <= lo) return 0;
    const busy = s.fixed.map((f) => [Math.max(lo, toMin(f.start)), Math.min(hi, toMin(f.end) + f.late)]).filter((b) => b[1] > b[0]).sort((a, b) => a[0] - b[0]);
    let used = 0, cur = -1;
    for (const b of busy) { const st = Math.max(b[0], cur); if (b[1] > st) { used += b[1] - st; cur = b[1]; } }
    return hi - lo - used;
}

function TimeField({ label, value, on }: { label: string; value: string; on: (v: string) => void }) {
    const [draft, setDraft] = useState(value);
    useEffect(() => { if (parseTime(draft) !== value) setDraft(value); }, [value]);
    const ok = parseTime(draft) !== null;
    const full = (v: string) => /^\s*[0-9٠-٩]{1,2}[:.][0-9٠-٩]{2}\s*$/.test(v);
    const commit = (v: string) => { const p = parseTime(v); if (p && p !== value) on(p); };
    return <div>
        <TextField label={label} value={draft} inputMode="numeric" dir="ltr" placeholder="مثال 20:00"
            onChange={(v: string) => { setDraft(v); if (full(v)) commit(v); }}
            onBlur={() => { if (parseTime(draft)) { commit(draft); setDraft(parseTime(draft) as string); } else setDraft(value); }} />
        {!ok ? <Caption>الساعة دي مش مفهومة، اكتبها زي 20:00. الخطة لسه ماشية على {value}.</Caption> : null}
    </div>;
}

function Planner({ scenario }: { scenario: string }) {
    const [state, setState, saved] = useLocalState<State>('planner.v1.' + scenario, SCENARIOS[scenario] || BASE);
    const [fTitle, setFTitle] = useState(''); const [fFrom, setFFrom] = useState(''); const [fTo, setFTo] = useState('');
    const [tTitle, setTTitle] = useState(''); const [tMin, setTMin] = useState(''); const [tDl, setTDl] = useState('');
    const [err, setErr] = useState('');
    const set = (patch: Partial<State>) => { if (saved.ready) setState({ ...state, ...patch }); };
    const uid = () => Math.random().toString(36).slice(2, 7);

    const open = state.tasks.filter((t) => !t.done);
    let result: any = null, specErr = '';
    try { result = schedule(specOf(state, open), { from: state.now }); } catch (e: any) { specErr = e.message; }

    const rules: string[] = [];
    rules.push(`اليوم بيبدأ ${state.dayStart} ومفيش حاجة بتتحط بعد ${state.noAfter}`);
    rules.push(state.buffer ? `فاصل ${state.buffer} دقيقة قبل وبعد أي مهمة` : 'من غير فاصل بين المهام');
    state.fixed.forEach((f) => rules.push(`«${f.title}» ثابتة من ${f.start} لحد ${effEnd(f)}${f.late ? ` (اتأخرت ${f.late} دقيقة)` : ''}`));
    open.forEach((t) => rules.push(`«${t.title}» محتاجة ${t.minutes} دقيقة${t.deadline ? ` وتخلص قبل ${t.deadline}` : ''}`));
    if (state.now !== state.dayStart) rules.push(`الوقت دلوقتي ${state.now}، فالترتيب بيبدأ من هنا`);

    const need = open.reduce((a, t) => a + t.minutes, 0);
    const free = freeMinutes(state, state.now);
    const postponed: any[] = result ? result.postponed : [];

    const suggestion = (() => {
        if (!result || !postponed.length) return null;
        const order = open.slice().sort((a, b) => (b.deadline || '99:99').localeCompare(a.deadline || '99:99'));
        for (const t of order) {
            try {
                const r = schedule(specOf(state, open.filter((x) => x.id !== t.id)), { from: state.now });
                if (!r.postponed.length) return t;
            } catch { /* ignore */ }
        }
        return null;
    })();

    const why = (p: any) => p.code === 'deadline'
        ? `هتخلص ${p.info.finish != null ? fmt(p.info.finish) : ''} والميعاد ${fmt(p.info.deadline)}`
        : `مفيش فجوة كفاية قبل ${fmt(p.info.limit)}`;

    const addFixed = () => {
        const a = parseTime(fFrom), b = parseTime(fTo);
        if (!fTitle.trim() || !a || !b || toMin(b) <= toMin(a)) { setErr('الموعد الثابت محتاج اسم ووقت بداية ونهاية صح (النهاية بعد البداية).'); return; }
        setErr(''); set({ fixed: [...state.fixed, { id: 'f' + uid(), title: fTitle.trim(), start: a, end: b, late: 0 }] });
        setFTitle(''); setFFrom(''); setFTo('');
    };
    const addTask = () => {
        const m = parseNum(tMin); const d = tDl.trim() ? parseTime(tDl) : '';
        if (!tTitle.trim() || !m || d === null) { setErr('المهمة محتاجة اسم وعدد دقايق صح، والميعاد (لو كتبته) بصيغة زي 20:00.'); return; }
        setErr(''); set({ tasks: [...state.tasks, { id: 't' + uid(), title: tTitle.trim(), minutes: m, deadline: d, done: false }] });
        setTTitle(''); setTMin(''); setTDl('');
    };
    const patchTask = (id: string, p: Partial<Task>) => set({ tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)) });
    const patchFixed = (id: string, p: Partial<Fixed>) => set({ fixed: state.fixed.map((f) => (f.id === id ? { ...f, ...p } : f)) });
    const timeField = (label: string, value: string, on: (v: string) => void) =>
        <TimeField key={label} label={label} value={value} on={on} />;

    const timeline: { at: number; name: string; detail: string }[] = [];
    state.fixed.forEach((f) => timeline.push({ at: toMin(f.start), name: f.title, detail: `موعد ثابت · من ${f.start} لحد ${effEnd(f)}${f.late ? ' · اتأخر' : ''}${toMin(effEnd(f)) <= toMin(state.now) ? ' · عدّى' : ''}` }));
    if (result) result.plan.forEach((p: any) => { const t = open.find((x) => x.id === p.id)!; timeline.push({ at: toMin(p.start), name: t.title, detail: `مهمة · من ${p.start} لحد ${p.end}` }); });
    timeline.sort((a, b) => a.at - b.at);

    return <>
        {specErr ? <Callout title="في رقم مش مظبوط" tone="danger">{specErr}</Callout> : null}

        <Group label="خطتك دلوقتي" heading>
            {result && !postponed.length && !specErr ? <Callout title="كل المهام لاقت مكان" tone="note">الترتيب اتفحص بالكود: مفيش تداخل، الفواصل محترمة، وكل ميعاد نهائي مضبوط.</Callout> : null}
            {postponed.length ? <Callout title={`${postponed.length === 1 ? 'مهمة واحدة' : postponed.length + ' مهام'} مش هتلحق`} tone="warning">
                {need > free ? `محتاج ${need} دقيقة وفاضل حوالي ${free} دقيقة فاضية قبل ${state.noAfter}.` : `الوقت الفاضي كفاية على الورق (حوالي ${free} دقيقة)، لكن المواعيد النهائية والفواصل مش بتسمح بالترتيب ده.`}
                {suggestion ? ` لو أجّلت «${suggestion.title}» الباقي كله بيدخل بنفس طريقة الترتيب.` : ' جربت أشيل كل مهمة لوحدها بنفس طريقة الترتيب ومفيش واحدة كفت، فالأرجح لازم تقلل أكتر أو تغيّر المواعيد.'}
            </Callout> : null}
            <Rows>{timeline.map((x, i) => <Row key={i} number={i + 1} name={x.name} detail={x.detail} />)}</Rows>
            {postponed.length ? <Group label="اللي اتأجل">
                <Rows>{postponed.map((p) => <Row key={p.id} name={p.title} detail={`${p.minutes} دقيقة · ${why(p)}`} />)}</Rows>
            </Group> : null}
        </Group>

        <Group label="الشروط اللي الخطة ماشية عليها" heading>
            <Caption>دي مكتوبة من الخانات اللي تحت بالظبط، مش من تخمين. عدّل أي رقم والخطة بتتغير.</Caption>
            <ul className="pl-rules">{rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
            {timeField('اليوم بيبدأ الساعة', state.dayStart, (v) => set({ dayStart: v }))}
            {timeField('مفيش حاجة بعد الساعة', state.noAfter, (v) => set({ noAfter: v }))}
            <ChoiceRow label="فاصل بين المهام (دقيقة)" options={[0, 5, 10, 15, 30].map((n) => ({ value: String(n), label: String(n) }))} value={String(state.buffer)} onChange={(v: string) => set({ buffer: +v })} />
        </Group>

        <Group label="مواعيدك الثابتة" heading>
            <Rows>{state.fixed.map((f) => <Row key={f.id} name={f.title} detail={`من ${f.start} لحد ${effEnd(f)}${f.late ? ` (اتأخر ${f.late} دقيقة)` : ''}`} />)}</Rows>
            {state.fixed.map((f) => <div className="pl-actions" key={f.id}>
                <span className="pl-who">{f.title}</span>
                <FileButton type="button" compact variant="secondary" onClick={() => patchFixed(f.id, { late: f.late + 30 })}>اتأخر نص ساعة</FileButton>
                {f.late ? <FileButton type="button" compact variant="ghost" onClick={() => patchFixed(f.id, { late: 0 })}>رجّعه</FileButton> : null}
                <FileButton type="button" compact variant="ghost" onClick={() => set({ fixed: state.fixed.filter((x) => x.id !== f.id) })}>احذف</FileButton>
            </div>)}
            <Group label="ضيف موعد ثابت">
                <TextField label="اسمه" value={fTitle} onChange={setFTitle} placeholder="مثال: كلية" />
                <TextField label="من (ساعة)" value={fFrom} onChange={setFFrom} inputMode="numeric" dir="ltr" placeholder="09:00" />
                <TextField label="لحد (ساعة)" value={fTo} onChange={setFTo} inputMode="numeric" dir="ltr" placeholder="12:30" />
                <FileButton type="button" variant="secondary" onClick={addFixed}>ضيف الموعد</FileButton>
            </Group>
        </Group>

        <Group label="مهامك" heading>
            <Rows>{state.tasks.map((t) => <Row key={t.id} name={t.title} detail={`${t.minutes} دقيقة${t.deadline ? ` · قبل ${t.deadline}` : ''}${t.done ? ' · خلصت' : ''}`} />)}</Rows>
            {state.tasks.map((t) => <div className="pl-actions" key={t.id}>
                <span className="pl-who">{t.title}</span>
                <FileButton type="button" compact variant="secondary" onClick={() => patchTask(t.id, { done: !t.done })}>{t.done ? 'مخلصتهاش' : 'خلصتها'}</FileButton>
                <FileButton type="button" compact variant="ghost" onClick={() => set({ tasks: state.tasks.filter((x) => x.id !== t.id) })}>احذف</FileButton>
            </div>)}
            <Group label="ضيف مهمة">
                <TextField label="اسمها" value={tTitle} onChange={setTTitle} placeholder="مثال: مذاكرة" />
                <TextField label="هتاخد كام دقيقة" value={tMin} onChange={setTMin} inputMode="numeric" dir="ltr" placeholder="60" />
                <TextField label="لازم تخلص قبل ساعة (اختياري)" value={tDl} onChange={setTDl} inputMode="numeric" dir="ltr" placeholder="20:00" />
                <FileButton type="button" variant="secondary" onClick={addTask}>ضيف المهمة</FileButton>
            </Group>
            {err ? <Callout title="مش مظبوط" tone="danger">{err}</Callout> : null}
        </Group>

        <Group label="لما اليوم يتغير" heading>
            <Caption>اكتب الساعة دلوقتي، علّم اللي خلصته، أو قول إن موعد اتأخر، والباقي بيتعاد ترتيبه من الوقت ده.</Caption>
            {timeField('الساعة دلوقتي', state.now, (v) => set({ now: v }))}
            <FileButton type="button" variant="ghost" onClick={() => { if (saved.ready) setState(SCENARIOS[scenario] || BASE); }}>رجّع المثال زي ما كان</FileButton>
        </Group>
    </>;
}

export function App() {
    return <FileCard lang="ar" dir="rtl">
        <Header title="رتّب يومك وشوف إيه اللي مش هيلحق" intro="اكتب مواعيدك الثابتة ومهامك، وهيتحط كل حاجة في مكانها بشروطك. لو الوقت مش كفاية هتعرف إيه اللي هيتأجل وليه." />
        <Callout title="نسخة تجريبية بدون ذكاء اصطناعي" tone="note">الترتيب والفحص بكود عادي بيشتغل في المتصفح. ما بيفهمش كلام حر ولسه مفيش موديل متوصّل. تنبيه: دي نسخة تجريبية، والحفظ بعد ما تقفل الصفحة أو تعمل ريفريش مش مضمون. انسخ مواعيدك ومهامك في مكان تاني قبل ما تقفل. مفيش حاجة بتتبعت لأي حد.</Callout>
        <nav className="file-nav" aria-label="أمثلة"><NavLink to="/" end>يومي</NavLink><NavLink to="/busy">مثال: يوم زحمة</NavLink><NavLink to="/late">مثال: المشوار اتأخر</NavLink></nav>
        <Routes>
            <Route path="/" element={<Planner scenario="home" />} />
            <Route path="/busy" element={<Planner scenario="busy" />} />
            <Route path="/late" element={<Planner scenario="late" />} />
        </Routes>
        <Closing>اسم مؤقت للتجربة: لحّقها (لسه مش متأكد منه). الفحص بيشمل التداخل والفواصل والمواعيد النهائية والمدة. مبيشوفش الزحمة ولا وقت المشاوير بين الأماكن. الترتيب بيجرب أقرب ميعاد نهائي الأول ومش بيقسّم المهمة، فممكن يأجل حاجة كان ممكن تدخل بترتيب تاني.</Closing>
    </FileCard>;
}
