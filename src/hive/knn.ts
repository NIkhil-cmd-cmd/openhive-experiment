import { pool } from '../db/client.js';
import type { EmbeddingAdapter } from '../embeddings/adapter.js';

export interface HiveTrace {
  id: number;
  task_description: string;
  tool_sequence: string[];
  outcome: string;
  total_tokens: number;
  similarity: number;
}

export async function knnRetrieve({
  query,
  embedder,
  k = 5,
  tenant_id = 'experiment',
  namespace = 'global',
}: {
  query: string;
  embedder: EmbeddingAdapter;
  k?: number;
  tenant_id?: string;
  namespace?: string;
}): Promise<HiveTrace[]> {
  const embedding = await embedder.embed(query);
  const embeddingStr = `[${embedding.join(',')}]`;

  const result = await pool.query<HiveTrace>(
    `
    SELECT
      id,
      task_description,
      tool_sequence,
      outcome,
      total_tokens,
      1 - (embedding <=> $1::vector) AS similarity
    FROM hive_traces
    WHERE tenant_id = $2
      AND namespace = $3
      AND outcome = 'success'
    ORDER BY embedding <=> $1::vector
    LIMIT $4
    `,
    [embeddingStr, tenant_id, namespace, k],
  );

  return result.rows;
}

export function formatHiveContext(traces: HiveTrace[], maxTokens = 400): string {
  if (traces.length === 0) return '';

  const lines: string[] = ['Relevant past agent experiences (most similar first):'];
  let estimatedTokens = 10;

  for (const trace of traces) {
    const line = `- Task: "${trace.task_description}" → Tools used: [${trace.tool_sequence.join(', ')}] (${trace.outcome}, similarity: ${trace.similarity.toFixed(2)})`;
    const lineTokens = Math.ceil(line.length / 4);
    if (estimatedTokens + lineTokens > maxTokens) break;
    lines.push(line);
    estimatedTokens += lineTokens;
  }

  return lines.join('\n');
}
