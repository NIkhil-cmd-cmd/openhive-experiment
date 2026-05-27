import { runAgentLoop, type AgentRunResult } from './loop.js';
import { knnRetrieve, formatHiveContext } from '../hive/knn.js';
import type { EmbeddingAdapter } from '../embeddings/adapter.js';

export async function runKnnAgent(
  taskDescription: string,
  embedder: EmbeddingAdapter,
  k: number = 5,
): Promise<AgentRunResult & { knnHit: boolean; retrievedTraces: number }> {
  const traces = await knnRetrieve({ query: taskDescription, embedder, k });
  const hiveContext = formatHiveContext(
    traces,
    parseInt(process.env.MAX_INJECTED_TOKENS ?? '400', 10),
  );
  const knnHit = traces.length > 0 && traces[0].similarity > 0.75;

  const result = await runAgentLoop(taskDescription, hiveContext);
  return { ...result, knnHit, retrievedTraces: traces.length };
}
