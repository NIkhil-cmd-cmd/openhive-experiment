import { runAgentLoop, type AgentRunResult } from './loop.js';

export async function runBaselineAgent(taskDescription: string): Promise<AgentRunResult> {
  return runAgentLoop(taskDescription);
}
