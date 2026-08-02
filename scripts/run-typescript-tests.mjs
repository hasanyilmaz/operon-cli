import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
		await build({
			entryPoints: [testFile],
			outfile,
			bundle: true,
			platform: 'node',
			format: 'esm',
			target: 'node22',
			define: {
				__OPERON_CLI_PACKAGE_NAME__: JSON.stringify('@stratejya/operon-cli'),
				__OPERON_CLI_VERSION__: JSON.stringify('1.0.8'),
				__OPERON_CLI_PERSISTENT_READ__: 'true',
				__OPERON_CLI_FRAME_TIMING__: 'false',
			},
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
