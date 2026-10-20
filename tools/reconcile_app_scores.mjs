// Evaluate the app's ten-factor engine on a saved performance_source_context response.
// Used by tools/reconcile_sheet_scores.py. It runs exactly what loadPerformance does after
// its RPC (parsePerformanceSources + resolvePerformance from the scoring module's public
// client API), loaded through Vite so the '@/' alias resolves as in the app and tests.
//
//   node tools/reconcile_app_scores.mjs SOURCES.json OUT.json
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [sourcesPath, outPath] = process.argv.slice(2);
if (!sourcesPath || !outPath) {
  console.error('usage: node tools/reconcile_app_scores.mjs SOURCES.json OUT.json');
  process.exit(2);
}
const { module: scoring } = await runnerImport(resolve(root, 'modules/scoring/client.ts'), {
  configFile: false, root, logLevel: 'error', resolve: { alias: { '@': root } },
});
const sources = scoring.parsePerformanceSources(JSON.parse(readFileSync(sourcesPath, 'utf8')));
const calculation = scoring.resolvePerformance(sources);
writeFileSync(outPath, JSON.stringify({ ruleVersion: scoring.PERFORMANCE_RULE_VERSION, sources, calculation }, null, 1));
