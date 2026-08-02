import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path, { delimiter, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChildEnvironmentWithPathV1 } from './child-process-environment.mjs';
import { assertOperonPackageInventoryV1, inspectPackageTarballV1 } from './package-archive.mjs';
import {
	OPERON_CLI_PUBLISH_NPM_V1,
	OPERON_CLI_RELEASE_V1,
	OPERON_CLI_RELEASE_WORKFLOW_V1,
} from './release-identity.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_WORKFLOW_SHA256 = 'd2bda5a0044e6c0b93569e7bf90aa56228cded0d222f730a129c568defdc2ccb';
const ALLOWED_ACTIONS = new Set([
	'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
	'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
	'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
]);

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
	const [command, ...args] = process.argv.slice(2);
	switch (command) {
		case 'workflow-check': await workflowCheck(args[0]); break;
		case 'identity-check': hostedIdentityCheck(...args); break;
		case 'run-check': await runCheck(...args); break;
		case 'jobs-check': await jobsCheck(...args); break;
		case 'artifact-check': await artifactCheckV1(...args); break;
		case 'acquire-npm': await acquirePublishNpm(requiredPath(args[0])); break;
		default: throw new Error(`OPERON_CLI_RELEASE_COMMAND_INVALID:${command ?? ''}`);
	}
}

