# OpenHive Validation Experiment

Self-contained benchmark to validate whether KNN retrieval and Markov routing improve agent performance vs a cold-start baseline. This is the validation harness described in the OpenHive project plan — run it before building the full HiveMind platform.

## Hypotheses

- **H1 (KNN):** Injecting similar past tool-use traces improves task completion and reduces tokens.
- **H2 (Markov):** Transition-probability hints improve routing accuracy vs no hints.
- **H3 (Combined):** KNN + Markov together outperform either alone.

## Prerequisites

- Docker and Docker Compose
- Node.js 20+
- OpenAI API key (embeddings)
- Anthropic API key (agent runs via Claude Sonnet)

## Quick start

```bash
cd openhive-experiment

# 1. Configure environment
cp .env.example .env
# Edit .env with OPENAI_API_KEY and ANTHROPIC_API_KEY

# 2. Start Postgres + pgvector
npm run db:up

# 3. Install dependencies
npm install

# 4. Run the full experiment (auto-seeds hive if < 100 traces)
npm run bench

# 5. View results
cat experiment-results-*.md
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run db:up` | Start Postgres with pgvector |
| `npm run db:down` | Stop Postgres |
| `npm run db:reset` | Wipe volume and restart fresh |
| `npm run seed-only` | Seed hive traces without running benchmark |
| `npm run bench` | Run full validation experiment |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_URL` | local docker URL | Postgres connection string |
| `OPENAI_API_KEY` | — | Required for embeddings |
| `ANTHROPIC_API_KEY` | — | Required for agent runs |
| `TASKS_PER_DOMAIN` | 50 | Limit tasks per domain (use `5` for quick sanity check) |
| `K_NEAREST` | 5 | Traces retrieved for KNN injection |
| `MAX_INJECTED_TOKENS` | 400 | Cap on hive context in system prompt |
| `SEED_TRACES_PER_TASK` | 8 | Traces seeded per task (seed-only script) |

### Fast sanity check (~20 min)

```bash
TASKS_PER_DOMAIN=5 npm run bench
```

Runs 15 tasks × 4 agent types = 60 runs instead of 240.

## Architecture

```
openhive-experiment/
├── src/
│   ├── db/           # Postgres schema, seeding, paraphrases
│   ├── embeddings/   # OpenAI embedding adapter
│   ├── hive/         # ingest, KNN retrieval, Markov routing
│   ├── agent/        # baseline, knn, markov, combined agents
│   ├── tasks/        # 60 tasks across 3 domains
│   └── benchmark/    # runner, metrics, report generation
└── docker-compose.yml
```

## Output

After a run, two files are written to the project root:

- `experiment-results-{runId}.json` — machine-readable full results
- `experiment-results-{runId}.md` — human-readable summary with H1/H2/H3 verdicts

## Expected runtime

- Full run (60 tasks × 4 agents = 240 runs): ~45–90 minutes
- Sanity check (`TASKS_PER_DOMAIN=5`): ~15–25 minutes

## Cost estimate

- Embeddings (seeding ~480 traces + queries): ~$0.05–0.20
- Claude Sonnet (240 runs): ~$2–8 depending on tool call depth

## What to look for

**KNN is working if:**
- Success rate ≥5pp above baseline
- KNN hit rate (similarity > 0.75) ≥60%

**Markov is working if:**
- Prediction accuracy ≥40% (random baseline ~6.7% for 15 tools)
- Lift strongest in `smart_home` domain

**Per-domain signal matters more than aggregate.** Smart home is highest-signal; info retrieval is lowest-signal for Markov.

## Troubleshooting

1. **Empty hive / low KNN hit rate:** Run `npm run seed-only` manually.
2. **Rate limits:** Increase delay in `runner.ts` or reduce `TASKS_PER_DOMAIN`.
3. **DB not ready:** Wait for healthcheck after `db:up`, or run `db:reset`.

## Relation to OpenHive

This experiment validates the core thesis in `plan.md` before investing in the full Fastify API, OpenHome SDK, and managed service. If H1/H2 are rejected here, revisit the product scope before building production infrastructure.
