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

/** Everything the app knows about tasks comes through this interface. */
export interface TaskSource {
  listProjects(): Promise<Project[]>
  listTasks(): Promise<Task[]>
  /** Adds a task. Cockpit never sets a due date. projectId null means the Inbox. */
  createTask(content: string, projectId: string | null): Promise<Task>
  /** Completes a task (for a repeating task, today's occurrence). */
  completeTask(id: string): Promise<void>
}
