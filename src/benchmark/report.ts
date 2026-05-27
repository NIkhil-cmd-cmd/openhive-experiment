import fs from 'fs/promises';
import type { RunMetrics } from './metrics.js';

type AggregatedMetrics = ReturnType<
  typeof import('./metrics.js').aggregateMetrics
>;

export async function generateReport({
  runId,
  allRuns,
  byAgent,
  byDomain,
}: {
  runId: string;
  allRuns: RunMetrics[];
  byAgent: Record<string, AggregatedMetrics>;
  byDomain: Record<string, Record<string, AggregatedMetrics>>;
}) {
  const timestamp = new Date().toISOString();

  const jsonReport = { runId, timestamp, byAgent, byDomain, rawRuns: allRuns };
  await fs.writeFile(
    `experiment-results-${runId}.json`,
    JSON.stringify(jsonReport, null, 2),
  );

  const baseline = byAgent.baseline!;
  const knn = byAgent.knn!;
  const markov = byAgent.markov!;
  const combined = byAgent.combined!;

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const delta = (a: number, b: number, higherIsBetter = true) => {
    if (b === 0) return '—';
    const diff = ((a - b) / Math.abs(b)) * 100;
    const sign = diff > 0 ? '+' : '';
    const emoji = (diff > 0) === higherIsBetter ? '✅' : '❌';
    return `${emoji} ${sign}${diff.toFixed(1)}%`;
  };

  const md = `# OpenHive Validation Experiment Results
Run ID: ${runId}
Timestamp: ${timestamp}
Total agent runs: ${allRuns.length}

---

## H1: Does KNN retrieval help?

| Metric | Baseline | KNN | Delta |
|--------|----------|-----|-------|
| Success rate | ${pct(baseline.successRate)} | ${pct(knn.successRate)} | ${delta(knn.successRate, baseline.successRate)} |
| Sequence match | ${pct(baseline.avgSequenceMatchScore)} | ${pct(knn.avgSequenceMatchScore)} | ${delta(knn.avgSequenceMatchScore, baseline.avgSequenceMatchScore)} |
| Avg input tokens | ${baseline.avgInputTokens.toFixed(0)} | ${knn.avgInputTokens.toFixed(0)} | ${delta(knn.avgInputTokens, baseline.avgInputTokens, false)} |
| Avg LLM calls | ${baseline.avgLlmCalls.toFixed(2)} | ${knn.avgLlmCalls.toFixed(2)} | ${delta(knn.avgLlmCalls, baseline.avgLlmCalls, false)} |
| Avg latency (ms) | ${baseline.avgLatencyMs.toFixed(0)} | ${knn.avgLatencyMs.toFixed(0)} | ${delta(knn.avgLatencyMs, baseline.avgLatencyMs, false)} |
| KNN hit rate | — | ${pct(knn.knnHitRate)} | — |

**H1 verdict:** ${knn.successRate > baseline.successRate * 1.05 ? 'SUPPORTED — KNN shows meaningful improvement.' : knn.successRate >= baseline.successRate ? 'WEAK — minimal improvement, may not be statistically significant.' : 'REJECTED — KNN did not improve performance.'}

---

## H2: Does Markov routing help?

| Metric | Baseline | Markov | Delta |
|--------|----------|--------|-------|
| Success rate | ${pct(baseline.successRate)} | ${pct(markov.successRate)} | ${delta(markov.successRate, baseline.successRate)} |
| Sequence match | ${pct(baseline.avgSequenceMatchScore)} | ${pct(markov.avgSequenceMatchScore)} | ${delta(markov.avgSequenceMatchScore, baseline.avgSequenceMatchScore)} |
| Avg LLM calls | ${baseline.avgLlmCalls.toFixed(2)} | ${markov.avgLlmCalls.toFixed(2)} | ${delta(markov.avgLlmCalls, baseline.avgLlmCalls, false)} |
| Avg latency (ms) | ${baseline.avgLatencyMs.toFixed(0)} | ${markov.avgLatencyMs.toFixed(0)} | ${delta(markov.avgLatencyMs, baseline.avgLatencyMs, false)} |
| Markov prediction accuracy | — | ${pct(markov.avgMarkovAccuracy)} | — |

**H2 verdict:** ${markov.successRate > baseline.successRate * 1.05 ? 'SUPPORTED.' : markov.successRate >= baseline.successRate ? 'WEAK.' : 'REJECTED.'}

---

## H3: Does combined KNN + Markov outperform either alone?

| Metric | KNN | Markov | Combined |
|--------|-----|--------|----------|
| Success rate | ${pct(knn.successRate)} | ${pct(markov.successRate)} | ${pct(combined.successRate)} |
| Sequence match | ${pct(knn.avgSequenceMatchScore)} | ${pct(markov.avgSequenceMatchScore)} | ${pct(combined.avgSequenceMatchScore)} |
| Avg input tokens | ${knn.avgInputTokens.toFixed(0)} | ${markov.avgInputTokens.toFixed(0)} | ${combined.avgInputTokens.toFixed(0)} |
| Avg LLM calls | ${knn.avgLlmCalls.toFixed(2)} | ${markov.avgLlmCalls.toFixed(2)} | ${combined.avgLlmCalls.toFixed(2)} |

**H3 verdict:** ${combined.successRate >= Math.max(knn.successRate, markov.successRate) * 1.03 ? 'SUPPORTED — combined is best.' : 'NOT SUPPORTED — combined does not outperform best individual.'}

---

## Results by domain

${Object.entries(byDomain)
  .map(
    ([domain, agentResults]) => `
### ${domain.replace('_', ' ')}

| Agent | Success rate | Avg tokens | Avg LLM calls |
|-------|-------------|------------|---------------|
${['baseline', 'knn', 'markov', 'combined']
  .map(
    (type) =>
      `| ${type} | ${pct(agentResults[type]?.successRate ?? 0)} | ${(agentResults[type]?.avgInputTokens ?? 0).toFixed(0)} | ${(agentResults[type]?.avgLlmCalls ?? 0).toFixed(2)} |`,
  )
  .join('\n')}`,
  )
  .join('\n')}

---

## Cost estimate (actual)

Based on this run:
- Total input tokens consumed: ${allRuns.reduce((s, r) => s + r.totalInputTokens, 0).toLocaleString()}
- Total output tokens consumed: ${allRuns.reduce((s, r) => s + r.totalOutputTokens, 0).toLocaleString()}
- At Claude Sonnet pricing ($3/M input, $15/M output):
  - Input cost: $${((allRuns.reduce((s, r) => s + r.totalInputTokens, 0) / 1_000_000) * 3).toFixed(4)}
  - Output cost: $${((allRuns.reduce((s, r) => s + r.totalOutputTokens, 0) / 1_000_000) * 15).toFixed(4)}
- Embedding calls (OpenAI text-embedding-3-small at $0.02/M tokens): estimated $${(((allRuns.filter((r) => r.agentType === 'knn' || r.agentType === 'combined').length * 150) / 1_000_000) * 0.02).toFixed(4)}

---

## Statistical notes

This experiment runs ${allRuns.length / 4} tasks per agent type. For p<0.05 significance on a success rate difference of 10pp, you need approximately 200 runs per group. Current run has ${allRuns.length / 4} per group — ${allRuns.length / 4 >= 200 ? 'sufficient for basic significance testing' : 'insufficient for strict statistical significance — treat as directional evidence only'}.

Run Fisher exact test or chi-square on success/failure counts before citing these results externally.
`;

  await fs.writeFile(`experiment-results-${runId}.md`, md);
  console.log(`\nReports written:`);
  console.log(`  experiment-results-${runId}.json`);
  console.log(`  experiment-results-${runId}.md`);
  console.log('\nSummary:');
  console.log('  Baseline success rate:', pct(baseline.successRate));
  console.log('  KNN success rate:     ', pct(knn.successRate));
  console.log('  Markov success rate:  ', pct(markov.successRate));
  console.log('  Combined success rate:', pct(combined.successRate));
}
