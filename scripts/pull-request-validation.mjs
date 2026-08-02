import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_WORKFLOW_SHA256 = 'f326836c457a872bed50acd6fe29cd4470633566742e14d9ad9826c69b3def91';

const [command, ...args] = process.argv.slice(2);
switch (command) {
	case 'workflow-check': await workflowCheck(args[0]); break;
	case 'hosted-identity-check': await hostedIdentityCheck(); break;
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
		assert.equal(Number.isSafeInteger(number) && number > 0, true, 'OPERON_CLI_PR_NUMBER_INVALID');
		assert.equal(ref, `refs/pull/${number}/merge`, 'OPERON_CLI_PR_REF_MISMATCH');
		assert.equal(refName, `${number}/merge`, 'OPERON_CLI_PR_REF_NAME_MISMATCH');
		assert.equal(hostedEnvironment('GITHUB_BASE_REF'), 'main', 'OPERON_CLI_PR_BASE_REF_MISMATCH');
		assert.notEqual(hostedEnvironment('GITHUB_HEAD_REF'), '', 'OPERON_CLI_PR_HEAD_REF_MISSING');
		assert.equal(event?.pull_request?.base?.repo?.full_name, repository, 'OPERON_CLI_PR_BASE_REPOSITORY_MISMATCH');
		assert.equal(event?.pull_request?.base?.ref, 'main', 'OPERON_CLI_PR_EVENT_BASE_REF_MISMATCH');
		assert.equal(event?.pull_request?.merge_commit_sha, sha, 'OPERON_CLI_PR_MERGE_SHA_MISMATCH');
	}
	console.log(JSON.stringify({ status: 'passed', event: eventName, sha }));
}

function hostedEnvironment(name) {
	const value = process.env[name];
	assert.equal(typeof value, 'string', `OPERON_CLI_PR_ENV_MISSING:${name}`);
	assert.equal(value.includes('\0'), false, `OPERON_CLI_PR_ENV_NUL:${name}`);
	assert.notEqual(value.trim(), '', `OPERON_CLI_PR_ENV_EMPTY:${name}`);
	return value.trim();
}
