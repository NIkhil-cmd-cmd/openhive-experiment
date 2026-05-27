import { pool } from '../db/client.js';
import type { EmbeddingAdapter } from '../embeddings/adapter.js';

export interface IngestTraceParams {
  tenant_id: string;
  namespace: string;
  task_description: string;
  tool_sequence: string[];
  outcome: string;
  total_tokens: number;
  latency_ms: number;
  embedder: EmbeddingAdapter;
}

export async function ingestTrace(params: IngestTraceParams): Promise<number> {
  const embedding = await params.embedder.embed(params.task_description);
  const embeddingStr = `[${embedding.join(',')}]`;

  const result = await pool.query<{ id: number }>(
    `
    INSERT INTO hive_traces (
      tenant_id, namespace, task_description, tool_sequence,
      outcome, total_tokens, latency_ms, embedding
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)
    RETURNING id
    `,
    [
      params.tenant_id,
      params.namespace,
      params.task_description,
      params.tool_sequence,
      params.outcome,
      params.total_tokens,
      params.latency_ms,
      embeddingStr,
    ],
  );

  return result.rows[0].id;
}
