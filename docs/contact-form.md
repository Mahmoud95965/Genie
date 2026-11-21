# Contact form — backend integration

## Current state (honest)

The contact form on `/contact` is an **interface only**. It validates
input in the browser (name, valid email, project type, description
of at least 20 characters; budget is optional) and shows clear error
states. On a valid submit it does **not** send anything and does
**not** claim a message was sent — it tells the visitor exactly that,
and points here.

No submissions are stored, logged, or emailed today.

## What is needed to make it send

Pick **one** of the following. Do not present the form as working
until one of them is live and tested end-to-end.

### Option A — API route + email service (recommended)

1. Create `src/app/api/contact/route.ts` (Next.js route handler).
2. Accept `POST` with JSON: `{ name, email, projectType, budget, description }`.
3. Validate the same fields server-side (never trust the client alone)
   and rate-limit the route (e.g. a few submissions per IP per hour).
4. Send the message with an email service — e.g. Resend, or
   Nodemailer with an SMTP provider. Store the API key in an
   environment variable (`RESEND_API_KEY` or equivalent), never in
   the repo. The recipient address is `contactEmail` in
   `src/config/site.ts` (currently a TODO — set the real address first).
5. Return `{ ok: true }` only after the email service accepts the
   message; return a 4xx/5xx with a clear error otherwise.
6. In `src/components/ContactForm.tsx`, replace the local
   “not sent yet” state with a `fetch("/api/contact", …)` call, and
   show a real success state only on `{ ok: true }`, and a real
   error state (with a retry) on failure.

### Option B — Form service (no code)

Use a hosted form endpoint (e.g. Formspree) and point the form's
submit handler at it. Same rule applies: show success only after
the service confirms receipt.

## Checklist before calling it done

- [ ] Real recipient email configured in `src/config/site.ts`
- [ ] Server-side validation + rate limiting
- [ ] Secrets in environment variables, not in the repo
- [ ] Success shown only on confirmed delivery; error shown on failure
- [ ] Test: valid submit, invalid email, empty description, and a
      failed send (e.g. bad API key) — all four states verified
- [ ] Remove the “no backend connected yet” notices from the form
      and the contact page once the above is true
