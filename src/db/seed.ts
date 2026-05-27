import { pool } from './client.js';
import type { OpenAIEmbedder } from '../embeddings/openai.js';
import { allTasks } from '../tasks/index.js';
import { ingestTrace } from '../hive/ingest.js';
import { paraphrases } from './paraphrases.js';

async function seedMarkovFromSequence(sequence: string[]) {
  for (let i = 0; i < sequence.length - 1; i++) {
    const prev = sequence[i];
    const next = sequence[i + 1];

    await pool.query(
      `
      INSERT INTO markov_transitions (tenant_id, namespace, prev_tool, next_tool, count)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id, namespace, prev_tool, next_tool)
      DO UPDATE SET count = markov_transitions.count + EXCLUDED.count
      `,
      ['experiment', 'global', prev, next, 3],
    );
  }
}

export async function seedHive(embedder: OpenAIEmbedder, tracesPerTask: number = 8) {
  console.log(`Seeding hive with up to ${allTasks.length * tracesPerTask} traces...`);

  let seeded = 0;
  for (const task of allTasks) {
    const variants = paraphrases[task.id] ?? [];
    const descriptions = [task.description, ...variants].slice(0, tracesPerTask);

    for (const desc of descriptions) {
      const latencyVariation = Math.floor(Math.random() * 400);
      const tokenVariation = Math.floor(Math.random() * 200);

      await ingestTrace({
        tenant_id: 'experiment',
        namespace: 'global',
        task_description: desc,
        tool_sequence: task.expectedSequence,
        outcome: 'success',
        total_tokens: 300 + tokenVariation,
        latency_ms: 800 + latencyVariation,
        embedder,
      });
      seeded++;
    }

    await seedMarkovFromSequence(task.expectedSequence);
  }

  console.log(`Seeded ${seeded} traces and Markov transitions.`);
  return seeded;
}

export async function clearHive() {
  await pool.query('TRUNCATE hive_traces, markov_transitions RESTART IDENTITY');
}
