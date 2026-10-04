# Cockpit: instructions for Claude Code

Read PRD.md before any work. `reference/cockpit-v2.html` is the previous single-file version: use it as the reference for look, layout and logic, but not for architecture.

## Working agreement
- The owner (Gouri) wants to see a plan before you build. For each phase: propose the plan, list open questions, wait for "go".
- Build one phase at a time. Each phase ends deployed and usable.
- Disagree when something in a request conflicts with PRD.md. Flag it before acting; never silently change scope.
- Before anything destructive (deleting data, migrations that drop columns, force pushes): show the plan and wait for an explicit "proceed".
- Explain what you did in plain language at the end of each step. She is not a developer.

## Stack
- Vite + React + TypeScript, Tailwind CSS.
- PWA via vite-plugin-pwa (installable, offline shell, cached last-known day).
- Supabase: auth (magic link, single user), Postgres with row-level security on every table, Storage for vision images, Edge Functions as the Todoist proxy.
- Todoist API called only from Edge Functions using a secret token. Verify current Todoist API endpoints and response shapes against the official docs before coding; do not guess.
- Tests: Vitest for logic, Playwright for drag, resize, tick and sync flows.
- Hosting: Vercel or Netlify free tier, deploy on every merge to main.

## Architecture rule
All task reads and writes go through one task-source layer in `src/tasks/` (Todoist implementation behind an interface). No component imports Todoist code directly. This keeps a later move off Todoist cheap.

## Data ownership
| Data | Lives in |
|---|---|
| Tasks, projects, labels, repeat rules, deadlines | Todoist. Cockpit may: add tasks (with goal, subgoal label, time needed, optional deadline); complete tasks, and reopen a completed non-repeating task (undo only); move tasks between goals and subgoals (project and label); set or clear a task's Deadline; set or clear a non-repeating task's planned time (its due date and time, plus length) from its earliest upcoming block. Nothing else. (Decided 2026-10-04.) |

**Deadline vs planned time.** A task's real deadline is Todoist's *Deadline* field (a date, no time). Its *due* date and time is the planned work time, mirrored from Cockpit's earliest upcoming block that has not finished. No block left means the due date is cleared. A repeating task's due date is its schedule and is never written.
| Work blocks (task id, date, start, minutes) | Supabase `blocks` |
| Completion history copy | Supabase `done` (one row per task occurrence), filled by the `sync-done` function from Todoist's activity log (the raw log calls a task an "item"). Run on app open, every 10 minutes while open, after a tick, and hourly by the scheduler. |
| Push subscriptions (one per device), alerts already sent | Supabase `push_subscriptions`, `notified` |
| Clean-diet answers, marks | Supabase `diet`, `marks` |
| Focus timer state and settings | Supabase `focus` (one row) |
| Class and meeting events (entered weekly) | Supabase `events` |
| Vision images | Supabase Storage plus `vision` table |

## Invariants (never break these)
1. Cockpit never writes a due date to a repeating task. For any other task it writes the due date only as the planned time from the earliest upcoming block (and clears it when none is left); it never touches the Deadline field as a side effect of planning. The Edge Function enforces the repeating check itself (it looks the task up and refuses), not just the UI.
2. Repeating tasks cannot be dragged, resized or rescheduled in Cockpit.
3. A repeating task's checkbox is disabled when its next due date is after today.
4. Every write is optimistic, then confirmed; on failure, roll back and show a toast. No silent failures.
5. Resize and move write the full block row.
6. Drag uses pointer events; no re-render may replace the dragged element mid-gesture.
7. Sound starts only after a user gesture on that device.

## Design tokens (from v2)
- Font: Inter (400, 500, 600, 700) with system fallbacks.
- Light: canvas #F2F2F3, panel #FFFFFF, soft #F6F6F7, line #E8E8EA, ink #1C1C1E, ink2 #48484D, muted #8E8E93, accent red #F0443A.
- Goal hues: GPA #E0314B, Excel #15998F, Health #E07A12, Writer #5856D6, Life Admin #5B6B7F. Block fill is 15% of the hue on the panel colour, with text in the full hue.
- Repeating tasks and classes: grey fill #F4F4F5 with a dashed #D6D6DA border.
- Panels: 16 px radius, 1 px border; blocks 10 px radius.
- Dark mode with the same structure. No em dashes in any UI copy.

## Definition of done for a phase
- All tests pass in CI, including a Playwright test for each relevant lesson in PRD.md.
- Works installed on the laptop and on the tablet.
- A two-device check: change something on one, see it on the other within 10 seconds.
