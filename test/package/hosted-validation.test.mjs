import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { EXPECTED_PACKAGE_PATHS_V1 } from '../../scripts/package-archive.mjs';

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
			['permission.yml', value => value.replace('contents: read', 'contents: write')],
			['write-all.yml', value => value.replace('contents: read', 'write-all')],
			['job-permission.yml', value => value.replace('    runs-on: ubuntu-24.04', '    permissions: { actions: write }\n    runs-on: ubuntu-24.04')],
			['secret.yml', value => `${value}\n# \${{ secrets.NPM_TOKEN }}\n`],
			['action.yml', value => value.replace('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'actions/checkout@v7')],
			['extra-action.yml', value => value.replace('steps:\n', 'steps:\n      - uses: example/action@1111111111111111111111111111111111111111\n')],
		]) {
			const target = path.join(root, name);
			await writeFile(target, mutate(baseline));
			assertCommandFailed(['workflow-check', target]);
		}
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
			await writeFile(path.join(directory, 'artifact-manifest.json'), JSON.stringify({ canonical, evidence: { runnerId: name } }));
		}
		assertCommandPassed(['compare-candidates', input, output]);
		const tamperedTarball = path.join(input, 'canonical-windows-2025', 'operon-cli-1.0.8.tgz');
		const tampered = Buffer.from(fixture.tarball);
		tampered[tampered.length - 1] ^= 0xff;
		await writeFile(tamperedTarball, tampered);
		assertCommandFailed(['compare-candidates', input, path.join(root, 'tamper-output')]);
		await writeFile(tamperedTarball, fixture.tarball);
		const drifted = path.join(input, 'canonical-windows-2025', 'artifact-manifest.json');
		await writeFile(drifted, JSON.stringify({ canonical: { ...canonical, tarball: { bytes: 4, sha256: 'def' } }, evidence: {} }));
		assertCommandFailed(['compare-candidates', input, path.join(root, 'drift-output')]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

function assertCommandPassed(args) {
	const result = spawnSync(process.execPath, [helper, ...args], { cwd: projectRoot, encoding: 'utf8' });
	assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
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

function assertCommandFailed(args) {
	const result = spawnSync(process.execPath, [helper, ...args], { cwd: projectRoot, encoding: 'utf8' });
	assert.notEqual(result.status, 0, 'Expected hosted validation command to fail closed.');
}
