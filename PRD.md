# Cockpit v3: Product Requirements

## Problem
Gouri needs one calm, beautiful place to plan Term 2 around her four goals. The first Cockpit (a single-file web artifact) looked right and fit her goals exactly, but it felt glitchy and was not a proper app on her laptop and tablet. Tasks already live in Todoist and must keep living there.

## Why v1 felt right (keep)
- The look: Inter, light grey canvas, white rounded panels, pastel blocks tinted by goal, red "now" line, red date badge.
- It fit her goals exactly: Goal, then Subgoal, then Tasks.
- Building it was enjoyable, so the build is iterative and visible.

## Why v1 was left (fix)
- Glitchy: drag-and-drop failed, resized blocks did not save, repeating tasks could be ticked several times.
- Not a real app: no install on laptop or tablet, no offline, no notifications.

## Success criteria
1. Zero data-loss bugs: every block move, resize, tick and diet answer survives a reload and appears on the other device within 10 seconds.
2. Installable as an app (PWA) on a Windows laptop (Chrome or Edge) and on the tablet.
3. Opens in under 2 seconds on repeat visits; usable offline for viewing the day.
4. Automated tests cover every bug class listed under "Lessons from v1".
5. In use on at least 5 of 7 days by week 3 of Term 2.

## Goals the app is built around (priority order)
| # | Goal (Todoist project) | Subgoals (Todoist labels) |
|---|---|---|
| 1 | Term 2 GPA (above 7) | hard-courses, end-terms, assignments |
| 2 | Excel Outside Class | competition, dracula, research-paper |
| 3 | 55 kg and Healthy | gym, morning-routine, clean-diet |
| 4 | Better Writer | substack, bradbury, monthly-book |
| 5 | Life Admin (maintenance) | none |

Guardrails to surface in the UI: one case competition this term; no new competitions or club commitments from 15 Nov until end-terms (blackout). Term 2 runs 5 Oct to mid-December 2026 (dates tentative).

## Scope, in phases (each phase ends with a few days of real use)
**Phase 0: Foundations**
Scaffold, design system, PWA install, auth (single user), Supabase project, Todoist read proxy, CI with tests.

**Phase 1: Plan (the core)**
- Left: Goals panel, grouped Goal, then Subgoal (label), then Tasks, in priority order. Inbox shows as "Unsorted" at the top when non-empty. Per-goal "Add task".
- Centre: Day and Week calendar, 7 am to midnight. Drag a task onto a slot to create a work block; drag a block to move it; drag its bottom edge to resize (15 min steps). Click a block for length, mark done, remove block, focus.
- Deadlines: the Todoist due date and time is the deadline. Show it as a red chip on the task and a thin red line on the calendar.
- Repeating tasks show as grey dashed blocks at their Todoist time and cannot be moved or resized.
- Right: Today's vision image (rotates daily).

**Phase 2: Focus mode**
Full-screen timer over a blurred vision image. Presets 25/5, 50/10, 15/3; long break after 4 rounds. Generated soundscapes (rain, brown noise, soft hum) via Web Audio; fade out on breaks. Saved playlist link with "open with focus". Timer state synced across devices; sound plays only on the device that pressed Start. Minimised pill with countdown.

**Phase 3: Vision board**
Upload images (Supabase Storage), caption and theme per image, masonry grid with theme filters.

**Phase 4: Progress**
One card per goal: hard-course reviews vs weeks elapsed, assignments on time, marks (manual entry), milestones checklist, gym this week out of 3 plus 4-week trend, morning-routine and Bradbury streaks, Bradbury nights out of 1,000, clean-diet daily yes/no (also prompted at the top of the Goals panel), essays and books finished.

**Out of scope:** finance, notes directory, AI features inside the app, sharing, changing the dates of repeating tasks, rescheduling existing tasks by dragging. (Setting a deadline on a new non-repeating task, and editing the deadline of an existing non-repeating task, are allowed: see Decisions, 2026-10-04 update.)

