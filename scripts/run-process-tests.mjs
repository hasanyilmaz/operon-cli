import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, lstat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = path.join(projectRoot, 'dist', 'operon.mjs');

if (process.platform !== 'win32') {
	const python = spawnSync('python3', ['--version'], { encoding: 'utf8', shell: false });
	const versionText = `${python.stdout ?? ''}${python.stderr ?? ''}`.trim();
	if (python.error || python.status !== 0 || !/^Python 3\.(?:[9]|[1-9][0-9])(?:\.|$)/u.test(versionText)) {
		throw new Error(`OPERON_CLI_PYTHON3_REQUIRED:${versionText || python.error?.message || 'unavailable'}`);
	}
}

execFileSync(process.execPath, [path.join(projectRoot, 'build.mjs')], {
	cwd: projectRoot,
	stdio: 'inherit',
});
const executableStat = await lstat(executable);
assert.equal(executableStat.isFile(), true, 'Built CLI executable must be a regular file.');
assert.equal(executableStat.isSymbolicLink(), false, 'Built CLI executable must not be a symlink.');

execFileSync(process.execPath, [path.join(projectRoot, 'test/process/interruption.test.mjs')], {
	cwd: projectRoot,
	stdio: 'inherit',
});

if (process.platform === 'win32') {
	const version = spawnSync(process.execPath, [executable, 'version', '--json'], {
		cwd: projectRoot,
		encoding: 'utf8',
		shell: false,
		windowsHide: true,
	});
	assert.equal(version.error, undefined);
	assert.equal(version.status, 0, version.stderr);
	assert.equal(JSON.parse(version.stdout).ok, true);
	const nonInteractive = spawnSync(process.execPath, [executable, 'task', 'create'], {
		cwd: projectRoot,
		encoding: 'utf8',
		shell: false,
		windowsHide: true,
	});
	assert.equal(nonInteractive.error, undefined);
	assert.equal(nonInteractive.status, 2, nonInteractive.stderr);
	assert.match(nonInteractive.stderr, /interactive terminal/u);
	console.log('Windows process acceptance passed.');
	process.exit(0);
}

const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'operon-cli-pty-responder-'));
try {
	const responder = path.join(temporaryRoot, 'phase7-pty-responder.mjs');
	await build({
		entryPoints: [path.join(projectRoot, 'test/pty/phase7-pty-responder.ts')],
		outfile: responder,
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		logLevel: 'silent',
		banner: { js: '#!/usr/bin/env node' },
		define: {
			__OPERON_CLI_PACKAGE_NAME__: JSON.stringify('@stratejya/operon-cli'),
			__OPERON_CLI_VERSION__: JSON.stringify('1.0.9'),
			__OPERON_CLI_PERSISTENT_READ__: 'true',
			__OPERON_CLI_FRAME_TIMING__: 'false',
		},
	});
	await chmod(responder, 0o755);
	for (const [testName, extraArguments] of [
		['guided-source-transitions-pty.test.py', [responder]],
		['interactive-shell-pty.test.py', []],
		['guided-setup-pty.test.py', []],
	]) {
		execFileSync('python3', [path.join(projectRoot, 'test/pty', testName), executable, ...extraArguments], {
			cwd: projectRoot,
			stdio: 'inherit',
		});
	}
} finally {
	await rm(temporaryRoot, { recursive: true, force: true });
}
