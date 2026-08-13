import { performance } from "node:perf_hooks";

const baseUrl = process.env.LOAD_BASE_URL ?? "http://127.0.0.1:5050";
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 10);
const requests = Number(process.env.LOAD_REQUESTS ?? 200);
const latencyBudgetMs = Number(process.env.LOAD_P95_BUDGET_MS ?? 500);
const latencies = [];
let failures = 0;
let cursor = 0;

async function worker() {
  while (cursor < requests) {
    cursor += 1;
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}/api/v1/health/live`);
      if (!response.ok) failures += 1;
    } catch {
      failures += 1;
    } finally {
      latencies.push(performance.now() - started);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
latencies.sort((left, right) => left - right);
const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1] ?? Infinity;
const failureRate = failures / requests;

console.log(
  JSON.stringify({ requests, concurrency, failures, failureRate, p95Ms: p95 }),
);
if (failureRate > 0.01 || p95 > latencyBudgetMs) process.exitCode = 1;
