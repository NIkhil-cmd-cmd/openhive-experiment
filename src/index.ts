import './env.js';
import { runBenchmark } from './benchmark/runner.js';
import { pool } from './db/client.js';

async function main() {
  try {
    await runBenchmark();
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Experiment failed:', err);
  process.exit(1);
});
