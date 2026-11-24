# Planner prototype (working name: لحّقها, provisional)

A small Arabic (Egyptian), mobile-first day planner built as a Genie File. This folder is source only and is not part of the website build.

What it does: you enter fixed appointments, tasks with durations and optional deadlines, and day rules (start, nothing-after, buffer). Plain code places the tasks, checks overlaps, buffers and deadlines, and when the day cannot fit everything it says which tasks will not make it. "Now" and "delay" / "done" controls rebuild the rest of the day.

Limits:
- No AI model is connected and it does not understand free text.
- No calendar connection.
- Saving after closing or refreshing the page is not guaranteed.
- The name is a working name; no trademark or domain check was done.

Files: `core.ts` (scheduling and checks; plain code, no host dependency, tested by `core.test.ts` via `npm test`), `App.tsx` (UI, imports the `@instinct/files` component kit, so it runs only inside the Genie File host, not in this Next site), `style.css`.
