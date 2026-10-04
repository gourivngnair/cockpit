// The only place the rest of the app gets tasks from. Swap this export to
// change where tasks come from (see CLAUDE.md, "Architecture rule").
export { todoistSource as taskSource } from './todoist'
export type { Project, Task, Due, TaskSource } from './types'
export { hueOf, goalRank } from './hues'
