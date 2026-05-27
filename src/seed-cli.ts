import './env.js';
import { pool } from './db/client.js';
import { OpenAIEmbedder } from './embeddings/openai.js';
import { seedHive } from './db/seed.js';

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }

  const embedder = new OpenAIEmbedder(apiKey);
  const tracesPerTask = parseInt(process.env.SEED_TRACES_PER_TASK ?? '8', 10);
  await seedHive(embedder, tracesPerTask);
}

main()
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
