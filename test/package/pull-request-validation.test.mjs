import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const helper = path.join(projectRoot, 'scripts', 'pull-request-validation.mjs');
const workflow = path.join(projectRoot, '.github', 'workflows', 'pull-request-validation.yml');

test('public PR workflow passes the fail-closed policy guard', () => {
	assertCommandPassed(['workflow-check']);
});

test('public PR workflow guard rejects unsafe triggers, permissions, artifacts, and mutable actions', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'operon-pr-workflow-negative-'));
	try {
		const baseline = await readFile(workflow, 'utf8');
		for (const [name, mutate] of [
			['dispatch.yml', value => `${value}\n  workflow_dispatch:\n`],
			['target.yml', value => `${value}\n  pull_request_target:\n`],
			['permission.yml', value => value.replace('contents: read', 'contents: write')],
			['id-token.yml', value => value.replace('contents: read', 'contents: read\n  id-token: write')],
			['secret.yml', value => `${value}\n# \${{ secrets.NPM_TOKEN }}\n`],
			['publish.yml', value => `${value}\n# npm publish\n`],
			['artifact.yml', value => value.replace('actions/setup-node@', 'actions/upload-artifact@')],
			['action.yml', value => value.replace('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'actions/checkout@v7')],
			['runner.yml', value => value.replace('os: windows-2022', 'os: windows-latest')],
		]) {
			const target = path.join(root, name);
			await writeFile(target, mutate(baseline));
			assertCommandFailed(['workflow-check', target]);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('public validation identity accepts an exact main push', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'operon-pr-push-'));
	try {
		const sha = 'a'.repeat(40);
		const eventPath = path.join(root, 'push.json');
		await writeFile(eventPath, JSON.stringify({
			ref: 'refs/heads/main',
			after: sha,
			deleted: false,
			repository: { full_name: 'hasanyilmaz/operon-cli' },
		}));
		const valid = hostedEnvironment({
			GITHUB_EVENT_NAME: 'push',
			GITHUB_REF: 'refs/heads/main',
			GITHUB_REF_NAME: 'main',
			GITHUB_SHA: sha,
			GITHUB_EVENT_PATH: eventPath,
		});
		assertCommandPassed(['hosted-identity-check'], valid);
		for (const overrides of [
			{ GITHUB_REPOSITORY: 'hasanyilmaz/operon' },
			{ GITHUB_REF: 'refs/heads/feature' },
			{ GITHUB_REF_NAME: 'feature' },
			{ GITHUB_SHA: 'invalid' },
			{ GITHUB_RUN_ID: '0' },
		]) assertCommandFailed(['hosted-identity-check'], { ...valid, ...overrides });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('public validation identity accepts an exact pull request merge ref and rejects event drift', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'operon-pr-event-'));
	try {
		const sha = 'b'.repeat(40);
		const baseSha = 'c'.repeat(40);
		const headSha = 'd'.repeat(40);
		const eventPath = path.join(root, 'pull-request.json');
		await writeFile(eventPath, JSON.stringify({
			number: 42,
			repository: { full_name: 'hasanyilmaz/operon-cli' },
			pull_request: {
				merge_commit_sha: null,
				base: { ref: 'main', sha: baseSha, repo: { full_name: 'hasanyilmaz/operon-cli' } },
				head: { ref: 'contributor/change', sha: headSha, repo: { full_name: 'contributor/operon-cli' } },
			},
		}));
		const valid = hostedEnvironment({
			GITHUB_EVENT_NAME: 'pull_request',
			GITHUB_REF: 'refs/pull/42/merge',
			GITHUB_REF_NAME: '42/merge',
			GITHUB_BASE_REF: 'main',
			GITHUB_HEAD_REF: 'contributor/change',
			GITHUB_SHA: sha,
			GITHUB_EVENT_PATH: eventPath,
		});
		assertCommandPassed(['hosted-identity-check'], valid);
		const exactMergeEvent = JSON.parse(await readFile(eventPath, 'utf8'));
		exactMergeEvent.pull_request.merge_commit_sha = sha;
		await writeFile(eventPath, JSON.stringify(exactMergeEvent));
		assertCommandPassed(['hosted-identity-check'], valid);
		exactMergeEvent.pull_request.merge_commit_sha = null;
		await writeFile(eventPath, JSON.stringify(exactMergeEvent));
		for (const overrides of [
			{ GITHUB_EVENT_NAME: 'pull_request_target' },
			{ GITHUB_REF: 'refs/pull/41/merge' },
			{ GITHUB_REF_NAME: '41/merge' },
			{ GITHUB_BASE_REF: 'develop' },
			{ GITHUB_HEAD_REF: ' ' },
		]) assertCommandFailed(['hosted-identity-check'], { ...valid, ...overrides });

		const symlinkPath = path.join(root, 'event-link.json');
		await symlink(eventPath, symlinkPath);
		assertCommandFailed(['hosted-identity-check'], { ...valid, GITHUB_EVENT_PATH: symlinkPath });

		const driftedEventPath = path.join(root, 'pull-request-drift.json');
		await writeFile(driftedEventPath, JSON.stringify({
			number: 42,
			repository: { full_name: 'hasanyilmaz/operon-cli' },
			pull_request: {
				merge_commit_sha: 'e'.repeat(40),
				base: { ref: 'main', sha: baseSha, repo: { full_name: 'hasanyilmaz/operon-cli' } },
				head: { ref: 'wrong-ref', sha: headSha, repo: { full_name: 'contributor/operon-cli' } },
			},
		}));
		assertCommandFailed(['hosted-identity-check'], { ...valid, GITHUB_EVENT_PATH: driftedEventPath });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

function hostedEnvironment(overrides) {
	return {
		GITHUB_ACTIONS: 'true',
		GITHUB_REPOSITORY: 'hasanyilmaz/operon-cli',
		GITHUB_RUN_ID: '123456',
		GITHUB_RUN_ATTEMPT: '1',
		GITHUB_BASE_REF: 'unused',
		GITHUB_HEAD_REF: 'unused',
		...overrides,
	};
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
	assert.notEqual(result.status, 0, 'Expected public PR validation command to fail closed.');
}
