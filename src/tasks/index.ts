export interface Task {
  id: string;
  domain: 'smart_home' | 'scheduling' | 'info_retrieval';
  description: string;
  expectedSequence: string[];
  successThreshold: number;
}

export { smartHomeTasks } from './smart_home.js';
export { schedulingTasks } from './scheduling.js';
export { infoRetrievalTasks } from './info_retrieval.js';

import { smartHomeTasks } from './smart_home.js';
import { schedulingTasks } from './scheduling.js';
import { infoRetrievalTasks } from './info_retrieval.js';

export const allTasks: Task[] = [
  ...smartHomeTasks,
  ...schedulingTasks,
  ...infoRetrievalTasks,
];

export function getTasksForBenchmark(tasksPerDomain?: number): Task[] {
  const limit = tasksPerDomain ?? parseInt(process.env.TASKS_PER_DOMAIN ?? '50', 10);
  if (limit >= 20) return allTasks;

  return [
    ...smartHomeTasks.slice(0, limit),
    ...schedulingTasks.slice(0, limit),
    ...infoRetrievalTasks.slice(0, limit),
  ];
}
