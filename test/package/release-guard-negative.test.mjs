import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(projectRoot, 'scripts', 'check-release-build-env.mjs');
const buildScript = path.join(projectRoot, 'build.mjs');

test('release guard rejects the wrong Node or npm toolchain', async () => {
	if (process.version !== 'v24.18.0') {
		const result = run({}, process.env.PATH);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /OPERON_CLI_RELEASE_NODE_VERSION_MISMATCH/u);
		return;
	}
	const fakeBin = await mkdtemp(path.join(tmpdir(), 'operon-cli-fake-npm-'));
	try {
		const executable = path.join(fakeBin, process.platform === 'win32' ? 'npm.cmd' : 'npm');
		await writeFile(executable, process.platform === 'win32' ? '@echo 11.12.0\r\n' : '#!/bin/sh\nprintf \'11.12.0\\n\'\n');
		await chmod(executable, 0o755);
		const result = run({}, `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /OPERON_CLI_RELEASE_NPM_VERSION_MISMATCH:11\.12\.0/u);
	} finally {
		await rm(fakeBin, { recursive: true, force: true });
	}
});

for (const variable of ['OPERON_CLI_FRAME_TIMING_BUILD', 'OPERON_CLI_PERSISTENT_READ_BUILD']) {
	test(`release guard rejects ${variable}`, () => {
		if (process.version !== 'v24.18.0') return;
		const result = run({ [variable]: '1' }, process.env.PATH);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, new RegExp(`OPERON_CLI_RELEASE_BUILD_OVERRIDE_FORBIDDEN:${variable}`, 'u'));
	});
	test(`production build rejects ${variable}`, () => {
		const result = spawnSync(process.execPath, [buildScript], {
			cwd: projectRoot,
			encoding: 'utf8',
			env: { ...process.env, [variable]: '1' },
		});
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, new RegExp(`${variable}_FORBIDDEN`, 'u'));
	});
}

function run(extraEnvironment, pathValue) {
	return spawnSync(process.execPath, [script], {
		cwd: projectRoot,
		encoding: 'utf8',
		env: { ...process.env, ...extraEnvironment, PATH: pathValue },
	});
}
