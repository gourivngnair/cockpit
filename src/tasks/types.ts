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
  /**
   * Todoist's due date and time. For a repeating task this is its schedule. For any other task
   * it is the planned work time, mirrored from Cockpit's earliest upcoming block.
   */
  due: Due | null
  /** The real deadline: Todoist's Deadline field (date only), YYYY-MM-DD. */
  deadline: string | null
  durationMin: number | null
  checked: boolean
}

/** What the New task card collects. */
export interface NewTask {
  content: string
  projectId: string | null // null = Inbox
  label: string | null // subgoal
  durationMin: number | null
  deadline: string | null // date only
}

/** A planned work time: where a task's earliest upcoming block starts and how long it is. */
export interface Plan {
  date: string
  time: string
  minutes: number
}

/** Everything the app knows about tasks comes through this interface. */
export interface TaskSource {
  listProjects(): Promise<Project[]>
  listTasks(): Promise<Task[]>
  /** Adds a task. Its deadline (if any) goes in Todoist's Deadline field, never the due date. */
  createTask(input: NewTask): Promise<Task>
  /** Completes a task (for a repeating task, today's occurrence). */
  completeTask(id: string): Promise<void>
  /** Reopens a completed task (undo). Not for repeating tasks. */
  reopenTask(id: string): Promise<void>
  /** Moves a task to another goal (project). */
  moveTask(id: string, projectId: string): Promise<void>
  /** Replaces a task's labels (used for the subgoal). */
  setLabels(id: string, labels: string[]): Promise<void>
  /** Sets or clears a task's deadline (date only). Refused for repeating tasks. */
  setDeadline(id: string, date: string | null): Promise<void>
  /** Sets or clears the planned work time (due date and time, plus length). Refused for repeating tasks. */
  setPlan(id: string, plan: Plan | null): Promise<void>
}
