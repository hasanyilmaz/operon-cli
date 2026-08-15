import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { link, lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { OPERON_CLI_RELEASE_V1 } from './release-identity.mjs';
import { EXPECTED_PACKAGE_PATHS_V1 } from './package-archive.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECEIPT_KIND = 'operon-cli-windows-candidate-validation-v1';
const EXPECTED_NODE = 'v24.18.0';
const EXPECTED_NPM = '11.12.1';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await runWindowsCandidateValidation();
}

export async function runWindowsCandidateValidation() {
	assert.equal(process.argv.length, 2, 'OPERON_CLI_WINDOWS_CANDIDATE_ARGUMENT_FORBIDDEN');
	assertWindowsCandidateHostV1(process.platform, process.version);
	const headSha = exactHeadSha();
	assertTrackedClean('INITIAL');
	const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'operon-cli-windows-candidate-'));
	let receipt;
	let primaryError;
	try {
		const npmRoot = path.join(temporaryRoot, 'npm');
		const candidateRoot = path.join(temporaryRoot, 'candidate-output');
		runNode(['scripts/hosted-validation.mjs', 'install-script-check']);
		runNode(['scripts/hosted-validation.mjs', 'acquire-npm', npmRoot]);
		const npmVersion = runNode([
			path.join(npmRoot, 'package', 'bin', 'npm-cli.js'), '--version',
		], { capture: true }).trim();
		assert.equal(npmVersion, EXPECTED_NPM, 'OPERON_CLI_WINDOWS_CANDIDATE_NPM_VERSION_MISMATCH');
		runNode(['scripts/hosted-validation.mjs', 'run-npm', npmRoot, 'ci', '--include=dev', '--no-audit', '--no-fund']);
		runNode(['scripts/hosted-validation.mjs', 'run-npm', npmRoot, 'cache', 'verify']);
		const prepackOutput = runNode([
			'scripts/hosted-validation.mjs', 'run-npm', npmRoot, 'run', 'prepack',
		], { capture: true });
		process.stdout.write(prepackOutput);
		const bootstrapAcceptance = parsePassedJsonLineV1(
			prepackOutput,
			value => value.kind === 'operon-cli-windows-bootstrap-acceptance-v1',
		);
		assertWindowsBootstrapAcceptanceV1(bootstrapAcceptance);
		runNode(['scripts/pull-request-validation.mjs', 'candidate-test', npmRoot, candidateRoot]);
		const hostedOutput = runNode(['scripts/run-typescript-tests.mjs', 'test/hosted'], { capture: true });
		process.stdout.write(hostedOutput);
		const hosted = parsePassedJsonLineV1(hostedOutput, value => value.platform === 'win32');
		assert.equal(hosted.skipped, 0, 'OPERON_CLI_WINDOWS_CANDIDATE_HOSTED_SKIP');
		assert.equal(hosted.assertions, 5, 'OPERON_CLI_WINDOWS_CANDIDATE_HOSTED_ASSERTION_MISMATCH');
		assert.deepEqual(hosted.acceptance, {
			nativeWindowsDacl: 'passed',
			secureAtomicDescriptorWrite: 'passed',
			insecureDescriptorNoBootstrap: 'passed',
		}, 'OPERON_CLI_WINDOWS_CANDIDATE_NATIVE_BOOTSTRAP_ACCEPTANCE_MISMATCH');
		const manifest = JSON.parse(await readFile(path.join(candidateRoot, 'candidate', 'artifact-manifest.json'), 'utf8'));
		const canonical = manifest?.canonical;
		assert.deepEqual(canonical?.package, OPERON_CLI_RELEASE_V1.package, 'OPERON_CLI_WINDOWS_CANDIDATE_RELEASE_IDENTITY_MISMATCH');
		assert.equal(
			canonical?.inventory?.length,
			EXPECTED_PACKAGE_PATHS_V1.length,
			'OPERON_CLI_WINDOWS_CANDIDATE_INVENTORY_MISMATCH',
		);
		receipt = {
			kind: RECEIPT_KIND,
			schemaVersion: 1,
			status: 'passed',
			repository: 'hasanyilmaz/operon-cli',
			headSha,
			platform: process.platform,
			arch: process.arch,
			toolchain: { node: process.version, npm: npmVersion },
			candidate: {
				bytes: canonical.tarball.bytes,
				sha256: canonical.tarball.sha256,
				inventory: canonical.inventory.length,
			},
			hosted: { assertions: hosted.assertions, skipped: hosted.skipped },
			acceptance: {
				portableBootstrap: bootstrapAcceptance.assertions,
				nativeBootstrap: hosted.acceptance,
			},
			trackedClean: true,
			releaseEligible: false,
		};
	} catch (error) {
		primaryError = error;
	}
	const postflightErrors = [];
	try {
		await rm(temporaryRoot, { recursive: true, force: true });
	} catch (error) {
		postflightErrors.push(error);
	}
	try {
		assertTrackedClean('FINAL');
	} catch (error) {
		postflightErrors.push(error);
	}
	throwValidationFailuresV1(primaryError, postflightErrors);
	assert.ok(receipt, 'OPERON_CLI_WINDOWS_CANDIDATE_RECEIPT_MISSING');
	await writeReceiptIfRequested(receipt);
	console.log(JSON.stringify(receipt));
	return receipt;
}

