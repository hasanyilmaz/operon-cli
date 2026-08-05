import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASYNC_TEST_PROMISE_GLOBALS = new Map([
	['client-core.test.ts', '__operonAgentRuntimeCliTestRun'],
	['guided-maintenance-command.test.ts', '__operonGuidedMaintenanceCommandTestRun'],
]);
const directories = process.argv.slice(2);
if (directories.length === 0) throw new Error('No test directories provided.');
const testFiles = [];
for (const directory of directories) {
	await walk(path.resolve(projectRoot, directory));
}
testFiles.sort();
if (testFiles.length === 0) throw new Error('No TypeScript tests found.');
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'operon-cli-tests-'));
try {
	for (let index = 0; index < testFiles.length; index += 1) {
		const testFile = testFiles[index];
		const outfile = path.join(temporaryRoot, `${index}.mjs`);
		const asyncTestPromiseGlobal = ASYNC_TEST_PROMISE_GLOBALS.get(path.basename(testFile));
		const define = {
			__OPERON_CLI_PACKAGE_NAME__: JSON.stringify('@stratejya/operon-cli'),
			__OPERON_CLI_VERSION__: JSON.stringify('1.0.9'),
			__OPERON_CLI_PERSISTENT_READ__: 'true',
			__OPERON_CLI_FRAME_TIMING__: 'false',
		};
		if (path.basename(testFile) === 'phase9-client.test.ts') {
			const workerBuild = await build({
				entryPoints: [path.join(projectRoot, 'test/fixtures/plan-store-capacity-worker.ts')],
				bundle: true,
				platform: 'node',
				format: 'esm',
				target: 'node22',
				logLevel: 'silent',
				write: false,
			});
			define.__OPERON_PLAN_STORE_CAPACITY_WORKER_SOURCE__ = JSON.stringify(
				workerBuild.outputFiles[0].text,
			);
		}
		await build({
			entryPoints: [testFile],
			outfile,
			bundle: true,
			platform: 'node',
			format: 'esm',
			target: 'node22',
			define,
			...(path.basename(testFile) === 'guided-maintenance-command.test.ts'
				? {
					plugins: [{
						name: 'guided-maintenance-portable-storage',
						setup(buildContext) {
							buildContext.onResolve(
								{ filter: /^\.\/secure-storage$/ },
								() => ({
									path: path.join(projectRoot, 'test/fixtures/portable-storage.ts'),
								}),
							);
						},
					}],
				}
				: {}),
			...(asyncTestPromiseGlobal
				? {
					footer: {
						js: `await globalThis.${asyncTestPromiseGlobal}; delete globalThis.${asyncTestPromiseGlobal};`,
					},
				}
				: {}),
			logLevel: 'silent',
		});
		const result = spawnSync(process.execPath, [outfile], {
			cwd: projectRoot,
			encoding: 'utf8',
			env: { ...process.env, NO_COLOR: '1' },
		});
		if (result.status !== 0) {
			throw new Error(`OPERON_CLI_TEST_FAILED:${path.relative(projectRoot, testFile)}\n${result.stdout}\n${result.stderr}`);
		}
		process.stdout.write(result.stdout);
	}
	const requestedDirectories = new Set(directories.map(directory => path.normalize(directory)));
	if (
		requestedDirectories.has(path.normalize('test/unit'))
		&& requestedDirectories.has(path.normalize('test/transport'))
	) {
		const processTests = spawnSync(process.execPath, [path.join(projectRoot, 'scripts/run-process-tests.mjs')], {
			cwd: projectRoot,
			encoding: 'utf8',
			env: { ...process.env, NO_COLOR: '1' },
		});
		if (processTests.status !== 0) {
			throw new Error(`OPERON_CLI_PROCESS_TEST_FAILED\n${processTests.stdout}\n${processTests.stderr}`);
		}
		process.stdout.write(processTests.stdout);
	}
	console.log(JSON.stringify({ status: 'passed', files: testFiles.length }));
} finally {
	await rm(temporaryRoot, { recursive: true, force: true });
}

async function walk(directory) {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) await walk(absolute);
		else if (entry.isFile() && entry.name.endsWith('.test.ts')) testFiles.push(absolute);
	}
}
