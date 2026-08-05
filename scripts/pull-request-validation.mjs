import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChildEnvironmentWithPathV1 } from './child-process-environment.mjs';
import {
	assertOperonPackageInventoryV1,
	normalizeOperonPackageTarballV1,
} from './package-archive.mjs';
import { OPERON_CLI_RELEASE_V1 } from './release-identity.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_WORKFLOW_SHA256 = '858c73d18e4cf5285845d4e1620e9552b831fa48831a00c38636a397eacdb9af';

const [command, ...args] = process.argv.slice(2);
switch (command) {
	case 'workflow-check': await workflowCheck(args[0]); break;
	case 'hosted-identity-check': await hostedIdentityCheck(); break;
	case 'candidate-test': await candidateTest(requiredPath(args[0]), requiredPath(args[1])); break;
	default: throw new Error(`OPERON_CLI_PR_COMMAND_INVALID:${command ?? ''}`);
}

async function workflowCheck(workflowPath = path.join(projectRoot, '.github', 'workflows', 'pull-request-validation.yml')) {
	const document = await readFile(workflowPath, 'utf8');
	assert.equal(
		createHash('sha256').update(document).digest('hex'),
		PUBLIC_WORKFLOW_SHA256,
		'OPERON_CLI_PR_WORKFLOW_DIGEST_MISMATCH',
	);
	assert.equal(document.match(/^\s*permissions\s*:/gmu)?.length, 1, 'OPERON_CLI_PR_PERMISSION_BLOCK_MISMATCH');
	for (const requiredText of [
		'permissions:\n  contents: read',
		'push:\n    branches: [main]',
		'pull_request:\n    branches: [main]',
		'persist-credentials: false',
		'fail-fast: false',
		'max-parallel: 3',
		'node-version: 24.18.0',
		'ubuntu-24.04',
		'macos-14',
		'windows-2022',
		'pr-validation-gate:',
		'name: PR validation gate',
		'node scripts/pull-request-validation.mjs hosted-identity-check',
		'node scripts/hosted-validation.mjs install-script-check',
		'node scripts/hosted-validation.mjs run-npm',
		'node scripts/pull-request-validation.mjs candidate-test',
		'run validate:windows:pair',
		'OPERON_PLUGIN_CANDIDATE_SHA: 38783509900ba720a2c3f0572adc8ab27b9c8c01',
		"github.event.pull_request.head.sha",
		"github.event_name == 'pull_request'",
		"github.event_name == 'push'",
		'node scripts/run-typescript-tests.mjs test/hosted',
		'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
		'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
	]) assert.ok(document.includes(requiredText), `OPERON_CLI_PR_WORKFLOW_REQUIRED_TEXT_MISSING:${requiredText}`);
	for (const forbidden of [
		'workflow_dispatch:', 'pull_request_target', 'workflow_run:', 'schedule:', 'release:',
		'id-token:', 'packages: write', 'contents: write', 'write-all', 'read-all', 'secrets.',
		'npm publish', 'npm stage', 'npm dist-tag', 'provenance', 'NODE_AUTH_TOKEN:', 'NPM_TOKEN:',
		'actions/cache@', 'actions/upload-artifact@', 'actions/download-artifact@', 'create-candidate',
	]) assert.equal(document.includes(forbidden), false, `OPERON_CLI_PR_WORKFLOW_FORBIDDEN_TEXT:${forbidden}`);
	assert.doesNotMatch(document, /^\s+[A-Za-z-]+:\s+write\s*$/gmu, 'OPERON_CLI_PR_WRITE_PERMISSION_FORBIDDEN');
	const allowedActions = new Set([
		'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
		'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
	]);
	for (const match of document.matchAll(/uses:\s+([^\s#]+)/gu)) {
		assert.match(match[1] ?? '', /^[^@\s]+@[0-9a-f]{40}$/u, 'OPERON_CLI_PR_WORKFLOW_ACTION_NOT_PINNED');
		assert.equal(allowedActions.has(match[1] ?? ''), true, `OPERON_CLI_PR_WORKFLOW_ACTION_NOT_ALLOWED:${match[1] ?? ''}`);
	}
	console.log(JSON.stringify({ status: 'passed', workflow: path.basename(workflowPath) }));
}

async function hostedIdentityCheck() {
	if (process.env.GITHUB_ACTIONS !== 'true') {
		console.log(JSON.stringify({ status: 'passed', event: 'local' }));
		return;
	}
	const repository = hostedEnvironment('GITHUB_REPOSITORY');
	const sha = hostedEnvironment('GITHUB_SHA');
	const runId = hostedEnvironment('GITHUB_RUN_ID');
	const runAttempt = hostedEnvironment('GITHUB_RUN_ATTEMPT');
	const eventName = hostedEnvironment('GITHUB_EVENT_NAME');
	const ref = hostedEnvironment('GITHUB_REF');
	const refName = hostedEnvironment('GITHUB_REF_NAME');
	assert.equal(repository, 'hasanyilmaz/operon-cli', 'OPERON_CLI_PR_REPOSITORY_MISMATCH');
	assert.match(sha, /^[0-9a-f]{40}$/u, 'OPERON_CLI_PR_SHA_INVALID');
	assert.match(runId, /^[1-9][0-9]*$/u, 'OPERON_CLI_PR_RUN_ID_INVALID');
	assert.match(runAttempt, /^[1-9][0-9]*$/u, 'OPERON_CLI_PR_RUN_ATTEMPT_INVALID');
	assert.ok(eventName === 'push' || eventName === 'pull_request', 'OPERON_CLI_PR_EVENT_INVALID');

	const eventPath = hostedEnvironment('GITHUB_EVENT_PATH');
	assert.equal(path.isAbsolute(eventPath), true, 'OPERON_CLI_PR_EVENT_PATH_RELATIVE');
	const eventStat = await lstat(eventPath);
	assert.equal(eventStat.isFile(), true, 'OPERON_CLI_PR_EVENT_PATH_INVALID');
	assert.equal(eventStat.isSymbolicLink(), false, 'OPERON_CLI_PR_EVENT_PATH_INVALID');
	const event = JSON.parse(await readFile(eventPath, 'utf8'));
	assert.equal(event?.repository?.full_name, repository, 'OPERON_CLI_PR_EVENT_REPOSITORY_MISMATCH');

	if (eventName === 'push') {
		assert.equal(ref, 'refs/heads/main', 'OPERON_CLI_PR_PUSH_REF_MISMATCH');
		assert.equal(refName, 'main', 'OPERON_CLI_PR_PUSH_REF_NAME_MISMATCH');
		assert.equal(event?.ref, ref, 'OPERON_CLI_PR_PUSH_EVENT_REF_MISMATCH');
		assert.equal(event?.after, sha, 'OPERON_CLI_PR_PUSH_SHA_MISMATCH');
		assert.notEqual(event?.deleted, true, 'OPERON_CLI_PR_PUSH_DELETE_FORBIDDEN');
	} else {
		const number = event?.number;
		const pullRequest = event?.pull_request;
		assert.equal(Number.isSafeInteger(number) && number > 0, true, 'OPERON_CLI_PR_NUMBER_INVALID');
		assert.equal(ref, `refs/pull/${number}/merge`, 'OPERON_CLI_PR_REF_MISMATCH');
		assert.equal(refName, `${number}/merge`, 'OPERON_CLI_PR_REF_NAME_MISMATCH');
		const baseRef = hostedEnvironment('GITHUB_BASE_REF');
		const headRef = hostedEnvironment('GITHUB_HEAD_REF');
		assert.equal(baseRef, 'main', 'OPERON_CLI_PR_BASE_REF_MISMATCH');
		assert.equal(pullRequest?.base?.repo?.full_name, repository, 'OPERON_CLI_PR_BASE_REPOSITORY_MISMATCH');
		assert.equal(pullRequest?.base?.ref, baseRef, 'OPERON_CLI_PR_EVENT_BASE_REF_MISMATCH');
		assert.equal(pullRequest?.head?.ref, headRef, 'OPERON_CLI_PR_EVENT_HEAD_REF_MISMATCH');
		assert.match(pullRequest?.base?.sha ?? '', /^[0-9a-f]{40}$/u, 'OPERON_CLI_PR_BASE_SHA_INVALID');
		assert.match(pullRequest?.head?.sha ?? '', /^[0-9a-f]{40}$/u, 'OPERON_CLI_PR_HEAD_SHA_INVALID');
		assert.match(pullRequest?.head?.repo?.full_name ?? '', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u, 'OPERON_CLI_PR_HEAD_REPOSITORY_INVALID');
		assert.ok(
			pullRequest?.merge_commit_sha === null
				|| /^[0-9a-f]{40}$/u.test(pullRequest?.merge_commit_sha ?? ''),
			'OPERON_CLI_PR_MERGE_SHA_INVALID',
		);
	}
	console.log(JSON.stringify({ status: 'passed', event: eventName, sha }));
}

async function candidateTest(npmRoot, outputRoot) {
	const npmCli = path.join(npmRoot, 'package', 'bin', 'npm-cli.js');
	const npmStat = await lstat(npmCli);
	assert.equal(npmStat.isFile(), true, 'OPERON_CLI_PR_NPM_CLI_INVALID');
	assert.equal(npmStat.isSymbolicLink(), false, 'OPERON_CLI_PR_NPM_CLI_INVALID');
	await mkdir(outputRoot, { recursive: false });
	const candidateRoot = path.join(outputRoot, 'candidate');
	const legacyRoot = path.join(outputRoot, 'legacy');
	await mkdir(candidateRoot);
	const packed = runNpmJson(npmRoot, [
		'pack', '--json', '--ignore-scripts', '--pack-destination', candidateRoot,
	], projectRoot)[0];
	assert.equal(packed?.name, OPERON_CLI_RELEASE_V1.package.name, 'OPERON_CLI_PR_CANDIDATE_NAME_MISMATCH');
	assert.equal(packed?.version, OPERON_CLI_RELEASE_V1.package.version, 'OPERON_CLI_PR_CANDIDATE_VERSION_MISMATCH');
	const source = path.join(candidateRoot, packed.filename);
	const candidate = path.join(candidateRoot, `operon-cli-${OPERON_CLI_RELEASE_V1.package.version}.tgz`);
	if (source !== candidate) await rename(source, candidate);
	const archive = await normalizeOperonPackageTarballV1(candidate);
	assertOperonPackageInventoryV1(archive.entries);
	assert.equal(archive.entries.length, OPERON_CLI_RELEASE_V1.inventoryEntries, 'OPERON_CLI_PR_CANDIDATE_INVENTORY_MISMATCH');
	const canonical = {
		package: { name: packed.name, version: packed.version },
		tarball: { bytes: archive.bytes, sha256: archive.sha256, sha512: archive.sha512 },
		inventory: archive.entries.map(({ path: entryPath, mode, size, sha256 }) => ({
			path: entryPath, mode, size, sha256,
		})),
	};
	const manifest = path.join(candidateRoot, 'artifact-manifest.json');
	await writeFile(manifest, `${JSON.stringify({ canonical }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
	runNode([
		path.join(projectRoot, 'scripts', 'hosted-validation.mjs'),
		'acquire-legacy', npmRoot, legacyRoot,
	]);
	const legacy = path.join(legacyRoot, 'operon-cli-1.0.7.tgz');
	runNpm(npmRoot, ['run', 'package:test'], {
		OPERON_CLI_CANDIDATE_TARBALL: candidate,
		OPERON_CLI_CANDIDATE_MANIFEST: manifest,
		OPERON_CLI_LEGACY_TARBALL: legacy,
	});
	console.log(JSON.stringify({
		status: 'passed',
		bytes: archive.bytes,
		sha256: archive.sha256,
		inventory: archive.entries.length,
	}));
}

function runNpmJson(npmRoot, npmArgs, cwd) {
	return JSON.parse(runNpm(npmRoot, npmArgs, {}, cwd, true));
}

function runNpm(npmRoot, npmArgs, environment = {}, cwd = projectRoot, capture = false) {
	return runNode([path.join(npmRoot, 'package', 'bin', 'npm-cli.js'), ...npmArgs], environment, cwd, capture);
}

function runNode(args, environment = {}, cwd = projectRoot, capture = false) {
	const inheritedPath = Object.entries(process.env)
		.find(([key]) => key.toLocaleLowerCase('en-US') === 'path')?.[1] ?? '';
	const result = spawnSync(process.execPath, args, {
		cwd,
		encoding: 'utf8',
		stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
		env: createChildEnvironmentWithPathV1({ ...process.env, ...environment }, inheritedPath),
	});
	if (result.error || result.status !== 0) {
		throw new Error(`OPERON_CLI_PR_COMMAND_FAILED:${result.status}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`, {
			cause: result.error,
		});
	}
	return result.stdout ?? '';
}

function hostedEnvironment(name) {
	const value = process.env[name];
	assert.equal(typeof value, 'string', `OPERON_CLI_PR_ENV_MISSING:${name}`);
	assert.equal(value.includes('\0'), false, `OPERON_CLI_PR_ENV_NUL:${name}`);
	assert.notEqual(value.trim(), '', `OPERON_CLI_PR_ENV_EMPTY:${name}`);
	return value.trim();
}

function requiredPath(value) {
	assert.ok(value, 'OPERON_CLI_PR_ARGUMENT_REQUIRED');
	return path.resolve(value);
}
