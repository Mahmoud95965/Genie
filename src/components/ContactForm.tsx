"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Info, Send } from "lucide-react";
import type { Messages } from "@/i18n/messages/en";

type FormMessages = Messages["contact"]["form"];

interface Errors {
  name?: string;
  email?: string;
  projectType?: string;
  description?: string;
}

/**
 * Contact form — interface only, no backend yet.
 * On valid submit we are explicit about that: the form is ready and the
 * integration is documented in docs/contact-form.md. We never fake a
 * "message sent" confirmation.
 */
export default function ContactForm({ t }: { t: FormMessages }) {
  const projectTypes = t.types;
  const budgets = t.budgets;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [projectType, setProjectType] = useState("");
  const [budget, setBudget] = useState<string>(budgets[0]);
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);

  function validate(): Errors {
    const e: Errors = {};
    if (name.trim().length < 2) e.name = t.errors.name;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      e.email = t.errors.email;
    if (!projectType) e.projectType = t.errors.type;
    if (description.trim().length < 20)
      e.description = t.errors.description;
    return e;
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) {
      const first = document.querySelector<HTMLElement>("[aria-invalid='true']");
      first?.focus();
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-sky/30 bg-sky/5 p-8"
      >
        <CheckCircle2 className="h-8 w-8 text-sky" aria-hidden="true" />
        <h2 className="display mt-5 font-display text-2xl font-bold text-white">
          {t.submittedHeading}
        </h2>
        <p className="mt-4 leading-relaxed text-zinc-300">
          {t.submittedBody1}
        </p>
        <p className="mt-4 leading-relaxed text-zinc-400">
          {t.submittedBody2}
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-6 rounded-full border hairline px-6 py-3 text-sm font-medium text-white transition-colors hover:border-sky/60 hover:text-sky"
        >
          {t.editMessage}
        </button>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-xl border bg-[#0A0A0F] px-4 py-3.5 text-white placeholder:text-zinc-600 transition-colors focus:border-sky/70 focus:outline-none";
  const errCls = "border-red-400/60";
  const okCls = "hairline";

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Contact form">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-medium text-zinc-200">
            {t.name} *
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "name-error" : undefined}
            placeholder={t.namePlaceholder}
            className={`${inputCls} ${errors.name ? errCls : okCls}`}
          />
          {errors.name && (
            <p id="name-error" role="alert" className="mt-2 flex items-center gap-1.5 text-sm text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> {errors.name}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-zinc-200">
            {t.email} *
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            placeholder={t.emailPlaceholder}
            className={`${inputCls} ${errors.email ? errCls : okCls}`}
          />
          {errors.email && (
            <p id="email-error" role="alert" className="mt-2 flex items-center gap-1.5 text-sm text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> {errors.email}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          <label htmlFor="project-type" className="mb-2 block text-sm font-medium text-zinc-200">
            {t.type} *
          </label>
          <select
            id="project-type"
            value={projectType}
            onChange={(e) => setProjectType(e.target.value)}
            aria-invalid={!!errors.projectType}
            aria-describedby={errors.projectType ? "type-error" : undefined}
            className={`${inputCls} ${errors.projectType ? errCls : okCls} ${!projectType ? "text-zinc-500" : ""}`}
          >
            <option value="" disabled>{t.typePlaceholder}</option>
            {projectTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          {errors.projectType && (
            <p id="type-error" role="alert" className="mt-2 flex items-center gap-1.5 text-sm text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> {errors.projectType}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="budget" className="mb-2 block text-sm font-medium text-zinc-200">
            {t.budget}
          </label>
          <select id="budget" value={budget} onChange={(e) => setBudget(e.target.value)} className={`${inputCls} ${okCls}`}>
            {budgets.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-6">
        <label htmlFor="description" className="mb-2 block text-sm font-medium text-zinc-200">
          {t.description} *
        </label>
        <textarea
          id="description"
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? "desc-error" : "desc-hint"}
          placeholder={t.descriptionPlaceholder}
          className={`${inputCls} ${errors.description ? errCls : okCls} resize-y`}
        />
        {!errors.description && (
          <p id="desc-hint" className="mt-2 text-sm text-zinc-500">
            {t.descriptionHint}
          </p>
        )}
        {errors.description && (
          <p id="desc-error" role="alert" className="mt-2 flex items-center gap-1.5 text-sm text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> {errors.description}
          </p>
        )}
      </div>

      <p className="mt-6 flex items-start gap-2 rounded-xl border hairline bg-white/[0.03] px-4 py-3 text-sm leading-relaxed text-zinc-400">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky" aria-hidden="true" />
        {t.noBackend}
      </p>

      <button
        type="submit"
        className="group mt-6 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-medium text-black transition-colors hover:bg-sky"
      >
        {t.submit}
        <Send className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
      </button>
    </form>
  );
}
