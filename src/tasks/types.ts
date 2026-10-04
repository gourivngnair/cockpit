export interface Project {
  id: string
  name: string
  color: string
  parentId: string | null
  inbox: boolean
  childOrder: number
}

export interface Due {
  date: string // YYYY-MM-DD
  time: string | null // HH:MM, local, or null for all-day
}

export interface Task {
  id: string
  content: string
  projectId: string
  labels: string[]
  recurring: boolean
  due: Due | null
  durationMin: number | null
  checked: boolean
}

/** What the New task card collects. A deadline is only ever sent for a new task. */
export interface NewTask {
  content: string
  projectId: string | null // null = Inbox
  label: string | null // subgoal
  durationMin: number | null
  due: Due | null
}

/** Everything the app knows about tasks comes through this interface. */
export interface TaskSource {
  listProjects(): Promise<Project[]>
  listTasks(): Promise<Task[]>
  /** Adds a task, with an optional deadline. Never repeating. */
  createTask(input: NewTask): Promise<Task>
  /** Completes a task (for a repeating task, today's occurrence). */
  completeTask(id: string): Promise<void>
  /** Moves a task to another goal (project). */
  moveTask(id: string, projectId: string): Promise<void>
  /** Replaces a task's labels (used for the subgoal). */
  setLabels(id: string, labels: string[]): Promise<void>
  /** Sets or clears the deadline of a non-repeating task. Refused for repeating tasks. */
  setDeadline(id: string, due: Due | null): Promise<void>
  /** Sets a task's time needed. Refused for repeating tasks. */
  setDuration(id: string, minutes: number): Promise<void>
}