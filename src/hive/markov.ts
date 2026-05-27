import { pool } from '../db/client.js';

export interface MarkovPrediction {
  next_tool: string;
  probability: number;
  count: number;
}

export async function markovPredict({
  prev_tool,
  tenant_id = 'experiment',
  namespace = 'global',
  topN = 3,
}: {
  prev_tool: string;
  tenant_id?: string;
  namespace?: string;
  topN?: number;
}): Promise<MarkovPrediction[]> {
  const result = await pool.query<{ next_tool: string; count: string; total: string }>(
    `
    WITH transition_counts AS (
      SELECT next_tool, count,
             SUM(count) OVER (PARTITION BY prev_tool) AS total
      FROM markov_transitions
      WHERE tenant_id = $1
        AND namespace = $2
        AND prev_tool = $3
    )
    SELECT next_tool, count, total
    FROM transition_counts
    ORDER BY count DESC
    LIMIT $4
    `,
    [tenant_id, namespace, prev_tool, topN],
  );

  return result.rows.map((row) => ({
    next_tool: row.next_tool,
    count: parseInt(row.count, 10),
    probability: parseInt(row.count, 10) / parseInt(row.total, 10),
  }));
}

export function formatMarkovHint(predictions: MarkovPrediction[]): string {
  if (predictions.length === 0) return '';
  const hints = predictions
    .map((p) => `${p.next_tool} (${(p.probability * 100).toFixed(0)}% probability)`)
    .join(', ');
  return `Based on past executions, the likely next tool is: ${hints}`;
}
