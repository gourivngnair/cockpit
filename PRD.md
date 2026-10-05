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
| 3 | 55 kg and Healthy | gym, morning-routine (clean diet is tracked on the Progress page, not as a task) |
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

## Decisions (2026-10-04, planned time in Todoist)
Supersedes "the Todoist due date and time is the deadline" (Constraints, Phase 1 "Deadlines") and lesson 6.
- A task's real deadline is Todoist's **Deadline** field (Pro). It is a date only, so Cockpit shows deadlines as all-day red chips (on the task, and above the hours on the calendar), not as a line at a time.
- A task's Todoist **due date and time is the planned work time**, mirrored from Cockpit's **earliest upcoming block** (one that has not finished), with the block's length as the duration. When no upcoming block is left, the due date is cleared. Tasks with no deadline are fine.
- Repeating tasks keep their schedule untouched; nothing in Cockpit writes their dates.
- The New task card and the deadline editor set the Deadline field (date only). The time-of-day deadline input is gone.
- One-time migration (needs explicit approval): for each existing non-repeating task whose due date was really a deadline, copy that date into the Deadline field and clear the due date. At the time of writing that is 5 tasks, all all-day dates, so no time-of-day is lost.
- Deadline alerts (Phase 1 step 4) are date-only: the reminder time is decided when notifications are built.

## Decisions (2026-10-04, Phase 1 step 4)
- Alerts (web push, India time): 10 minutes before each **class** (events such as talks get none); at **8:00 am** one digest of today's deadlines and anything overdue (silent when none; if the 8:00 run is missed it still goes out until noon). Repeating tasks are never in the digest.
- A scheduler in the database (pg_cron) calls the `notify` function every minute and `sync-done` hourly, authenticated by a secret kept in the Supabase vault. Both functions are deployed with `--no-verify-jwt` and check access themselves.
- Completion history is copied into `done` so progress accrues and finished blocks stay on the calendar after a reload.
- "New version available" banner replaces silent updates (service worker in prompt mode).
- Quick-add by typing: the New task card reads a duration ("1h", "90 min"), a date ("fri", "tomorrow", "12 oct", "12/10") and subgoal words from the task name and fills any field left empty. Rule-based, no AI.
- Focus mode (Phase 2) uses a 5-4-3-2-1 beep at the end of a focus round and at the end of a break instead of soundscapes. Focus sessions will be logged for the Progress page.
- Email: tasks, assignments and exams are found on demand in a Claude chat (Gmail connector), proposed for approval, and added to Todoist. Nothing is built into Cockpit for this.

## Decisions (2026-10-04, undo)
- Undo and redo (Ctrl+Z / Cmd+Z, Ctrl+Shift+Z or Ctrl+Y, plus buttons in the top bar for the tablet). History lasts for the session (last 30 actions).
- Undoable: planning, moving, resizing and removing blocks (and the Todoist planned time that follows them); moving a task between goals and subgoals; deadline changes; completing a non-repeating task (reopened in Todoist, and its saved completion forgotten).
- Not undoable: ticking a repeating task (reopening could disturb its schedule) and adding a task (Cockpit may not delete Todoist tasks). Ctrl+Z inside a text field keeps its normal meaning of undoing typing.

## Decisions (2026-10-04, Phase 2: Focus mode)
- Presets 25/5, 50/10, 15/3; after every 4th round the break is long (15, 20 and 10 minutes for the three presets). Focus rounds are 1 to 4, then start over.
- A finished focus round starts its break by itself; a finished break waits for Start (the next round is paused). A device that slept through the end moves on one step from the moment it wakes, never replaying the past.
- The timer counts to an end time (not by ticking a number), is saved in `focus` and followed by every device (live updates plus a 5 second backstop). Starting, pausing and ending are shared; the countdown beeps play only on the device that pressed Start, and only after a tap or key press there.
- Beeps: one tick for each of the last 5 seconds and a long tone at zero, for the end of a round and the end of a break. Scheduled ahead on the audio clock so a hidden tab still beeps. A volume slider (per device); at zero nothing is scheduled. No soundscapes.
- Playlist link kept: a Spotify or YouTube link, opened when a fresh focus round starts if "Open with focus" is on.
- Focus log: every finished round is saved (completed), and a round ended or skipped early is saved with the minutes actually focused (not completed) if it was at least a minute. Pauses do not count. Each task shows its total focused time.
- Starting: top bar button (picks the task whose block is on now), the Focus button on a block card, "Focus on this" in a task menu. "Mark task done" inside Focus mode completes the task and the timer carries on as plain focus.
- Screen stays awake while counting (where the browser allows); the countdown shows in the tab title and in a pill when minimised. Space starts or pauses, Escape minimises.
- Background is a soft gradient until the vision board (Phase 3) provides images.

