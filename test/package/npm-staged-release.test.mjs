import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { artifactCheckV1 } from '../../scripts/npm-staged-release.mjs';
import { EXPECTED_PACKAGE_PATHS_V1 } from '../../scripts/package-archive.mjs';
import { OPERON_CLI_RELEASE_V1, OPERON_CLI_RELEASE_WORKFLOW_V1 } from '../../scripts/release-identity.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const helper = path.join(projectRoot, 'scripts', 'npm-staged-release.mjs');
const workflow = path.join(projectRoot, '.github', 'workflows', 'npm-staged-release.yml');
const commit = 'a'.repeat(40);
const runId = '30760235493';
const manifestSha = 'b'.repeat(64);

test('npm staged release workflow passes its fail-closed policy guard', () => {
	assertCommandPassed(['workflow-check']);
});

test('npm staged release workflow rejects unsafe triggers, permissions, commands, and action drift', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'operon-npm-release-workflow-'));
	try {
		const baseline = await readFile(workflow, 'utf8');
		for (const [name, mutate] of [
			['push.yml', value => `${value}\n  push:\n    tags: ['*']\n`],
			['input-in-run.yml', value => value.replace('node scripts/npm-staged-release.mjs workflow-check', 'echo "${{ inputs.confirmation }}"\n          node scripts/npm-staged-release.mjs workflow-check')],
			['target.yml', value => `${value}\n  pull_request_target:\n`],
			['secret.yml', value => `${value}\n# \${{ secrets.NPM_TOKEN }}\n`],
			['token.yml', value => `${value}\n# NODE_AUTH_TOKEN: token\n`],
			['direct-publish.yml', value => `${value}\n# npm publish\n`],
			['repack.yml', value => `${value}\n# npm pack\n`],
			['extra-id-token.yml', value => value.replace('contents: read\n    steps:', 'contents: read\n      id-token: write\n    steps:')],
			['environment.yml', value => value.replace('environment: npm-staging', 'environment: production')],
			['action.yml', value => value.replace('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'actions/checkout@v7')],
		]) {
			const target = path.join(root, name);
			await writeFile(target, mutate(baseline));
			assertCommandFailed(['workflow-check', target]);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('release identity accepts exact inputs locally and rejects every locked field drift', () => {
	const args = [
		'identity-check', commit, runId, OPERON_CLI_RELEASE_V1.tarball.sha256,
		manifestSha, OPERON_CLI_RELEASE_WORKFLOW_V1.confirmation,
	];
	assertCommandPassed(args);
	for (const [index, value] of [
		[1, 'short'],
		[2, '0'],
		[3, 'c'.repeat(64)],
		[4, 'short'],
		[5, 'STAGE SOMETHING ELSE'],
	]) {
		const drifted = [...args];
		drifted[index] = value;
		assertCommandFailed(drifted);
	}
});

test('hosted release identity requires the exact repository, tag, event, and commit', () => {
	const args = [
		'identity-check', commit, runId, OPERON_CLI_RELEASE_V1.tarball.sha256,
		manifestSha, OPERON_CLI_RELEASE_WORKFLOW_V1.confirmation,
	];
	const valid = {
		GITHUB_ACTIONS: 'true',
		GITHUB_REPOSITORY: OPERON_CLI_RELEASE_WORKFLOW_V1.repository,
		GITHUB_EVENT_NAME: 'workflow_dispatch',
		GITHUB_REF: `refs/tags/${OPERON_CLI_RELEASE_WORKFLOW_V1.tag}`,
		GITHUB_REF_NAME: OPERON_CLI_RELEASE_WORKFLOW_V1.tag,
		GITHUB_SHA: commit,
	};
	assertCommandPassed(args, valid);
	for (const overrides of [
		{ GITHUB_REPOSITORY: 'hasanyilmaz/operon' },
		{ GITHUB_EVENT_NAME: 'push' },
		{ GITHUB_REF: 'refs/heads/main' },
		{ GITHUB_REF_NAME: 'main' },
		{ GITHUB_SHA: 'c'.repeat(40) },
	]) assertCommandFailed(args, { ...valid, ...overrides });
});

test('accepted hosted run metadata is bound to main, exact SHA, workflow, and success', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'operon-npm-release-run-'));
	try {
		const target = path.join(root, 'run.json');
		const valid = {
			id: Number(runId),
			repository: { full_name: OPERON_CLI_RELEASE_WORKFLOW_V1.repository },
			path: OPERON_CLI_RELEASE_WORKFLOW_V1.hostedWorkflowPath,
			event: 'workflow_dispatch',
			head_branch: 'main',
			head_sha: commit,
			status: 'completed',
			conclusion: 'success',
			run_attempt: 1,
		};
		await writeFile(target, JSON.stringify(valid));
		assertCommandPassed(['run-check', target, commit, runId]);
		for (const [field, value] of [
			['id', 1], ['path', '.github/workflows/other.yml'], ['event', 'push'],
			['head_branch', 'feature'], ['head_sha', 'c'.repeat(40)], ['status', 'queued'],
			['conclusion', 'failure'], ['run_attempt', 0],
		]) {
			await writeFile(target, JSON.stringify({ ...valid, [field]: value }));
			assertCommandFailed(['run-check', target, commit, runId]);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('accepted hosted jobs require 17 successful jobs and one exact gate', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'operon-npm-release-jobs-'));
	try {
		const target = path.join(root, 'jobs.json');
		const jobs = Array.from({ length: 17 }, (_, index) => ({
			name: index === 16 ? 'Hosted validation gate' : `Job ${index + 1}`,
			status: 'completed',
			conclusion: 'success',
		}));
		await writeFile(target, JSON.stringify({ total_count: 17, jobs }));
		assertCommandPassed(['jobs-check', target]);
		await writeFile(target, JSON.stringify({ total_count: 17, jobs: jobs.map((job, index) => index === 0 ? { ...job, conclusion: 'failure' } : job) }));
		assertCommandFailed(['jobs-check', target]);
		await writeFile(target, JSON.stringify({ total_count: 16, jobs: jobs.slice(1) }));
		assertCommandFailed(['jobs-check', target]);
		await writeFile(target, JSON.stringify({ total_count: 17, jobs: jobs.map(job => ({ ...job, name: job.name === 'Hosted validation gate' ? 'Wrong gate' : job.name })) }));
		assertCommandFailed(['jobs-check', target]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('release artifact gate accepts exact evidence and rejects inventory, mode, metadata, and evidence drift', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'operon-npm-release-artifact-'));
	try {
		const fixture = createReleaseArtifactFixture();
		await writeReleaseArtifact(root, fixture);
		await assertArtifactPassed(root, fixture);

		await unlink(path.join(root, 'determinism-report.json'));
		await assert.rejects(assertArtifactPassed(root, fixture));
		await writeReleaseArtifact(root, fixture);

		const evidenceDrift = {
			...fixture,
			manifest: {
				...fixture.manifest,
				evidence: releaseEvidence({ sha: 'c'.repeat(40) }),
			},
		};
		await writeReleaseArtifact(root, evidenceDrift);
		await assert.rejects(assertArtifactPassed(root, evidenceDrift));

		const wrongMode = createReleaseArtifactFixture({ executableMode: 0o644 });
		await writeReleaseArtifact(root, wrongMode);
		await assert.rejects(assertArtifactPassed(root, wrongMode));

		const wrongPackage = createReleaseArtifactFixture({ packageName: '@attacker/operon-cli' });
		await writeReleaseArtifact(root, wrongPackage);
		await assert.rejects(assertArtifactPassed(root, wrongPackage));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

async function assertArtifactPassed(root, fixture) {
	const manifestSha = digest('sha256', Buffer.from(`${JSON.stringify(fixture.manifest, null, 2)}\n`), 'hex');
	return artifactCheckV1(
		root,
		fixture.identity.tarball.sha256,
		manifestSha,
		commit,
		runId,
		fixture.identity,
	);
}

async function writeReleaseArtifact(root, fixture) {
	await rm(root, { recursive: true, force: true });
	await mkdir(root, { recursive: true });
	await writeFile(path.join(root, 'operon-cli-1.1.0.tgz'), fixture.tarball);
	await writeFile(path.join(root, 'artifact-manifest.json'), `${JSON.stringify(fixture.manifest, null, 2)}\n`);
	await writeFile(path.join(root, 'determinism-report.json'), `${JSON.stringify(fixture.report, null, 2)}\n`);
}

function createReleaseArtifactFixture(options = {}) {
	const blocks = [];
	for (let index = 0; index < EXPECTED_PACKAGE_PATHS_V1.length; index += 1) {
		const entryPath = EXPECTED_PACKAGE_PATHS_V1[index];
		const mode = entryPath === 'package/dist/operon.mjs' ? (options.executableMode ?? 0o755) : 0o644;
		const content = entryPath === 'package/package.json'
			? Buffer.from(`${JSON.stringify({
				name: options.packageName ?? '@stratejya/operon-cli',
				version: '1.1.0',
				repository: { url: 'git+https://github.com/hasanyilmaz/operon-cli.git' },
				publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/', provenance: true },
			})}\n`)
			: Buffer.from(`release-entry-${index}\n`);
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
	}
	blocks.push(Buffer.alloc(1024));
	const tarball = gzipSync(Buffer.concat(blocks), { mtime: 0 });
	const inventory = inspectFixtureEntries(blocks);
	const entryIdentity = target => {
		const entry = inventory.find(candidate => candidate.path === target);
		assert.ok(entry);
		return { bytes: entry.size, sha256: entry.sha256, mode: entry.mode };
	};
	const aggregate = prefix => digest('sha256', Buffer.from(JSON.stringify(inventory.filter(entry => entry.path.startsWith(prefix)))), 'hex');
	const identity = {
		package: { name: '@stratejya/operon-cli', version: '1.1.0' },
		registry: 'https://registry.npmjs.org/',
		tarball: {
			bytes: tarball.length,
			sha256: digest('sha256', tarball, 'hex'),
			sha512: digest('sha512', tarball, 'base64'),
		},
		inventoryEntries: inventory.length,
		executable: entryIdentity('package/dist/operon.mjs'),
		manifest: entryIdentity('package/cli-manifest-v1.json'),
		schemas: aggregate('package/schemas/v1/'),
		declarations: aggregate('package/types/'),
	};
	const canonical = { ...identity, inventory };
	const manifest = { canonical, evidence: releaseEvidence() };
	const report = {
		status: 'passed',
		canonical,
		candidates: Array.from({ length: 4 }, () => releaseEvidence()),
	};
	return { tarball, identity, manifest, report };
}

function inspectFixtureEntries(blocks) {
	const entries = [];
	for (let index = 0; index < EXPECTED_PACKAGE_PATHS_V1.length; index += 1) {
		const header = blocks[index * 3];
		const content = blocks[index * 3 + 1];
		const entryPath = EXPECTED_PACKAGE_PATHS_V1[index];
		entries.push({
			path: entryPath,
			mode: Number.parseInt(header.subarray(100, 107).toString('ascii'), 8),
			size: content.length,
			sha256: digest('sha256', content, 'hex'),
		});
	}
	return entries.sort((left, right) => left.path.localeCompare(right.path, 'en'));
}

function releaseEvidence(githubOverrides = {}) {
	return {
		runnerId: 'ubuntu-24.04',
		github: {
			repository: 'hasanyilmaz/operon-cli',
			sha: commit,
			runId,
			eventName: 'workflow_dispatch',
			ref: 'refs/heads/main',
			refName: 'main',
			...githubOverrides,
		},
		runner: { os: 'Linux' },
		toolchain: { node: 'v24.18.0', npm: '11.12.1' },
	};
}

function writeOctal(buffer, offset, length, value) {
	const text = value.toString(8).padStart(length - 1, '0');
	buffer.write(`${text}\0`, offset, length, 'ascii');
}

function digest(algorithm, value, encoding) {
	return createHash(algorithm).update(value).digest(encoding);
}

function assertCommandPassed(args, env = {}) {
	const result = spawnSync(process.execPath, [helper, ...args], {
		cwd: projectRoot,
		encoding: 'utf8',
		env: { ...process.env, GITHUB_ACTIONS: 'false', ...env },
	});
	assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function assertCommandFailed(args, env = {}) {
	const result = spawnSync(process.execPath, [helper, ...args], {
		cwd: projectRoot,
		encoding: 'utf8',
		env: { ...process.env, GITHUB_ACTIONS: 'false', ...env },
	});
	assert.notEqual(result.status, 0, 'Expected npm staged release helper to fail closed.');
}
