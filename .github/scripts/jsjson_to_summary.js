#!/usr/bin/env node
// Parse a Jest/Vitest --json result file into GITHUB_OUTPUT totals + a
// per-test-case markdown table appended to GITHUB_STEP_SUMMARY, plus a
// JSON file the master-report job can merge into the final dashboard.
//
// Usage: node jsjson_to_summary.js <results.json> "<suite title>" <json-out-path> [append]
const fs = require('fs');
const path = require('path');

const [, , inPath, title, jsonOut, appendFlag] = process.argv;

let cases = [];
if (fs.existsSync(inPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(inPath, 'utf8'));
    const suites = raw.testResults || [];
    for (const suite of suites) {
      const file = path.basename(suite.name || suite.testFilePath || '');
      for (const t of suite.assertionResults || suite.testResults || []) {
        cases.push({
          name: t.title || t.fullName || 'unknown',
          file,
          status: t.status === 'passed' ? 'passed' : t.status === 'pending' || t.status === 'skipped' ? 'skipped' : 'failed',
          duration: t.duration || 0,
        });
      }
    }
  } catch (e) {
    console.log(`::warning::Could not parse ${inPath}: ${e.message}`);
  }
}

const total = cases.length;
const passed = cases.filter(c => c.status === 'passed').length;
const failed = cases.filter(c => c.status === 'failed').length;
const skipped = cases.filter(c => c.status === 'skipped').length;

const ghSummary = process.env.GITHUB_STEP_SUMMARY;
if (ghSummary) {
  let md = `\n## ${title}\n\n`;
  md += `**${passed}/${total} passed** (${failed} failed, ${skipped} skipped)\n\n`;
  if (cases.length) {
    md += `| # | Test case | Status |\n|---|---|---|\n`;
    cases.forEach((c, i) => {
      const icon = c.status === 'passed' ? '✅' : c.status === 'failed' ? '❌' : '⏭️';
      md += `| ${i + 1} | ${c.name} | ${icon} ${c.status.toUpperCase()} |\n`;
    });
  } else {
    md += `_No test cases were collected — check the run logs above._\n`;
  }
  fs.appendFileSync(ghSummary, md);
}

fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
fs.writeFileSync(jsonOut, JSON.stringify({ suite: title, total, passed, failed, skipped, cases }, null, 2));

console.log(`${title}: ${passed}/${total} passed, ${failed} failed, ${skipped} skipped`);
