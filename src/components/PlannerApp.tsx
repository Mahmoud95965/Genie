"use client";

import React, { useEffect, useState } from "react";
import { fmt, schedule, toMin } from "../../planner/core";

type Fixed = { id: string; title: string; start: string; end: string; late: number };
type Task = { id: string; title: string; minutes: number; deadline: string; done: boolean };
type State = { dayStart: string; noAfter: string; buffer: number; now: string; fixed: Fixed[]; tasks: Task[] };

const BASE: State = {
  dayStart: "07:00", noAfter: "22:00", buffer: 10, now: "07:00",
  fixed: [
    { id: "f1", title: "الشغل", start: "09:00", end: "15:00", late: 0 },
    { id: "f2", title: "المشوار", start: "16:00", end: "17:00", late: 0 },
  ],
  tasks: [
    { id: "t1", title: "مراجعة الحسابات", minutes: 90, deadline: "20:00", done: false },
    { id: "t2", title: "تجهيز العرض", minutes: 60, deadline: "20:00", done: false },
  ],
};
const SCENARIOS: Record<string, State> = {
  home: BASE,
  busy: {
    ...BASE, now: "07:00", tasks: [
      { id: "t1", title: "مراجعة الحسابات", minutes: 90, deadline: "20:00", done: false },
      { id: "t2", title: "تجهيز العرض", minutes: 120, deadline: "18:00", done: false },
      { id: "t3", title: "مذاكرة", minutes: 180, deadline: "20:00", done: false },
      { id: "t4", title: "تمرين", minutes: 60, deadline: "21:00", done: false },
    ],
  },
  late: {
    ...BASE, now: "16:30", fixed: [
      { id: "f1", title: "الشغل", start: "09:00", end: "15:00", late: 0 },
      { id: "f2", title: "المشوار", start: "16:00", end: "17:00", late: 90 },
    ], tasks: [
      { id: "t1", title: "مراجعة الحسابات", minutes: 90, deadline: "20:00", done: true },
      { id: "t2", title: "تجهيز العرض", minutes: 60, deadline: "20:00", done: false },
    ],
  },
};

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
function parseTime(raw: string): string | null {
  const s = raw.trim().replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(".", ":");
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(s);
  if (!m) return null;
  const h = +m[1], mi = m[2] ? +m[2] : 0;
  if (h > 23 || mi > 59) return null;
  return String(h).padStart(2, "0") + ":" + String(mi).padStart(2, "0");
}
function parseNum(raw: string): number | null {
  const n = +raw.trim().replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
  return Number.isFinite(n) && n > 0 && n <= 1440 ? Math.round(n) : null;
}
const T = ({ children }: { children: React.ReactNode }) => <bdi dir="ltr">{children}</bdi>;
const effEnd = (f: Fixed) => fmt(toMin(f.end) + f.late);

function useLocalState(key: string, initial: State): [State, (v: State) => void, { ready: boolean }] {
  const [state, setStateRaw] = useState<State>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setStateRaw(JSON.parse(raw));
    } catch { /* ignore corrupted or unavailable storage */ }
    setReady(true);
  }, [key]);
  const setState = (v: State) => {
    setStateRaw(v);
    try { window.localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage may be unavailable */ }
  };
  return [state, setState, { ready }];
}

