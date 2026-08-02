import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createChildEnvironmentWithPathV1 } from '../../scripts/child-process-environment.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(projectRoot, 'scripts', 'check-release-build-env.mjs');
const buildScript = path.join(projectRoot, 'build.mjs');

test('release guard rejects the wrong Node toolchain', { skip: process.version === 'v24.18.0' }, () => {
	const result = run();
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /OPERON_CLI_RELEASE_NODE_VERSION_MISMATCH/u);
});

test('release guard accepts a validated npm exec path with the exact version', {
	skip: process.version !== 'v24.18.0',
}, async () => {
	const fakeRoot = await mkdtemp(path.join(tmpdir(), 'operon-cli-fake-npm-'));
	try {
		const executable = await writeFakeNpm(fakeRoot, 'process.stdout.write("11.12.1\\n");\n');
		const result = run({ npm_execpath: executable });
		assert.equal(result.status, 0, result.stderr);
	} finally {
		await rm(fakeRoot, { recursive: true, force: true });
	}
});

test('release guard rejects the wrong npm version', {
	skip: process.version !== 'v24.18.0',
}, async () => {
	const fakeRoot = await mkdtemp(path.join(tmpdir(), 'operon-cli-fake-npm-'));
	try {
		const executable = await writeFakeNpm(fakeRoot, 'process.stdout.write("11.12.0\\n");\n');
		const result = run({ npm_execpath: executable });
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /OPERON_CLI_RELEASE_NPM_VERSION_MISMATCH:11\.12\.0/u);
	} finally {
		await rm(fakeRoot, { recursive: true, force: true });
	}
});

test('release guard rejects missing, relative, and nonexistent npm exec paths', {
	skip: process.version !== 'v24.18.0',
}, () => {
	for (const environment of [
		{ unset: ['npm_execpath'] },
		{ npm_execpath: 'relative/npm-cli.js' },
		{ npm_execpath: path.join(tmpdir(), 'operon-cli-missing-npm-cli.js') },
	]) {
		const result = run(environment, environment.unset ?? []);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /OPERON_CLI_RELEASE_NPM_EXECPATH_INVALID/u);
	}
});

test('release guard rejects a failing npm CLI', {
	skip: process.version !== 'v24.18.0',
}, async () => {
	const fakeRoot = await mkdtemp(path.join(tmpdir(), 'operon-cli-fake-npm-'));
	try {
		const executable = await writeFakeNpm(fakeRoot, 'process.exitCode = 9;\n');
		const result = run({ npm_execpath: executable });
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /OPERON_CLI_RELEASE_NPM_EXEC_FAILED/u);
	} finally {
		await rm(fakeRoot, { recursive: true, force: true });
	}
});

test('release guard rejects a symlinked npm exec path', {
	skip: process.platform === 'win32' || process.version !== 'v24.18.0',
}, async () => {
	const fakeRoot = await mkdtemp(path.join(tmpdir(), 'operon-cli-fake-npm-'));
	try {
		const executable = await writeFakeNpm(fakeRoot, 'process.stdout.write("11.12.1\\n");\n');
		const link = path.join(fakeRoot, 'linked-npm-cli.js');
		await symlink(executable, link);
		const result = run({ npm_execpath: link });
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /OPERON_CLI_RELEASE_NPM_EXECPATH_INVALID/u);
	} finally {
		await rm(fakeRoot, { recursive: true, force: true });
	}
});

for (const variable of ['OPERON_CLI_FRAME_TIMING_BUILD', 'OPERON_CLI_PERSISTENT_READ_BUILD']) {
	test(`release guard rejects ${variable}`, {
		skip: process.version !== 'v24.18.0',
	}, async () => {
		const fakeRoot = await mkdtemp(path.join(tmpdir(), 'operon-cli-fake-npm-'));
		try {
			const executable = await writeFakeNpm(fakeRoot, 'process.stdout.write("11.12.1\\n");\n');
			const result = run({ [variable]: '1', npm_execpath: executable });
			assert.notEqual(result.status, 0);
			assert.match(result.stderr, new RegExp(`OPERON_CLI_RELEASE_BUILD_OVERRIDE_FORBIDDEN:${variable}`, 'u'));
		} finally {
			await rm(fakeRoot, { recursive: true, force: true });
		}
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

function run(extraEnvironment = {}, unset = []) {
	const environment = { ...process.env, ...extraEnvironment };
	delete environment.unset;
	for (const key of unset) delete environment[key];
	const pathValue = Object.entries(environment)
		.find(([key]) => key.toLocaleLowerCase('en-US') === 'path')?.[1] ?? '';
	return spawnSync(process.execPath, [script], {
		cwd: projectRoot,
		encoding: 'utf8',
		env: createChildEnvironmentWithPathV1(environment, pathValue),
	});
}

async function writeFakeNpm(root, source) {
	const executable = path.join(root, 'npm-cli.js');
	await writeFile(executable, source);
	return executable;
}
