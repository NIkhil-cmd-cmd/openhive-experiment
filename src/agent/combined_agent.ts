import { runAgentLoop } from './loop.js';
import { knnRetrieve, formatHiveContext } from '../hive/knn.js';
import { markovPredict, formatMarkovHint } from '../hive/markov.js';
import type { EmbeddingAdapter } from '../embeddings/adapter.js';

export interface CombinedAgentResult {
  toolSequence: string[];
  toolResults: import('./tools.js').ToolResult[];
  totalInputTokens: number;
  totalOutputTokens: number;
  llmCalls: number;
  latencyMs: number;
  knnHit: boolean;
  retrievedTraces: number;
  markovPredictions: number;
  markovCorrect: number;
}

export async function runCombinedAgent(
  taskDescription: string,
  embedder: EmbeddingAdapter,
  k: number = 5,
): Promise<CombinedAgentResult> {
  const traces = await knnRetrieve({ query: taskDescription, embedder, k });
  const hiveContext = formatHiveContext(
    traces,
    parseInt(process.env.MAX_INJECTED_TOKENS ?? '400', 10),
  );
  const knnHit = traces.length > 0 && traces[0].similarity > 0.75;

  let markovPredictions = 0;
  let markovCorrect = 0;

  const result = await runAgentLoop(taskDescription, {
    systemPromptAddition: [
      hiveContext,
      'When you see routing hints about likely next tools, use them as guidance — they are based on historical patterns.',
    ]
      .filter(Boolean)
      .join('\n\n'),
    getTurnHint: async ({ lastTool }) => {
      if (!lastTool) return { hint: '', predictedTool: null };
      const predictions = await markovPredict({ prev_tool: lastTool });
      const predictedTool = predictions[0]?.next_tool ?? null;
      if (predictions.length > 0) markovPredictions++;
      return { hint: formatMarkovHint(predictions), predictedTool };
    },
    onToolExecuted: ({ lastTool, predictedTool }) => {
      if (predictedTool && lastTool === predictedTool) {
        markovCorrect++;
      }
    },
  });

  return {
    ...result,
    knnHit,
    retrievedTraces: traces.length,
    markovPredictions,
    markovCorrect,
  };
}
