import 'dotenv/config';
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Stats = {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p95Ms: number;
};

const ITERATIONS = Number(process.env.SQL_BENCH_ITERATIONS) || 30;
const WARMUP = Number(process.env.SQL_BENCH_WARMUP) || 3;

const sqlBefore = readFileSync(
  resolve(__dirname, 'request-before.sql'),
  'utf8',
);
const sqlAfter = readFileSync(
  resolve(__dirname, 'request-after.sql'),
  'utf8',
);

const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl:
    process.env.DB_SSL === 'true'
      ? { rejectUnauthorized: false }
      : undefined,
});

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
};

const runBenchmark = async (
  name: string,
  sql: string,
  iterations: number,
  warmup: number,
): Promise<Stats> => {
  for (let i = 0; i < warmup; i += 1) {
    await client.query(sql);
  }

  const times: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = process.hrtime.bigint();
    await client.query(sql);
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1_000_000;
    times.push(ms);
  }

  const totalMs = times.reduce((sum, t) => sum + t, 0);
  return {
    name,
    iterations,
    totalMs,
    avgMs: totalMs / iterations,
    minMs: Math.min(...times),
    maxMs: Math.max(...times),
    p95Ms: percentile(times, 95),
  };
};

const main = async (): Promise<void> => {
  await client.connect();
  try {
    const before = await runBenchmark(
      'before',
      sqlBefore,
      ITERATIONS,
      WARMUP,
    );
    const after = await runBenchmark('after', sqlAfter, ITERATIONS, WARMUP);

    console.log('SQL benchmark results (ms):');
    console.table([before, after]);
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

// npx ts-node homework/SQL-optimise/test.ts