async function workflowCheck(workflowPath = path.join(projectRoot, '.github', 'workflows', 'npm-staged-release.yml')) {
	const document = await readFile(workflowPath, 'utf8');
	assert.equal(
		createHash('sha256').update(document).digest('hex'),
		RELEASE_WORKFLOW_SHA256,
		'OPERON_CLI_RELEASE_WORKFLOW_DIGEST_MISMATCH',
	);
	for (const requiredText of [
		'workflow_dispatch:',
		'permissions: {}',
		'cancel-in-progress: false',
		'environment: npm-staging',
		'id-token: write',
		'actions: read',
		'contents: read',
		'persist-credentials: false',
		'node-version: 24.18.0',
		'npm-staged-release-gate:',
		'name: npm staged release gate',
		'npm stage publish',
		'--tag latest',
		'--access public',
		'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
		'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
		'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
	]) assert.ok(document.includes(requiredText), `OPERON_CLI_RELEASE_WORKFLOW_REQUIRED_TEXT_MISSING:${requiredText}`);
	for (const forbidden of [
		'pull_request:', 'pull_request_target', 'push:', 'schedule:', 'release:', 'workflow_call:',
		'packages: write', 'contents: write', 'actions: write', 'write-all', 'read-all', 'secrets.',
		'NODE_AUTH_TOKEN:', 'NPM_TOKEN:', 'npm publish', 'npm dist-tag', 'npm deprecate',
		'npm unpublish', 'npm pack', 'npm run', 'build:dist', 'generate:', 'actions/cache@',
		'actions/upload-artifact@', '--provenance', 'cancel-in-progress: true',
	]) assert.equal(document.includes(forbidden), false, `OPERON_CLI_RELEASE_WORKFLOW_FORBIDDEN_TEXT:${forbidden}`);
	assert.equal(document.match(/id-token:\s*write/gu)?.length, 1, 'OPERON_CLI_RELEASE_ID_TOKEN_SCOPE_MISMATCH');
	assert.equal(document.match(/npm stage publish/gu)?.length, 1, 'OPERON_CLI_RELEASE_STAGE_COMMAND_COUNT_MISMATCH');
	for (const match of document.matchAll(/uses:\s+([^\s#]+)/gu)) {
		assert.match(match[1] ?? '', /^[^@\s]+@[0-9a-f]{40}$/u, 'OPERON_CLI_RELEASE_ACTION_NOT_PINNED');
		assert.equal(ALLOWED_ACTIONS.has(match[1] ?? ''), true, `OPERON_CLI_RELEASE_ACTION_NOT_ALLOWED:${match[1] ?? ''}`);
	}
	assertNoInputExpressionsInRunBlocks(document);
	console.log(JSON.stringify({ status: 'passed', workflow: path.basename(workflowPath) }));
}

function assertNoInputExpressionsInRunBlocks(document) {
	const lines = document.split('\n');
	for (let index = 0; index < lines.length; index += 1) {
		const match = /^(\s*)run:\s*\|\s*$/u.exec(lines[index] ?? '');
		if (!match) continue;
		const indentation = match[1]?.length ?? 0;
		const block = [];
		for (index += 1; index < lines.length; index += 1) {
			const line = lines[index] ?? '';
			if (line.trim() !== '' && (line.match(/^\s*/u)?.[0].length ?? 0) <= indentation) {
				index -= 1;
				break;
			}
			block.push(line);
		}
		assert.equal(block.join('\n').includes('${{ inputs.'), false, 'OPERON_CLI_RELEASE_INPUT_EXPRESSION_IN_RUN_BLOCK');
	}
}

function hostedIdentityCheck(expectedCommit, expectedRunId, expectedTarball, expectedManifest, confirmation) {
	assertGitSha(expectedCommit, 'OPERON_CLI_RELEASE_EXPECTED_COMMIT_INVALID');
	assertRunId(expectedRunId, 'OPERON_CLI_RELEASE_EXPECTED_RUN_ID_INVALID');
	assertSha256(expectedTarball, 'OPERON_CLI_RELEASE_EXPECTED_TARBALL_INVALID');
	assertSha256(expectedManifest, 'OPERON_CLI_RELEASE_EXPECTED_MANIFEST_INVALID');
	assert.equal(expectedTarball, OPERON_CLI_RELEASE_V1.tarball.sha256, 'OPERON_CLI_RELEASE_TARBALL_BASELINE_MISMATCH');
	assert.equal(confirmation, OPERON_CLI_RELEASE_WORKFLOW_V1.confirmation, 'OPERON_CLI_RELEASE_CONFIRMATION_MISMATCH');
	if (process.env.GITHUB_ACTIONS !== 'true') {
		console.log(JSON.stringify({ status: 'passed', event: 'local' }));
		return;
	}
	assert.equal(hostedEnvironment('GITHUB_REPOSITORY'), OPERON_CLI_RELEASE_WORKFLOW_V1.repository, 'OPERON_CLI_RELEASE_REPOSITORY_MISMATCH');
	assert.equal(hostedEnvironment('GITHUB_EVENT_NAME'), 'workflow_dispatch', 'OPERON_CLI_RELEASE_EVENT_MISMATCH');
	assert.equal(hostedEnvironment('GITHUB_REF'), `refs/tags/${OPERON_CLI_RELEASE_WORKFLOW_V1.tag}`, 'OPERON_CLI_RELEASE_REF_MISMATCH');
	assert.equal(hostedEnvironment('GITHUB_REF_NAME'), OPERON_CLI_RELEASE_WORKFLOW_V1.tag, 'OPERON_CLI_RELEASE_REF_NAME_MISMATCH');
	assert.equal(hostedEnvironment('GITHUB_SHA'), expectedCommit, 'OPERON_CLI_RELEASE_COMMIT_MISMATCH');
	console.log(JSON.stringify({ status: 'passed', commit: expectedCommit, runId: expectedRunId }));
}

async function runCheck(metadataPath, expectedCommit, expectedRunId) {
	assertGitSha(expectedCommit, 'OPERON_CLI_RELEASE_EXPECTED_COMMIT_INVALID');
	assertRunId(expectedRunId, 'OPERON_CLI_RELEASE_EXPECTED_RUN_ID_INVALID');
	const run = JSON.parse(await readFile(requiredPath(metadataPath), 'utf8'));
	assert.equal(String(run?.id), expectedRunId, 'OPERON_CLI_RELEASE_HOSTED_RUN_ID_MISMATCH');
	assert.equal(run?.repository?.full_name, OPERON_CLI_RELEASE_WORKFLOW_V1.repository, 'OPERON_CLI_RELEASE_HOSTED_REPOSITORY_MISMATCH');
	assert.equal(run?.path, OPERON_CLI_RELEASE_WORKFLOW_V1.hostedWorkflowPath, 'OPERON_CLI_RELEASE_HOSTED_WORKFLOW_MISMATCH');
	assert.equal(run?.event, 'workflow_dispatch', 'OPERON_CLI_RELEASE_HOSTED_EVENT_MISMATCH');
	assert.equal(run?.head_branch, 'main', 'OPERON_CLI_RELEASE_HOSTED_BRANCH_MISMATCH');
	assert.equal(run?.head_sha, expectedCommit, 'OPERON_CLI_RELEASE_HOSTED_COMMIT_MISMATCH');
	assert.equal(run?.status, 'completed', 'OPERON_CLI_RELEASE_HOSTED_STATUS_MISMATCH');
	assert.equal(run?.conclusion, 'success', 'OPERON_CLI_RELEASE_HOSTED_CONCLUSION_MISMATCH');
	assert.equal(Number.isSafeInteger(run?.run_attempt) && run.run_attempt > 0, true, 'OPERON_CLI_RELEASE_HOSTED_ATTEMPT_INVALID');
	console.log(JSON.stringify({ status: 'passed', runId: expectedRunId, commit: expectedCommit }));
}

async function jobsCheck(metadataPath) {
	const document = JSON.parse(await readFile(requiredPath(metadataPath), 'utf8'));
	assert.equal(document?.total_count, 17, 'OPERON_CLI_RELEASE_HOSTED_JOB_COUNT_MISMATCH');
	assert.equal(Array.isArray(document?.jobs), true, 'OPERON_CLI_RELEASE_HOSTED_JOBS_INVALID');
	assert.equal(document.jobs.length, 17, 'OPERON_CLI_RELEASE_HOSTED_JOB_PAGE_MISMATCH');
	for (const job of document.jobs) {
		assert.equal(job?.status, 'completed', `OPERON_CLI_RELEASE_HOSTED_JOB_STATUS_MISMATCH:${job?.name ?? ''}`);
		assert.equal(job?.conclusion, 'success', `OPERON_CLI_RELEASE_HOSTED_JOB_CONCLUSION_MISMATCH:${job?.name ?? ''}`);
	}
	const gate = document.jobs.filter(job => job?.name === 'Hosted validation gate');
	assert.equal(gate.length, 1, 'OPERON_CLI_RELEASE_HOSTED_GATE_MISMATCH');
	console.log(JSON.stringify({ status: 'passed', jobs: document.jobs.length }));
}

export async function artifactCheckV1(
	rootPath,
	expectedTarball,
	expectedManifest,
	expectedCommit,
	expectedRunId,
	releaseIdentity = OPERON_CLI_RELEASE_V1,
) {
	const root = requiredPath(rootPath);
	assertSha256(expectedTarball, 'OPERON_CLI_RELEASE_EXPECTED_TARBALL_INVALID');
	assertSha256(expectedManifest, 'OPERON_CLI_RELEASE_EXPECTED_MANIFEST_INVALID');
	assertGitSha(expectedCommit, 'OPERON_CLI_RELEASE_EXPECTED_COMMIT_INVALID');
	assertRunId(expectedRunId, 'OPERON_CLI_RELEASE_EXPECTED_RUN_ID_INVALID');
	assert.equal(expectedTarball, releaseIdentity.tarball.sha256, 'OPERON_CLI_RELEASE_TARBALL_BASELINE_MISMATCH');
	const names = (await readdir(root)).sort();
	assert.deepEqual(names, ['artifact-manifest.json', 'determinism-report.json', 'operon-cli-1.0.8.tgz'], 'OPERON_CLI_RELEASE_ARTIFACT_INVENTORY_MISMATCH');
	const tarballPath = path.join(root, 'operon-cli-1.0.8.tgz');
	const manifestPath = path.join(root, 'artifact-manifest.json');
	const reportPath = path.join(root, 'determinism-report.json');
	await assertRegularFile(tarballPath, 'OPERON_CLI_RELEASE_TARBALL_FILE_INVALID');
	await assertRegularFile(manifestPath, 'OPERON_CLI_RELEASE_MANIFEST_FILE_INVALID');
	await assertRegularFile(reportPath, 'OPERON_CLI_RELEASE_REPORT_FILE_INVALID');
	assert.equal(await sha256File(manifestPath), expectedManifest, 'OPERON_CLI_RELEASE_MANIFEST_SHA256_MISMATCH');
	const archive = await inspectPackageTarballV1(tarballPath);
	assert.equal(archive.bytes, releaseIdentity.tarball.bytes, 'OPERON_CLI_RELEASE_TARBALL_BYTES_MISMATCH');
	assert.equal(archive.sha256, expectedTarball, 'OPERON_CLI_RELEASE_TARBALL_SHA256_MISMATCH');
	assert.equal(archive.sha512, releaseIdentity.tarball.sha512, 'OPERON_CLI_RELEASE_TARBALL_SHA512_MISMATCH');
	assertOperonPackageInventoryV1(archive.entries);
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
	assertCanonical(manifest?.canonical, archive, releaseIdentity);
	assertHostedEvidence(manifest?.evidence, expectedCommit, expectedRunId);
	const report = JSON.parse(await readFile(reportPath, 'utf8'));
	assert.equal(report?.status, 'passed', 'OPERON_CLI_RELEASE_DETERMINISM_STATUS_MISMATCH');
	assert.equal(Array.isArray(report?.candidates), true, 'OPERON_CLI_RELEASE_DETERMINISM_CANDIDATES_INVALID');
	assert.equal(report.candidates.length, 4, 'OPERON_CLI_RELEASE_DETERMINISM_CANDIDATE_COUNT_MISMATCH');
	for (const evidence of report.candidates) assertHostedEvidence(evidence, expectedCommit, expectedRunId, false);
	assertCanonical(report?.canonical, archive, releaseIdentity);
	const packageEntry = archive.entries.find(entry => entry.path === 'package/package.json');
	assert.ok(packageEntry, 'OPERON_CLI_RELEASE_PACKAGE_JSON_MISSING');
	const packageDocument = JSON.parse(packageEntry.content.toString('utf8'));
	assert.equal(packageDocument.name, releaseIdentity.package.name, 'OPERON_CLI_RELEASE_PACKAGE_NAME_MISMATCH');
	assert.equal(packageDocument.version, releaseIdentity.package.version, 'OPERON_CLI_RELEASE_PACKAGE_VERSION_MISMATCH');
	assert.equal('private' in packageDocument, false, 'OPERON_CLI_RELEASE_PACKAGE_PRIVATE_FORBIDDEN');
	assert.deepEqual(packageDocument.publishConfig, {
		access: 'public',
		registry: releaseIdentity.registry,
		provenance: true,
	}, 'OPERON_CLI_RELEASE_PUBLISH_CONFIG_MISMATCH');
	assert.equal(packageDocument.repository?.url, 'git+https://github.com/hasanyilmaz/operon-cli.git', 'OPERON_CLI_RELEASE_REPOSITORY_URL_MISMATCH');
	const privateMarkers = [projectRoot, process.env.HOME, process.env.RUNNER_TEMP].filter(Boolean);
	for (const entry of archive.entries) {
		const text = entry.content.toString('utf8');
		for (const marker of privateMarkers) {
			assert.equal(text.includes(marker), false, `OPERON_CLI_RELEASE_PRIVATE_MARKER:${entry.path}`);
		}
	}
	console.log(JSON.stringify({ status: 'passed', bytes: archive.bytes, sha256: archive.sha256, entries: archive.entries.length }));
}

function assertCanonical(canonical, archive, releaseIdentity) {
	assert.deepEqual(canonical?.package, releaseIdentity.package, 'OPERON_CLI_RELEASE_CANONICAL_PACKAGE_MISMATCH');
	assert.deepEqual(canonical?.tarball, releaseIdentity.tarball, 'OPERON_CLI_RELEASE_CANONICAL_TARBALL_MISMATCH');
	assert.equal(canonical?.inventory?.length, releaseIdentity.inventoryEntries, 'OPERON_CLI_RELEASE_CANONICAL_INVENTORY_MISMATCH');
	assert.deepEqual(canonical?.inventory, archive.entries.map(({ path: entryPath, mode, size, sha256 }) => ({ path: entryPath, mode, size, sha256 })), 'OPERON_CLI_RELEASE_CANONICAL_ENTRY_MISMATCH');
	assert.deepEqual(canonical?.executable, releaseIdentity.executable, 'OPERON_CLI_RELEASE_EXECUTABLE_MISMATCH');
	assert.deepEqual(canonical?.manifest, releaseIdentity.manifest, 'OPERON_CLI_RELEASE_MANIFEST_MISMATCH');
	assert.equal(canonical?.schemas, releaseIdentity.schemas, 'OPERON_CLI_RELEASE_SCHEMAS_MISMATCH');
	assert.equal(canonical?.declarations, releaseIdentity.declarations, 'OPERON_CLI_RELEASE_DECLARATIONS_MISMATCH');
}

function assertHostedEvidence(evidence, expectedCommit, expectedRunId, requireUbuntu = true) {
	assert.equal(evidence?.github?.repository, OPERON_CLI_RELEASE_WORKFLOW_V1.repository, 'OPERON_CLI_RELEASE_EVIDENCE_REPOSITORY_MISMATCH');
	assert.equal(evidence?.github?.sha, expectedCommit, 'OPERON_CLI_RELEASE_EVIDENCE_COMMIT_MISMATCH');
	assert.equal(evidence?.github?.runId, expectedRunId, 'OPERON_CLI_RELEASE_EVIDENCE_RUN_ID_MISMATCH');
	assert.equal(evidence?.github?.eventName, 'workflow_dispatch', 'OPERON_CLI_RELEASE_EVIDENCE_EVENT_MISMATCH');
	assert.equal(evidence?.github?.ref, 'refs/heads/main', 'OPERON_CLI_RELEASE_EVIDENCE_REF_MISMATCH');
	assert.equal(evidence?.github?.refName, 'main', 'OPERON_CLI_RELEASE_EVIDENCE_REF_NAME_MISMATCH');
	assert.deepEqual(evidence?.toolchain, { node: 'v24.18.0', npm: '11.12.1' }, 'OPERON_CLI_RELEASE_EVIDENCE_TOOLCHAIN_MISMATCH');
	if (requireUbuntu) {
		assert.equal(evidence?.runnerId, 'ubuntu-24.04', 'OPERON_CLI_RELEASE_EVIDENCE_RUNNER_MISMATCH');
		assert.equal(evidence?.runner?.os, 'Linux', 'OPERON_CLI_RELEASE_EVIDENCE_OS_MISMATCH');
	}
}

async function acquirePublishNpm(root) {
	await mkdir(root, { recursive: true });
	const response = await fetch(OPERON_CLI_PUBLISH_NPM_V1.tarball, {
		redirect: 'error',
		signal: AbortSignal.timeout(30_000),
	});
	assert.equal(response.status, 200, 'OPERON_CLI_RELEASE_NPM_DOWNLOAD_FAILED');
	assert.equal(response.url, OPERON_CLI_PUBLISH_NPM_V1.tarball, 'OPERON_CLI_RELEASE_NPM_DOWNLOAD_URL_MISMATCH');
	const tarballPath = path.join(root, `npm-${OPERON_CLI_PUBLISH_NPM_V1.version}.tgz`);
	const compressed = Buffer.from(await response.arrayBuffer());
	assert.equal(
		`sha512-${createHash('sha512').update(compressed).digest('base64')}`,
		OPERON_CLI_PUBLISH_NPM_V1.integrity,
		'OPERON_CLI_RELEASE_NPM_BYTES_MISMATCH',
	);
	await writeFile(tarballPath, compressed, { flag: 'wx', mode: 0o600 });
	const archive = await inspectPackageTarballV1(tarballPath);
	assert.equal(`sha512-${archive.sha512}`, OPERON_CLI_PUBLISH_NPM_V1.integrity, 'OPERON_CLI_RELEASE_NPM_BYTES_MISMATCH');
	run('tar', ['-xzf', tarballPath, '-C', root]);
	const publishCli = path.join(root, 'package', 'bin', 'npm-cli.js');
	await assertRegularFile(publishCli, 'OPERON_CLI_RELEASE_PUBLISH_NPM_INVALID');
	assert.equal(run(process.execPath, [publishCli, '--version'], { capture: true }).trim(), OPERON_CLI_PUBLISH_NPM_V1.version, 'OPERON_CLI_RELEASE_PUBLISH_NPM_VERSION_MISMATCH');
	const wrapper = path.join(root, 'npm');
	await writeFile(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${publishCli}" "$@"\n`, { mode: 0o755 });
	await chmod(wrapper, 0o755);
	console.log(JSON.stringify({ status: 'passed', version: OPERON_CLI_PUBLISH_NPM_V1.version, cli: publishCli }));
}

function run(executable, commandArgs, options = {}) {
	const inheritedPath = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
	const result = spawnSync(executable, commandArgs, {
		cwd: projectRoot,
		encoding: 'utf8',
		stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
		shell: false,
		env: createChildEnvironmentWithPathV1(process.env, `${dirname(process.execPath)}${delimiter}${inheritedPath}`),
	});
	if (result.error || result.status !== 0) {
		throw new Error(`OPERON_CLI_RELEASE_PROCESS_FAILED:${executable}:${result.status}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`, { cause: result.error });
	}
	return result.stdout ?? '';
}

async function assertRegularFile(filePath, code) {
	const stat = await lstat(filePath);
	assert.equal(stat.isFile(), true, code);
	assert.equal(stat.isSymbolicLink(), false, code);
}

async function sha256File(filePath) {
	return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

function assertSha256(value, code) {
	assert.match(value ?? '', /^[0-9a-f]{64}$/u, code);
}

function assertGitSha(value, code) {
	assert.match(value ?? '', /^[0-9a-f]{40}$/u, code);
}

function assertRunId(value, code) {
	assert.match(value ?? '', /^[1-9][0-9]*$/u, code);
}

function hostedEnvironment(name) {
	const value = process.env[name];
	assert.equal(typeof value, 'string', `OPERON_CLI_RELEASE_ENV_MISSING:${name}`);
	assert.equal(value.includes('\0'), false, `OPERON_CLI_RELEASE_ENV_NUL:${name}`);
	assert.notEqual(value.trim(), '', `OPERON_CLI_RELEASE_ENV_EMPTY:${name}`);
	return value.trim();
}

function requiredPath(value) {
	if (!value) throw new Error('OPERON_CLI_RELEASE_ARGUMENT_REQUIRED');
	return path.resolve(value);
}
