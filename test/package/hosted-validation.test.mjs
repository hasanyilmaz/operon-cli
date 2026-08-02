import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { EXPECTED_PACKAGE_PATHS_V1 } from '../../scripts/package-archive.mjs';
import { OPERON_CLI_RELEASE_V1 } from '../../scripts/release-identity.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const helper = path.join(projectRoot, 'scripts', 'hosted-validation.mjs');
const workflow = path.join(projectRoot, '.github', 'workflows', 'hosted-validation.yml');

test('hosted workflow passes the fail-closed policy guard', () => {
	assertCommandPassed(['workflow-check']);
	assertCommandPassed(['install-script-check']);
});

test('hosted workflow guard rejects unsafe triggers, permissions, and mutable action refs', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'operon-workflow-negative-'));
	try {
		const baseline = await readFile(workflow, 'utf8');
		for (const [name, mutate] of [
			['trigger.yml', value => `${value}\npull_request_target:\n`],
			['push.yml', value => `${value}\n  push:\n    branches: [main]\n`],
			['pull-request.yml', value => `${value}\n  pull_request:\n    branches: [main]\n`],
			['spaced-trigger.yml', value => value.replace('  workflow_dispatch:', '  pull_request :\n  workflow_dispatch:')],
			['permission.yml', value => value.replace('contents: read', 'contents: write')],
			['quoted-permission.yml', value => value.replace('contents: read', 'contents: read\n  issues: "write"')],
			['write-all.yml', value => value.replace('contents: read', 'write-all')],
			['job-permission.yml', value => value.replace('    runs-on: ubuntu-24.04', '    permissions: { actions: write }\n    runs-on: ubuntu-24.04')],
			['secret.yml', value => `${value}\n# \${{ secrets.NPM_TOKEN }}\n`],
			['action.yml', value => value.replace('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'actions/checkout@v7')],
			['extra-action.yml', value => value.replace('steps:\n', 'steps:\n      - uses: example/action@1111111111111111111111111111111111111111\n')],
			['runner-map.yml', value => value.replace('os: windows-2025', 'os: windows-2022')],
		]) {
			const target = path.join(root, name);
			await writeFile(target, mutate(baseline));
			assertCommandFailed(['workflow-check', target]);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('hosted identity is anchored to the repository, main dispatch, and valid run identifiers', () => {
	const valid = {
		GITHUB_ACTIONS: 'true',
		GITHUB_REPOSITORY: 'hasanyilmaz/operon-cli',
		GITHUB_SHA: 'a'.repeat(40),
		GITHUB_RUN_ID: '123456',
		GITHUB_RUN_ATTEMPT: '1',
		GITHUB_EVENT_NAME: 'workflow_dispatch',
		GITHUB_REF: 'refs/heads/main',
		GITHUB_REF_NAME: 'main',
	};
	assertCommandPassed(['hosted-identity-check'], valid);
	for (const overrides of [
		{ GITHUB_REPOSITORY: 'hasanyilmaz/operon' },
		{ GITHUB_EVENT_NAME: 'push' },
		{ GITHUB_REF: 'refs/heads/feature' },
		{ GITHUB_REF_NAME: 'feature' },
		{ GITHUB_SHA: 'invalid' },
		{ GITHUB_RUN_ID: '0' },
		{ GITHUB_RUN_ATTEMPT: 'invalid' },
	]) assertCommandFailed(['hosted-identity-check'], { ...valid, ...overrides });
});

test('candidate identity is pinned to the accepted Stage 6 release artifact', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'operon-candidate-baseline-'));
	try {
		const accepted = {
			...OPERON_CLI_RELEASE_V1,
			inventory: Array.from({ length: OPERON_CLI_RELEASE_V1.inventoryEntries }, () => ({})),
		};
		const identity = path.join(root, 'identity.json');
		await writeFile(identity, JSON.stringify(accepted));
		assertCommandPassed(['candidate-baseline-check', identity]);
		await writeFile(identity, JSON.stringify({ ...accepted, tarball: { ...accepted.tarball, bytes: accepted.tarball.bytes + 1 } }));
		assertCommandFailed(['candidate-baseline-check', identity]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('bootstrap npm resolves the bundled CLI without invoking a Windows command shim', async () => {
	const windows = spawnSync(process.execPath, [
		helper, 'bootstrap-npm-path', 'win32', String.raw`C:\hostedtoolcache\windows\node\24.18.0\x64\node.exe`,
	], { cwd: projectRoot, encoding: 'utf8' });
	assert.equal(windows.status, 0, windows.stderr);
	assert.equal(
		windows.stdout.trim(),
		String.raw`C:\hostedtoolcache\windows\node\24.18.0\x64\node_modules\npm\bin\npm-cli.js`,
	);
	const posix = spawnSync(process.execPath, [
		helper, 'bootstrap-npm-path', 'linux', '/opt/hostedtoolcache/node/24.18.0/x64/bin/node',
	], { cwd: projectRoot, encoding: 'utf8' });
	assert.equal(posix.status, 0, posix.stderr);
	assert.equal(posix.stdout.trim(), '/opt/hostedtoolcache/node/24.18.0/x64/lib/node_modules/npm/bin/npm-cli.js');

	const root = await mkdtemp(path.join(tmpdir(), 'operon-bootstrap-npm-'));
	try {
		const executable = path.join(root, 'bin', 'node');
		const cli = process.platform === 'win32'
			? path.join(root, 'bin', 'node_modules', 'npm', 'bin', 'npm-cli.js')
			: path.join(root, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
		await mkdir(path.dirname(cli), { recursive: true });
		await writeFile(cli, '# fixture');
		const valid = spawnSync(process.execPath, [
			helper, 'bootstrap-npm-invocation', process.platform, executable, '--version',
		], { cwd: projectRoot, encoding: 'utf8' });
		assert.equal(valid.status, 0, valid.stderr);
		assert.deepEqual(JSON.parse(valid.stdout), {
			executable,
			args: [cli, '--version'],
			shell: false,
		});

		await rm(cli);
		assertCommandFailed(['bootstrap-npm-invocation', process.platform, executable, '--version']);
		await mkdir(cli);
		assertCommandFailed(['bootstrap-npm-invocation', process.platform, executable, '--version']);
		await rm(cli, { recursive: true });
		const target = path.join(root, 'npm-cli-target.js');
		await writeFile(target, '# fixture');
		await symlink(target, cli);
		assertCommandFailed(['bootstrap-npm-invocation', process.platform, executable, '--version']);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('canonical comparison accepts four equal manifests and rejects drift', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'operon-canonical-compare-'));
	try {
		const input = path.join(root, 'input');
		const output = path.join(root, 'output');
		const fixture = createTarballFixture();
		const canonical = {
			package: { name: '@stratejya/operon-cli', version: '1.0.8' },
			tarball: {
				bytes: fixture.tarball.length,
				sha256: digest('sha256', fixture.tarball, 'hex'),
				sha512: digest('sha512', fixture.tarball, 'base64'),
			},
			inventory: fixture.inventory,
		};
		for (const name of ['canonical-ubuntu-24.04', 'canonical-macos-14', 'canonical-windows-2022', 'canonical-windows-2025']) {
			const directory = path.join(input, name);
			await mkdir(directory, { recursive: true });
			await writeFile(path.join(directory, 'operon-cli-1.0.8.tgz'), fixture.tarball);
			await writeFile(path.join(directory, 'artifact-manifest.json'), JSON.stringify({ canonical, evidence: evidenceFor(name) }));
		}
		assertCommandPassed(['compare-candidates', input, output], {
			GITHUB_REPOSITORY: 'inherited/repository',
			GITHUB_SHA: 'b'.repeat(40),
			GITHUB_RUN_ID: '999',
			GITHUB_RUN_ATTEMPT: '7',
			GITHUB_EVENT_NAME: 'workflow_dispatch',
			GITHUB_REF: 'refs/heads/main',
			GITHUB_REF_NAME: 'main',
		});
		const tamperedTarball = path.join(input, 'canonical-windows-2025', 'operon-cli-1.0.8.tgz');
		const tampered = Buffer.from(fixture.tarball);
		tampered[tampered.length - 1] ^= 0xff;
		await writeFile(tamperedTarball, tampered);
		assertCommandFailed(['compare-candidates', input, path.join(root, 'tamper-output')]);
		await writeFile(tamperedTarball, fixture.tarball);
		const drifted = path.join(input, 'canonical-windows-2025', 'artifact-manifest.json');
		await writeFile(drifted, JSON.stringify({ canonical: { ...canonical, tarball: { bytes: 4, sha256: 'def' } }, evidence: evidenceFor('canonical-windows-2025') }));
		assertCommandFailed(['compare-candidates', input, path.join(root, 'drift-output')]);
		await writeFile(drifted, JSON.stringify({ canonical, evidence: evidenceFor('canonical-windows-2025', { runId: 'other-run' }) }));
		assertCommandFailed(['compare-candidates', input, path.join(root, 'cross-run-output')]);
		const legacyWindowsImage = evidenceFor('canonical-windows-2025');
		legacyWindowsImage.runner.imageOs = 'win25';
		await writeFile(drifted, JSON.stringify({ canonical, evidence: legacyWindowsImage }));
		assertCommandFailed(['compare-candidates', input, path.join(root, 'legacy-windows-image-output')]);
		await writeFile(drifted, JSON.stringify({ canonical, evidence: evidenceFor('canonical-windows-2025') }));
		const unexpected = path.join(input, 'canonical-unexpected');
		await mkdir(unexpected, { recursive: true });
		await writeFile(path.join(unexpected, 'operon-cli-1.0.8.tgz'), fixture.tarball);
		await writeFile(path.join(unexpected, 'artifact-manifest.json'), JSON.stringify({ canonical, evidence: evidenceFor('canonical-ubuntu-24.04') }));
		assertCommandFailed(['compare-candidates', input, path.join(root, 'unexpected-output')]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

function assertCommandPassed(args, env = {}) {
	const result = spawnSync(process.execPath, [helper, ...args], {
		cwd: projectRoot,
		encoding: 'utf8',
		env: { ...process.env, GITHUB_ACTIONS: 'false', ...env },
	});
	assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function evidenceFor(name, githubOverrides = {}) {
	const producer = {
		'canonical-ubuntu-24.04': { runnerId: 'ubuntu-24.04', os: 'Linux', imageOs: 'ubuntu24', platform: 'linux' },
		'canonical-macos-14': { runnerId: 'macos-14', os: 'macOS', imageOs: 'macos14', platform: 'darwin' },
		'canonical-windows-2022': { runnerId: 'windows-2022', os: 'Windows', imageOs: 'win22', platform: 'win32' },
		'canonical-windows-2025': { runnerId: 'windows-2025', os: 'Windows', imageOs: 'win25-vs2026', platform: 'win32' },
	}[name];
	assert.ok(producer);
	return {
		runnerId: producer.runnerId,
		github: {
			repository: 'local', sha: 'local', runId: 'local', runAttempt: 'local',
			eventName: 'local', ref: 'local', refName: 'local', ...githubOverrides,
		},
		runner: {
			os: producer.os,
			arch: 'local',
			name: 'local',
			imageOs: producer.imageOs,
			imageVersion: 'local',
			platform: producer.platform,
			processArch: 'local',
		},
		toolchain: { node: 'v24.18.0', npm: '11.12.1' },
	};
}

function createTarballFixture() {
	const blocks = [];
	const inventory = [];
	for (let index = 0; index < EXPECTED_PACKAGE_PATHS_V1.length; index += 1) {
		const entryPath = EXPECTED_PACKAGE_PATHS_V1[index];
		const mode = entryPath === 'package/dist/operon.mjs' ? 0o755 : 0o644;
		const content = Buffer.from(`entry-${index}\n`);
		const header = Buffer.alloc(512);
		header.write(entryPath, 0, 100, 'utf8');
		writeOctal(header, 100, 8, mode);
		writeOctal(header, 108, 8, 0);
		writeOctal(header, 116, 8, 0);
		writeOctal(header, 124, 12, content.length);
		writeOctal(header, 136, 12, 0);
		header.fill(0x20, 148, 156);
		header[156] = '0'.charCodeAt(0);
		header.write('ustar\0', 257, 6, 'ascii');
		writeOctal(header, 148, 8, header.reduce((sum, byte) => sum + byte, 0));
		blocks.push(header, content, Buffer.alloc((512 - content.length % 512) % 512));
		inventory.push({ path: entryPath, mode, size: content.length, sha256: digest('sha256', content, 'hex') });
	}
	blocks.push(Buffer.alloc(1024));
	inventory.sort((left, right) => left.path.localeCompare(right.path, 'en'));
	return { tarball: gzipSync(Buffer.concat(blocks), { mtime: 0 }), inventory };
}

function writeOctal(buffer, offset, length, value) {
	const text = value.toString(8).padStart(length - 1, '0');
	buffer.write(`${text}\0`, offset, length, 'ascii');
}

function digest(algorithm, value, encoding) {
	return createHash(algorithm).update(value).digest(encoding);
}

function assertCommandFailed(args, env = {}) {
	const result = spawnSync(process.execPath, [helper, ...args], {
		cwd: projectRoot,
		encoding: 'utf8',
		env: { ...process.env, GITHUB_ACTIONS: 'false', ...env },
	});
	assert.notEqual(result.status, 0, 'Expected hosted validation command to fail closed.');
}
