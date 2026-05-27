import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.POSTGRES_URL ?? 'postgresql://hive:hivepassword@localhost:5432/openhive_experiment',
});
