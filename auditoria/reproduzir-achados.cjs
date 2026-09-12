// Current regression runner. The original findings are recorded in AUDITORIA_PROJETO.md.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const build = spawnSync(process.execPath, [require.resolve('../backend/node_modules/typescript/bin/tsc')], { cwd: path.join(__dirname, '../backend'), stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);
const tests = spawnSync(process.execPath, ['--test', 'tests/*.test.cjs'], { cwd: path.join(__dirname, '../backend'), stdio: 'inherit' });
process.exit(tests.status || 0);