## Decisions (2026-10-04, Phase 3: Vision board)
- A **Vision** tab beside Plan (address `#/vision`, so the back button works). Upload by picking files, dragging them in, or pasting from the clipboard. Up to 20 images per upload, 15 MB each.
- Images are shrunk in the browser: a main copy of at most 1600 px and a grid copy of at most 480 px (JPEG). If any step of an upload fails, nothing is left behind (files removed, no row saved). The files are private and shown through short-lived signed links, renewed before they expire.
- Each image has a caption and a free-text theme (suggestions come from themes already used; blank means "Unsorted", which has no chip). Masonry grid, newest first, with theme filter chips, and a full-size view with arrows, caption and theme editing, "Show this one today" (a pin that lasts for that day) and Remove.
- Removing asks first and cannot be undone (the files are deleted), so it is not part of Ctrl+Z.
- "Pinterest board" button links to https://pin.it/3M7bCmDl1.
- Today's vision: an image pinned for today wins; otherwise the images take turns, one a day, in the order they were added (same on every device). A shuffle button moves on to the next image for this session only. Shown in the right-hand panel at 1320 px wide and above (Day view), and as a slim strip above the calendar on narrower screens such as the tablet (Day view only).
- The same image is the blurred background of Focus mode, with a "Next image" button. Today's image is kept on the device so it still shows with no connection, and the board's list is kept too.

## Decisions (2026-10-05, Phase 4: Progress)
- **Counts start on 5 Oct 2026 (the first day of Term 2) and nothing earlier is counted.** The 15 older test completions in Cockpit's saved history were deleted, and the completion sync never reads Todoist's activity log before that day (even from an earlier saved position). Bradbury nights are counted from the night of 5 Oct.
- Term calendar (fixed in the app, `src/progress/stats.ts`): term starts 5 Oct, the first weekly hard-course review is due 24 Oct, the blackout starts 15 Nov, term ends about 15 Dec.
- A **Progress** tab sits between Plan and Vision. At the top, a "this week" strip: tasks done, focus today, focus this week, gym this week out of 3, and focus for the last 4 weeks. Then one card per goal, each ending with "Focused this week":
  - Term 2 GPA: hard-course reviews done against due, assignments on time. **Marks are not shown** (the PRD's manual marks entry is dropped).
  - Excel Outside Class: milestones checklist (finished and open one-off tasks, overdue flagged) and the blackout note. Milestones appear on this card only.
  - 55 kg and Healthy: gym this week out of 3 with a 4-week chart, morning-routine streak and 14 days, clean diet 14 days.
  - Better Writer: Bradbury nights out of 1,000 with streak, bar and 14 nights, essays published, books finished.
  - Life Admin: done this week, overdue, open.
- **Clean diet is no longer a task or subgoal.** It is only the daily yes or no on the Progress page (Yesterday and Today buttons; tap a past day's dot to cycle clean, not really, none). There is no prompt on the Goals panel and no evening question or reminder.
- Gym in Todoist was changed to every Mon, Wed and Fri at 6:30 am (30 minutes), keeping the target of 3 a week.

## Future direction (not in current scope)
Gouri expects to stop using Todoist at some point and create tasks and deadlines by telling Claude in a chat. To keep that possible, the app reads tasks only through a single task-source layer (`src/tasks/`), never from Todoist directly. Replacing Todoist later means swapping that layer for Cockpit's own tasks table, plus a way for Claude chat to create tasks. Do not build this until asked.

## Open questions
None blocking Phase 0.