function specOf(s: State, tasks: Task[]) {
  return {
    day: { start: s.dayStart, end: "23:59" }, noAfter: s.noAfter, buffer: s.buffer,
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

/* ---- small styled primitives in the site's visual language ---- */

function Callout({ title, tone, children }: { title: string; tone: "note" | "warning" | "danger"; children: React.ReactNode }) {
  const cls = tone === "danger"
    ? "border-rose-400/40 bg-rose-400/10"
    : tone === "warning"
      ? "border-amber-300/40 bg-amber-300/10"
      : "border-sky/40 bg-sky/10";
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <p className="font-semibold text-white">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-zinc-300">{children}</p>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:p-7">
      <h2 className="text-lg font-bold text-white md:text-xl">{label}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Rows({ items }: { items: { key: string; name: string; detail: React.ReactNode }[] }) {
  if (!items.length) return <p className="text-sm text-zinc-500">لسه مفيش حاجة هنا.</p>;
  return (
    <ul className="divide-y divide-white/5">
      {items.map((x, i) => (
        <li key={x.key} className="flex items-baseline gap-3 py-2.5">
          <span className="font-mono text-xs text-zinc-500">{String(i + 1).padStart(2, "0")}</span>
          <span className="font-medium text-white">{x.name}</span>
          <span className="text-sm text-zinc-400">{x.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function Btn({ onClick, variant = "secondary", children }: { onClick: () => void; variant?: "secondary" | "ghost"; children: React.ReactNode }) {
  const cls = variant === "secondary"
    ? "border border-sky/40 bg-sky/15 text-sky hover:bg-sky/25"
    : "border border-white/10 text-zinc-400 hover:border-white/25 hover:text-white";
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${cls}`}>
      {children}
    </button>
  );
}

function Field({ label, value, onChange, placeholder, ltr }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; ltr?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-zinc-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={ltr ? "numeric" : undefined}
        dir={ltr ? "ltr" : undefined}
        className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-sky/50"
      />
    </label>
  );
}

function TimeField({ label, value, on }: { label: string; value: string; on: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (parseTime(draft) !== value) setDraft(value); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const ok = parseTime(draft) !== null;
  const full = (v: string) => /^\s*[0-9٠-٩]{1,2}[:.][0-9٠-٩]{2}\s*$/.test(v);
  const commit = (v: string) => { const p = parseTime(v); if (p && p !== value) on(p); };
  return (
    <div>
      <label className="block">
        <span className="mb-1.5 block text-sm text-zinc-400">{label}</span>
        <input
          value={draft}
          inputMode="numeric"
          dir="ltr"
          placeholder="مثال 20:00"
          onChange={(e) => { setDraft(e.target.value); if (full(e.target.value)) commit(e.target.value); }}
          onBlur={() => { if (parseTime(draft)) { commit(draft); setDraft(parseTime(draft) as string); } else setDraft(value); }}
          className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-sky/50"
        />
      </label>
      {!ok ? <p className="mt-1 text-xs text-amber-300/90">الساعة دي مش مفهومة، اكتبها زي <T>20:00</T>. الخطة لسه ماشية على <T>{value}</T>.</p> : null}
    </div>
  );
}

/* ---- the planner itself ---- */

function Planner({ scenario }: { scenario: string }) {
  const [state, setState, saved] = useLocalState("planner.v1." + scenario, SCENARIOS[scenario] || BASE);
  const [fTitle, setFTitle] = useState(""); const [fFrom, setFFrom] = useState(""); const [fTo, setFTo] = useState("");
  const [tTitle, setTTitle] = useState(""); const [tMin, setTMin] = useState(""); const [tDl, setTDl] = useState("");
  const [err, setErr] = useState("");
  const set = (patch: Partial<State>) => { if (saved.ready) setState({ ...state, ...patch }); };
  const uid = () => Math.random().toString(36).slice(2, 7);

  const open = state.tasks.filter((t) => !t.done);
  let result: any = null, specErr = "";
  try { result = schedule(specOf(state, open), { from: state.now }); } catch (e: any) { specErr = e.message; }

  const rules: React.ReactNode[] = [];
  rules.push(<>اليوم بيبدأ <T>{state.dayStart}</T> ومفيش حاجة بتتحط بعد <T>{state.noAfter}</T></>);
  rules.push(state.buffer ? <>فاصل {state.buffer} دقيقة قبل وبعد أي مهمة</> : <>من غير فاصل بين المهام</>);
  state.fixed.forEach((f) => rules.push(<>«{f.title}» ثابتة من <T>{f.start}</T> لحد <T>{effEnd(f)}</T>{f.late ? <> (اتأخرت {f.late} دقيقة)</> : null}</>));
  open.forEach((t) => rules.push(<>«{t.title}» محتاجة {t.minutes} دقيقة{t.deadline ? <> وتخلص قبل <T>{t.deadline}</T></> : null}</>));
  if (state.now !== state.dayStart) rules.push(<>الوقت دلوقتي <T>{state.now}</T>، فالترتيب بيبدأ من هنا</>);

  const need = open.reduce((a, t) => a + t.minutes, 0);
  const free = freeMinutes(state, state.now);
  const postponed: any[] = result ? result.postponed : [];

  const suggestion = (() => {
    if (!result || !postponed.length) return null;
    const order = open.slice().sort((a, b) => (b.deadline || "99:99").localeCompare(a.deadline || "99:99"));
    for (const t of order) {
      try {
        const r = schedule(specOf(state, open.filter((x) => x.id !== t.id)), { from: state.now });
        if (!r.postponed.length) return t;
      } catch { /* ignore */ }
    }
    return null;
  })();

  const why = (p: any) => p.code === "deadline"
    ? <>هتخلص {p.info.finish != null ? fmt(p.info.finish) : ""} والميعاد <T>{fmt(p.info.deadline)}</T></>
    : <>مفيش فجوة كفاية قبل <T>{fmt(p.info.limit)}</T></>;

  const addFixed = () => {
    const a = parseTime(fFrom), b = parseTime(fTo);
    if (!fTitle.trim() || !a || !b || toMin(b) <= toMin(a)) { setErr("الموعد الثابت محتاج اسم ووقت بداية ونهاية صح (النهاية بعد البداية)."); return; }
    setErr(""); set({ fixed: [...state.fixed, { id: "f" + uid(), title: fTitle.trim(), start: a, end: b, late: 0 }] });
    setFTitle(""); setFFrom(""); setFTo("");
  };
  const addTask = () => {
    const m = parseNum(tMin); const d = tDl.trim() ? parseTime(tDl) : "";
    if (!tTitle.trim() || !m || d === null) { setErr("المهمة محتاجة اسم وعدد دقايق صح، والميعاد (لو كتبته) بصيغة زي 20:00."); return; }
    setErr(""); set({ tasks: [...state.tasks, { id: "t" + uid(), title: tTitle.trim(), minutes: m, deadline: d, done: false }] });
    setTTitle(""); setTMin(""); setTDl("");
  };
  const patchTask = (id: string, p: Partial<Task>) => set({ tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)) });
  const patchFixed = (id: string, p: Partial<Fixed>) => set({ fixed: state.fixed.map((f) => (f.id === id ? { ...f, ...p } : f)) });

  const timeline: { at: number; name: string; detail: React.ReactNode }[] = [];
  state.fixed.forEach((f) => timeline.push({
    at: toMin(f.start), name: f.title,
    detail: <>موعد ثابت · من <T>{f.start}</T> لحد <T>{effEnd(f)}</T>{f.late ? " · اتأخر" : ""}{toMin(effEnd(f)) <= toMin(state.now) ? " · عدّى" : ""}</>,
  }));
  if (result) result.plan.forEach((p: any) => {
    const t = open.find((x) => x.id === p.id)!;
    timeline.push({ at: toMin(p.start), name: t.title, detail: <>مهمة · من <T>{p.start}</T> لحد <T>{p.end}</T></> });
  });
  timeline.sort((a, b) => a.at - b.at);

  return (
    <div className="space-y-5">
      {specErr ? <Callout title="في رقم مش مظبوط" tone="danger">{specErr}</Callout> : null}

      <Section label="خطتك دلوقتي">
        {result && !postponed.length && !specErr ? (
          <Callout title="كل المهام لاقت مكان" tone="note">الترتيب اتفحص بالكود: مفيش تداخل، الفواصل محترمة، وكل ميعاد نهائي مضبوط.</Callout>
        ) : null}
        {postponed.length ? (
          <Callout title={`${postponed.length === 1 ? "مهمة واحدة" : postponed.length + " مهام"} مش هتلحق`} tone="warning">
            {need > free
              ? <>محتاج {need} دقيقة وفاضل حوالي {free} دقيقة فاضية قبل <T>{state.noAfter}</T>.</>
              : <>الوقت الفاضي كفاية على الورق (حوالي {free} دقيقة)، لكن المواعيد النهائية والفواصل مش بتسمح بالترتيب ده.</>}
            {suggestion
              ? <> لو أجّلت «{suggestion.title}» الباقي كله بيدخل بنفس طريقة الترتيب.</>
              : " جربت أشيل كل مهمة لوحدها بنفس طريقة الترتيب ومفيش واحدة كفت، فالأرجح لازم تقلل أكتر أو تغيّر المواعيد."}
          </Callout>
        ) : null}
        <Rows items={timeline.map((x, i) => ({ key: String(i), name: x.name, detail: x.detail }))} />
        {postponed.length ? (
          <div>
            <h3 className="mt-2 text-sm font-semibold text-amber-200">اللي اتأجل</h3>
            <Rows items={postponed.map((p) => ({ key: p.id, name: p.title, detail: <>{p.minutes} دقيقة · {why(p)}</> }))} />
          </div>
        ) : null}
      </Section>

      <Section label="الشروط اللي الخطة ماشية عليها">
        <p className="text-sm text-zinc-500">دي مكتوبة من الخانات اللي تحت بالظبط، مش من تخمين. عدّل أي رقم والخطة بتتغير.</p>
        <ul className="list-disc space-y-1 pr-5 text-sm leading-relaxed text-zinc-300">
          {rules.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
        <div className="grid gap-4 sm:grid-cols-2">
          <TimeField label="اليوم بيبدأ الساعة" value={state.dayStart} on={(v) => set({ dayStart: v })} />
          <TimeField label="مفيش حاجة بعد الساعة" value={state.noAfter} on={(v) => set({ noAfter: v })} />
        </div>
        <div>
          <span className="mb-1.5 block text-sm text-zinc-400">فاصل بين المهام (دقيقة)</span>
          <div className="flex flex-wrap gap-2">
            {[0, 5, 10, 15, 30].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => set({ buffer: n })}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${state.buffer === n ? "bg-sky text-black" : "border border-white/10 text-zinc-400 hover:text-white"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section label="مواعيدك الثابتة">
        <Rows items={state.fixed.map((f) => ({
          key: f.id, name: f.title,
          detail: <>من <T>{f.start}</T> لحد <T>{effEnd(f)}</T>{f.late ? <> (اتأخر {f.late} دقيقة)</> : null}</>,
        }))} />
        <div className="space-y-2">
          {state.fixed.map((f) => (
            <div className="flex flex-wrap items-center gap-2" key={f.id}>
              <span className="min-w-24 text-sm text-zinc-300">{f.title}</span>
              <Btn variant="secondary" onClick={() => patchFixed(f.id, { late: f.late + 30 })}>اتأخر نص ساعة</Btn>
              {f.late ? <Btn variant="ghost" onClick={() => patchFixed(f.id, { late: 0 })}>رجّعه</Btn> : null}
              <Btn variant="ghost" onClick={() => set({ fixed: state.fixed.filter((x) => x.id !== f.id) })}>احذف</Btn>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-white/5 p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-200">ضيف موعد ثابت</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="اسمه" value={fTitle} onChange={setFTitle} placeholder="مثال: كلية" />
            <Field label="من (ساعة)" value={fFrom} onChange={setFFrom} placeholder="09:00" ltr />
            <Field label="لحد (ساعة)" value={fTo} onChange={setFTo} placeholder="12:30" ltr />
          </div>
          <div className="mt-3"><Btn variant="secondary" onClick={addFixed}>ضيف الموعد</Btn></div>
        </div>
      </Section>

      <Section label="مهامك">
        <Rows items={state.tasks.map((t) => ({
          key: t.id, name: t.title,
          detail: <>{t.minutes} دقيقة{t.deadline ? <> · قبل <T>{t.deadline}</T></> : null}{t.done ? " · خلصت" : ""}</>,
        }))} />
        <div className="space-y-2">
          {state.tasks.map((t) => (
            <div className="flex flex-wrap items-center gap-2" key={t.id}>
              <span className="min-w-24 text-sm text-zinc-300">{t.title}</span>
              <Btn variant="secondary" onClick={() => patchTask(t.id, { done: !t.done })}>{t.done ? "مخلصتهاش" : "خلصتها"}</Btn>
              <Btn variant="ghost" onClick={() => set({ tasks: state.tasks.filter((x) => x.id !== t.id) })}>احذف</Btn>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-white/5 p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-200">ضيف مهمة</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="اسمها" value={tTitle} onChange={setTTitle} placeholder="مثال: مذاكرة" />
            <Field label="هتاخد كام دقيقة" value={tMin} onChange={setTMin} placeholder="60" ltr />
            <Field label="لازم تخلص قبل ساعة (اختياري)" value={tDl} onChange={setTDl} placeholder="20:00" ltr />
          </div>
          <div className="mt-3"><Btn variant="secondary" onClick={addTask}>ضيف المهمة</Btn></div>
        </div>
        {err ? <Callout title="مش مظبوط" tone="danger">{err}</Callout> : null}
      </Section>

      <Section label="لما اليوم يتغير">
        <p className="text-sm text-zinc-500">اكتب الساعة دلوقتي، علّم اللي خلصته، أو قول إن موعد اتأخر، والباقي بيتعاد ترتيبه من الوقت ده.</p>
        <div className="max-w-xs">
          <TimeField label="الساعة دلوقتي" value={state.now} on={(v) => set({ now: v })} />
        </div>
        <Btn variant="ghost" onClick={() => { if (saved.ready) setState(SCENARIOS[scenario] || BASE); }}>رجّع المثال زي ما كان</Btn>
      </Section>
    </div>
  );
}

const TABS: { id: string; label: string }[] = [
  { id: "home", label: "يومي" },
  { id: "busy", label: "مثال: يوم زحمة" },
  { id: "late", label: "مثال: المشوار اتأخر" },
];

export default function PlannerApp() {
  const [scenario, setScenario] = useState("home");
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("s");
    if (s && SCENARIOS[s]) setScenario(s);
  }, []);
  return (
    <div dir="rtl" lang="ar" className="font-arabic">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <h1 className="font-display text-3xl font-bold text-white md:text-4xl">رتّب يومك وشوف إيه اللي مش هيلحق</h1>
          <p className="mt-3 leading-relaxed text-zinc-400">
            اكتب مواعيدك الثابتة ومهامك، وهيتحط كل حاجة في مكانها بشروطك. لو الوقت مش كفاية هتعرف إيه اللي هيتأجل وليه.
          </p>
        </header>

        <Callout title="نسخة تجريبية بدون ذكاء اصطناعي" tone="note">
          الترتيب والفحص بكود عادي بيشتغل في المتصفح. ما بيفهمش كلام حر ولسه مفيش موديل متوصّل. تنبيه: دي نسخة تجريبية،
          والحفظ بعد ما تقفل الصفحة أو تعمل ريفريش مش مضمون. انسخ مواعيدك ومهامك في مكان تاني قبل ما تقفل. مفيش حاجة بتتبعت لأي حد.
        </Callout>

        <nav aria-label="أمثلة" className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setScenario(tab.id)}
              aria-current={scenario === tab.id ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${scenario === tab.id ? "bg-sky text-black" : "border border-white/10 text-zinc-400 hover:text-white"}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <Planner key={scenario} scenario={scenario} />

        <p className="text-sm leading-relaxed text-zinc-500">
          اسم مؤقت للتجربة: لحّقها (لسه مش متأكد منه). الفحص بيشمل التداخل والفواصل والمواعيد النهائية والمدة.
          مبيشوفش الزحمة ولا وقت المشاوير بين الأماكن. الترتيب بيجرب أقرب ميعاد نهائي الأول ومش بيقسّم المهمة،
          فممكن يأجل حاجة كان ممكن تدخل بترتيب تاني.
        </p>
      </div>
    </div>
  );
}