## Constraints
- Todoist is the source of truth for tasks. Cockpit never changes a repeating task's date, and never moves a task's date as a side effect of planning (blocks are Cockpit-only). It may set a deadline when a task is created and edit the deadline of a non-repeating task.
- Free tiers only (Vercel or Netlify hosting, Supabase free plan).
- Todoist API token stays server-side (Supabase secret), never in the browser bundle.
- Laptop is Windows; tablet OS to confirm (affects PWA install and notifications).

## Lessons from v1 (each one needs a test)
1. Use pointer events for drag, never the HTML5 drag-and-drop API. Suspend re-renders while a drag or resize is in progress.
2. Saving a resize must write the whole block record, not a partial update.
3. Never reschedule a repeating task from Cockpit; it erases the repeat rule in Todoist.
4. Lock the checkbox of a repeating task once today's occurrence is done; an early tick completes future days.
5. Todoist's completed-tasks endpoint omits repeating-task completions. Use the activity log (completed events carry the occurrence's due date) and copy every event into Cockpit's own database, because activity history retention varies by plan.
6. Todoist's separate "deadline" field needs a paid plan; do not depend on it.
7. Project colours: map Todoist colour names onto the app palette; sub-projects inherit the parent's colour.

## Decisions (2026-10-04)
- Tablet: Samsung Galaxy Tab S9 FE (Android, Chrome). PWA installs natively and supports web push. Laptop: Windows, Chrome or Edge.
- Todoist plan: Pro. Task durations are the default block length. The due date and time stays the deadline (lesson 6 still applies; the paid deadline field is not used).
- Notifications (build in Phase 1 step 4, via web push + a scheduled Supabase job): (a) class starting, 10 minutes before; (b) deadline approaching, 24 hours before the due time, any time of day (no quiet hours). Lead times are settings. Focus-phase-ending alerts are not wanted.
- Class schedule: classes change every week. Each Sunday Gouri shares a screenshot of the schedule in a Claude chat; Claude turns it into JSON, and she pastes it into an "Import week" box in Cockpit (plus a small editor for fixes). Needs a Supabase `events` table. Events show as grey dashed blocks.
- Meetings come from Google Calendar and are out of scope for Phase 1. Event alerts therefore cover classes only for now.
- Phase 1 right panel (today's vision) is an empty placeholder until Phase 3.
- Completed tasks are copied into Supabase `done` from Phase 1 step 4 onward, so history accrues.
- Phase 1 order: (1) calendar + classes, (2) Goals panel in full, (2b) full New task card and moving tasks, (3) work blocks, (4) notifications, update banner, completion history.

## Decisions (2026-10-04, update)
- New task card: name, goal, subgoal (label), time needed (Todoist duration), deadline (date and optional time). Saved to Todoist as a normal task.
- Moving tasks: drag onto a goal heading (moves the project, clears the subgoal) or onto a subgoal (moves project and label); a "Move to" menu does the same on touch devices. Existing non-subgoal labels are preserved.
- Deadlines: editable on existing non-repeating tasks. Repeating tasks are locked.
- Time needed: resizing a block also updates the task's duration in Todoist, so it reads the same everywhere.
- Renaming tasks is not needed for now.
- Touch drag: press and hold about 0.35 s to pick up a task or block.
- A task may have several blocks (splitting work across days); needs a `blocks` schema change in step 3.
- After "Mark done" on a block, the block stays that day, faded and struck through, for the rest of the session; from step 4 done blocks come from saved history.
- The Focus button in the block card waits for Phase 2.
- Project lives at `C:\Users\gouri\dev\cockpit` (not OneDrive), backed up on GitHub.
- Todoist projects and labels match the goals table above exactly.

## Future direction (not in current scope)
Gouri expects to stop using Todoist at some point and create tasks and deadlines by telling Claude in a chat. To keep that possible, the app reads tasks only through a single task-source layer (`src/tasks/`), never from Todoist directly. Replacing Todoist later means swapping that layer for Cockpit's own tasks table, plus a way for Claude chat to create tasks. Do not build this until asked.

## Open questions
None blocking Phase 0.