export function throwValidationFailuresV1(primaryError, postflightErrors) {
	const failures = [...(primaryError ? [primaryError] : []), ...postflightErrors];
	if (failures.length > 1) {
		throw new AggregateError(failures, 'OPERON_CLI_WINDOWS_CANDIDATE_VALIDATION_AND_POSTFLIGHT_FAILED');
	}
	if (failures.length === 1) throw failures[0];
}

export function assertWindowsCandidateHostV1(platform, nodeVersion) {
	assert.equal(platform, 'win32', `OPERON_CLI_WINDOWS_CANDIDATE_HOST_REQUIRED:${platform}`);
	assert.equal(nodeVersion, EXPECTED_NODE, `OPERON_CLI_WINDOWS_CANDIDATE_NODE_VERSION_MISMATCH:${nodeVersion}`);
}

export function parsePassedJsonLineV1(output, predicate = () => true) {
	const values = output.split(/\r?\n/u).filter(Boolean).flatMap(line => {
		try { return [JSON.parse(line)]; } catch { return []; }
	});
	const value = values.find(candidate => candidate?.status === 'passed' && predicate(candidate));
	assert.ok(value, 'OPERON_CLI_WINDOWS_CANDIDATE_EVIDENCE_MISSING');
	return value;
}

export function assertWindowsBootstrapAcceptanceV1(value) {
	assert.equal(value?.kind, 'operon-cli-windows-bootstrap-acceptance-v1', 'OPERON_CLI_WINDOWS_BOOTSTRAP_ACCEPTANCE_KIND');
	assert.equal(value?.status, 'passed', 'OPERON_CLI_WINDOWS_BOOTSTRAP_ACCEPTANCE_STATUS');
	assert.deepEqual(value?.assertions, {
		strictEnvelopeAndNonce: 'passed',
		secureAtomicDescriptorContract: 'passed',
		cachedSecondUse: 'passed',
		restartAndStaleRefresh: 'passed',
		concurrentColdStart: 'passed',
		postFrameNoReplay: 'passed',
		mutationApplyNoReplay: 'passed',
		cancellationAndRedaction: 'passed',
	}, 'OPERON_CLI_WINDOWS_BOOTSTRAP_ACCEPTANCE_MATRIX');
}

function exactHeadSha() {
	const sha = run('git', ['rev-parse', 'HEAD'], { capture: true }).trim();
	assert.match(sha, /^[0-9a-f]{40}$/u, 'OPERON_CLI_WINDOWS_CANDIDATE_HEAD_INVALID');
	return sha;
}

function assertTrackedClean(stage) {
	const dirty = run('git', ['status', '--porcelain=v1', '--untracked-files=no'], { capture: true }).trim();
	assert.equal(dirty, '', `OPERON_CLI_WINDOWS_CANDIDATE_TRACKED_MUTATION:${stage}\n${dirty}`);
	run('git', ['diff', '--check']);
}

async function writeReceiptIfRequested(receipt) {
	const configured = process.env.OPERON_CLI_WINDOWS_CANDIDATE_RECEIPT;
	if (configured === undefined) return;
	const target = validateReceiptPathV1(configured, projectRoot);
	await writeReceiptV1(receipt, target);
}

export async function writeReceiptV1(receipt, target) {
	const parentStat = await lstat(path.dirname(target));
	assert.equal(parentStat.isDirectory(), true, 'OPERON_CLI_WINDOWS_CANDIDATE_RECEIPT_PARENT_INVALID');
	assert.equal(parentStat.isSymbolicLink(), false, 'OPERON_CLI_WINDOWS_CANDIDATE_RECEIPT_PARENT_INVALID');
	const temporary = `${target}.${randomBytes(8).toString('hex')}.tmp`;
	try {
		await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
		await link(temporary, target);
	} finally {
		await rm(temporary, { force: true });
	}
}

export function validateReceiptPathV1(configured, repositoryRoot) {
	assert.equal(configured.includes('\0'), false, 'OPERON_CLI_WINDOWS_CANDIDATE_RECEIPT_NUL');
	assert.equal(path.isAbsolute(configured), true, 'OPERON_CLI_WINDOWS_CANDIDATE_RECEIPT_RELATIVE');
	const target = path.resolve(configured);
	const physicalRepositoryRoot = realpathSync.native(repositoryRoot);
	const physicalTarget = path.join(realpathSync.native(path.dirname(target)), path.basename(target));
	assert.equal(isWithin(physicalRepositoryRoot, physicalTarget), false, 'OPERON_CLI_WINDOWS_CANDIDATE_RECEIPT_INSIDE_REPOSITORY');
	return target;
}

function isWithin(parent, candidate) {
	const relative = path.relative(parent, candidate);
	return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function runNode(args, options = {}) {
	return run(process.execPath, args, options);
}

function run(executable, args, { capture = false } = {}) {
	const result = spawnSync(executable, args, {
		cwd: projectRoot,
		encoding: 'utf8',
		stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
		env: { ...process.env, NO_COLOR: '1' },
		maxBuffer: 32 * 1024 * 1024,
		windowsHide: true,
		shell: false,
	});
	if (result.error || result.status !== 0) {
		throw new Error(`OPERON_CLI_WINDOWS_CANDIDATE_COMMAND_FAILED:${executable}:${result.status}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`, { cause: result.error });
	}
	return result.stdout ?? '';
}
