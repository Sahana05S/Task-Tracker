/** Logged effort on one task: the totals the workspace and details pages show. */
export interface TaskEffort {
  /** Sum of `hours_worked` across every log on the task. */
  hoursLogged: number;
  /** Number of log entries. */
  logCount: number;
}

export const EMPTY_EFFORT: TaskEffort = { hoursLogged: 0, logCount: 0 };
