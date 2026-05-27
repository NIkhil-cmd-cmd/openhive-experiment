import type { Task } from '../tasks/index.js';

export interface RunMetrics {
  agentType: string;
  taskId: string;
  taskDomain: string;
  success: boolean;
  toolSequence: string[];
  expectedSequence: string[];
  sequenceMatchScore: number;
  orderPreservationScore: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  llmCalls: number;
  latencyMs: number;
  knnHit?: boolean;
  markovAccuracy?: number;
}

export function sequenceMatchScore(actual: string[], expected: string[]): number {
  if (expected.length === 0) return 1.0;
  const actualSet = new Set(actual);
  const matched = expected.filter((t) => actualSet.has(t)).length;
  return matched / expected.length;
}

export function orderPreservationScore(actual: string[], expected: string[]): number {
  const actualFiltered = actual.filter((t) => expected.includes(t));
  if (actualFiltered.length === 0) return 0;

  let correct = 0;
  let expectedIdx = 0;
  for (const tool of actualFiltered) {
    if (expectedIdx < expected.length && tool === expected[expectedIdx]) {
      correct++;
      expectedIdx++;
    }
  }
  return correct / expected.length;
}

export function evaluateSuccess(actual: string[], task: Task): boolean {
  return sequenceMatchScore(actual, task.expectedSequence) >= task.successThreshold;
}

export function aggregateMetrics(runs: RunMetrics[]) {
  const n = runs.length;
  if (n === 0) return null;

  const sum = (key: keyof RunMetrics) =>
    runs.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);

  const markovRuns = runs.filter((r) => r.markovAccuracy !== undefined);

  return {
    n,
    successRate: runs.filter((r) => r.success).length / n,
    avgSequenceMatchScore: sum('sequenceMatchScore') / n,
    avgOrderPreservationScore: sum('orderPreservationScore') / n,
    avgInputTokens: sum('totalInputTokens') / n,
    avgOutputTokens: sum('totalOutputTokens') / n,
    avgLlmCalls: sum('llmCalls') / n,
    avgLatencyMs: sum('latencyMs') / n,
    knnHitRate: runs.filter((r) => r.knnHit).length / n,
    avgMarkovAccuracy:
      markovRuns.reduce((acc, r) => acc + (r.markovAccuracy ?? 0), 0) /
      Math.max(1, markovRuns.length),
  };
}
