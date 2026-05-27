import { runAgentLoop } from './loop.js';
import { markovPredict, formatMarkovHint } from '../hive/markov.js';

export interface MarkovAgentResult {
  toolSequence: string[];
  toolResults: import('./tools.js').ToolResult[];
  totalInputTokens: number;
  totalOutputTokens: number;
  llmCalls: number;
  latencyMs: number;
  markovPredictions: number;
  markovCorrect: number;
}

export async function runMarkovAgent(taskDescription: string): Promise<MarkovAgentResult> {
  let markovPredictions = 0;
  let markovCorrect = 0;

  const result = await runAgentLoop(taskDescription, {
    systemPromptAddition:
      'When you see routing hints about likely next tools, use them as guidance — they are based on historical patterns.',
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
    markovPredictions,
    markovCorrect,
  };
}
