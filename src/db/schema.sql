CREATE EXTENSION IF NOT EXISTS vector;

-- Tool-use traces: one row per completed agent task execution
CREATE TABLE IF NOT EXISTS hive_traces (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       TEXT NOT NULL DEFAULT 'experiment',
  namespace       TEXT NOT NULL DEFAULT 'global',
  task_description TEXT NOT NULL,
  tool_sequence   TEXT[] NOT NULL,
  outcome         TEXT NOT NULL,
  total_tokens    INTEGER NOT NULL,
  latency_ms      INTEGER NOT NULL,
  embedding       vector(1536),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hive_traces_embedding_idx
  ON hive_traces
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE TABLE IF NOT EXISTS markov_transitions (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       TEXT NOT NULL DEFAULT 'experiment',
  namespace       TEXT NOT NULL DEFAULT 'global',
  prev_tool       TEXT NOT NULL,
  next_tool       TEXT NOT NULL,
  count           INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, namespace, prev_tool, next_tool)
);

CREATE INDEX IF NOT EXISTS markov_transitions_lookup_idx
  ON markov_transitions (tenant_id, namespace, prev_tool);

CREATE TABLE IF NOT EXISTS experiment_runs (
  id              BIGSERIAL PRIMARY KEY,
  run_id          TEXT NOT NULL,
  agent_type      TEXT NOT NULL,
  task_id         TEXT NOT NULL,
  task_domain     TEXT NOT NULL,
  task_description TEXT NOT NULL,
  tool_sequence   TEXT[] NOT NULL,
  expected_sequence TEXT[] NOT NULL,
  outcome         TEXT NOT NULL,
  total_tokens    INTEGER NOT NULL,
  llm_calls       INTEGER NOT NULL,
  latency_ms      INTEGER NOT NULL,
  knn_hit         BOOLEAN DEFAULT FALSE,
  markov_accuracy FLOAT DEFAULT 0.0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
