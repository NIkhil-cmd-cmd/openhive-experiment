import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/client.js';
import { OpenAIEmbedder } from '../embeddings/openai.js';
import { seedHive } from '../db/seed.js';
import { getTasksForBenchmark } from '../tasks/index.js';
import { runBaselineAgent } from '../agent/baseline.js';
import { runKnnAgent } from '../agent/knn_agent.js';
import { runMarkovAgent } from '../agent/markov_agent.js';
import { runCombinedAgent } from '../agent/combined_agent.js';
import {
  evaluateSuccess,
  sequenceMatchScore,
  orderPreservationScore,
  aggregateMetrics,
  type RunMetrics,
} from './metrics.js';
import { generateReport } from './report.js';
import type { Task } from '../tasks/index.js';

const runId = process.env.EXPERIMENT_RUN_ID || uuidv4();

function getEmbedder(): OpenAIEmbedder {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }
  return new OpenAIEmbedder(apiKey);
}

async function preFlightCheck(embedder: OpenAIEmbedder) {
  const result = await pool.query('SELECT COUNT(*) as count FROM hive_traces');
  const count = parseInt(result.rows[0].count, 10);
  if (count < 100) {
    console.log(`Hive has only ${count} traces. Seeding...`);
    await seedHive(embedder, 8);
  } else {
    console.log(`Pre-flight OK: hive has ${count} traces.`);
  }
}

async function runTask(
  task: Task,
  agentType: 'baseline' | 'knn' | 'markov' | 'combined',
  embedder: OpenAIEmbedder,
): Promise<RunMetrics> {
  let result: Awaited<ReturnType<typeof runBaselineAgent>>;
  let knnHit: boolean | undefined;
  let markovAccuracy: number | undefined;

  try {
    switch (agentType) {
      case 'baseline':
        result = await runBaselineAgent(task.description);
        break;
      case 'knn': {
        const knnResult = await runKnnAgent(
          task.description,
          embedder,
          parseInt(process.env.K_NEAREST ?? '5', 10),
        );
        result = knnResult;
        knnHit = knnResult.knnHit;
        break;
      }
      case 'markov': {
        const markovResult = await runMarkovAgent(task.description);
        result = markovResult;
        markovAccuracy =
          markovResult.markovPredictions > 0
            ? markovResult.markovCorrect / markovResult.markovPredictions
            : 0;
        break;
      }
      case 'combined': {
        const combinedResult = await runCombinedAgent(task.description, embedder);
        result = combinedResult;
        knnHit = combinedResult.knnHit;
        markovAccuracy =
          combinedResult.markovPredictions > 0
            ? combinedResult.markovCorrect / combinedResult.markovPredictions
            : 0;
        break;
      }
    }
  } catch (err) {
    console.error(`Task ${task.id} / ${agentType} failed:`, err);
    return {
      agentType,
      taskId: task.id,
      taskDomain: task.domain,
      success: false,
      toolSequence: [],
      expectedSequence: task.expectedSequence,
      sequenceMatchScore: 0,
      orderPreservationScore: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      llmCalls: 0,
      latencyMs: 0,
    };
  }

  const seqMatch = sequenceMatchScore(result.toolSequence, task.expectedSequence);
  const orderScore = orderPreservationScore(result.toolSequence, task.expectedSequence);
  const success = evaluateSuccess(result.toolSequence, task);

  await pool.query(
    `
    INSERT INTO experiment_runs (
      run_id, agent_type, task_id, task_domain, task_description,
      tool_sequence, expected_sequence, outcome, total_tokens, llm_calls,
      latency_ms, knn_hit, markov_accuracy
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `,
    [
      runId,
      agentType,
      task.id,
      task.domain,
      task.description,
      result.toolSequence,
      task.expectedSequence,
      success ? 'success' : 'failure',
      result.totalInputTokens + result.totalOutputTokens,
      result.llmCalls,
      result.latencyMs,
      knnHit ?? false,
      markovAccuracy ?? 0,
    ],
  );

  return {
    agentType,
    taskId: task.id,
    taskDomain: task.domain,
    success,
    toolSequence: result.toolSequence,
    expectedSequence: task.expectedSequence,
    sequenceMatchScore: seqMatch,
    orderPreservationScore: orderScore,
    totalInputTokens: result.totalInputTokens,
    totalOutputTokens: result.totalOutputTokens,
    llmCalls: result.llmCalls,
    latencyMs: result.latencyMs,
    knnHit,
    markovAccuracy,
  };
}

export async function runBenchmark() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }

  const embedder = getEmbedder();
  await preFlightCheck(embedder);

  const tasks = getTasksForBenchmark();
  console.log(`\nStarting benchmark run ${runId}`);
  console.log(`Tasks: ${tasks.length} | Agent types: 4 | Total runs: ${tasks.length * 4}\n`);

  const allRuns: RunMetrics[] = [];
  const agentTypes = ['baseline', 'knn', 'markov', 'combined'] as const;

  for (const task of tasks) {
    for (const agentType of agentTypes) {
      process.stdout.write(`  ${task.id} / ${agentType}... `);
      const metrics = await runTask(task, agentType, embedder);
      allRuns.push(metrics);
      process.stdout.write(
        `${metrics.success ? '✓' : '✗'} (${metrics.llmCalls} LLM calls, ${metrics.totalInputTokens} input tokens)\n`,
      );

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  const byAgent = Object.fromEntries(
    agentTypes.map((type) => [type, aggregateMetrics(allRuns.filter((r) => r.agentType === type))]),
  );

  const domains = ['smart_home', 'scheduling', 'info_retrieval'] as const;
  const byDomain = Object.fromEntries(
    domains.map((domain) => [
      domain,
      Object.fromEntries(
        agentTypes.map((type) => [
          type,
          aggregateMetrics(
            allRuns.filter((r) => r.taskDomain === domain && r.agentType === type),
          ),
        ]),
      ),
    ]),
  );

  await generateReport({ runId, allRuns, byAgent, byDomain });
}
