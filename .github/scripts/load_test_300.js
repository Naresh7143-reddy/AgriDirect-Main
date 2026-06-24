#!/usr/bin/env node
// Fires 300 individual real HTTP requests at a target URL, concurrency-limited,
// and records a genuine pass/fail per request (2xx/3xx = pass). Writes
// GITHUB_OUTPUT totals, a per-request detail JSON, and a bucketed summary
// table to GITHUB_STEP_SUMMARY (300 individual rows would be unreadable,
// so requests are grouped into batches of 20 for the markdown table —
// the full per-request detail is in the uploaded JSON artifact).
//
// Usage: node load_test_300.js <url> <total> <concurrency> <json-out-path>
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const [, , url, totalArg, concurrencyArg, jsonOut] = process.argv;
const TOTAL = parseInt(totalArg || '300', 10);
const CONCURRENCY = parseInt(concurrencyArg || '10', 10);
const TIMEOUT_MS = 20000;

function singleRequest(index) {
  return new Promise((resolve) => {
    const start = Date.now();
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: TIMEOUT_MS }, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        resolve({
          index,
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 400,
          duration: Date.now() - start,
        });
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ index, status: 0, ok: false, duration: Date.now() - start, error: 'timeout' });
    });
    req.on('error', (e) => {
      resolve({ index, status: 0, ok: false, duration: Date.now() - start, error: e.message });
    });
  });
}

async function runBatched() {
  const results = [];
  for (let i = 0; i < TOTAL; i += CONCURRENCY) {
    const batch = [];
    for (let j = i; j < Math.min(i + CONCURRENCY, TOTAL); j++) {
      batch.push(singleRequest(j + 1));
    }
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
    process.stdout.write(`  …completed ${results.length}/${TOTAL} requests\n`);
  }
  return results;
}

async function main() {
  console.log(`Warm-up request to ${url} (not counted)...`);
  await singleRequest(0).catch(() => {});

  console.log(`Firing ${TOTAL} requests at ${url} (concurrency ${CONCURRENCY})...`);
  const results = await runBatched();

  const passed = results.filter((r) => r.ok).length;
  const failed = TOTAL - passed;

  const ghOutput = process.env.GITHUB_OUTPUT;
  if (ghOutput) {
    fs.appendFileSync(ghOutput, `total=${TOTAL}\npassed=${passed}\nfailed=${failed}\n`);
  }

  const ghSummary = process.env.GITHUB_STEP_SUMMARY;
  if (ghSummary) {
    let md = `\n## 📈 Load Testing — Performance\n\n`;
    md += `Target: \`${url}\`\n\n`;
    md += `**${passed}/${TOTAL} requests succeeded** (${failed} failed)\n\n`;
    md += `| Batch (requests) | Succeeded | Failed | Avg latency |\n|---|---|---|---|\n`;
    const bucketSize = 20;
    for (let i = 0; i < results.length; i += bucketSize) {
      const bucket = results.slice(i, i + bucketSize);
      const bucketPass = bucket.filter((r) => r.ok).length;
      const bucketFail = bucket.length - bucketPass;
      const avgLatency = Math.round(bucket.reduce((s, r) => s + r.duration, 0) / bucket.length);
      md += `| ${i + 1}-${i + bucket.length} | ${bucketPass} | ${bucketFail} | ${avgLatency}ms |\n`;
    }
    const failures = results.filter((r) => !r.ok).slice(0, 20);
    if (failures.length) {
      md += `\n<details><summary>❌ Failed requests (first ${failures.length})</summary>\n\n`;
      md += `| # | Status | Error | Duration |\n|---|---|---|---|\n`;
      failures.forEach((r) => {
        md += `| ${r.index} | ${r.status || '—'} | ${r.error || '—'} | ${r.duration}ms |\n`;
      });
      md += `\n</details>\n`;
    }
    fs.appendFileSync(ghSummary, md);
  }

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, JSON.stringify({
    url, total: TOTAL, passed, failed, results,
  }, null, 2));

  console.log(`Done: ${passed}/${TOTAL} requests succeeded, ${failed} failed.`);
}

main();
