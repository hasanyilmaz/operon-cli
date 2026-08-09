import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateReceiptPathV1, writeReceiptV1 } from './windows-candidate-validation.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_REMOTE = 'https://github.com/hasanyilmaz/operon.git';
const EXPECTED_NODE = 'v24.18.0';
const EXPECTED_NPM = '11.12.1';
const SHA_PATTERN = /^[0-9a-f]{40}$/u;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await runWindowsPairValidation(process.argv.slice(2));
}

export async function runWindowsPairValidation(args) {
	assert.equal(args.length, 2, 'OPERON_WINDOWS_PAIR_ARGUMENT_COUNT_INVALID');
	const [pluginSha, cliSha] = args;
	assertPairInputsV1({ pluginSha, cliSha, platform: process.platform, arch: process.arch, nodeVersion: process.version });
	const npmExecPath = requiredNpmExecPathV1(process.env.npm_execpath);
	const npmVersion = run(process.execPath, [npmExecPath, '--version'], { capture: true }).trim();
	assert.equal(npmVersion, EXPECTED_NPM, 'OPERON_WINDOWS_PAIR_NPM_VERSION_MISMATCH');
	assert.equal(exactHeadSha(projectRoot), cliSha, 'OPERON_WINDOWS_PAIR_CLI_HEAD_MISMATCH');
	assertTrackedClean(projectRoot, 'INITIAL');

	const temporaryRoot = canonicalExistingDirectoryV1(await mkdtemp(path.join(tmpdir(), 'operon-windows-pair-')));
	let receipt;
	let primaryError;
	try {
		const pluginCheckout = path.join(temporaryRoot, 'plugin');
		const pluginReceiptPath = path.join(temporaryRoot, 'plugin-receipt.json');
		const cliReceiptPath = path.join(temporaryRoot, 'cli-receipt.json');
		checkoutExactPluginV1(pluginCheckout, pluginSha);
		runNpmValidationV1(npmExecPath, pluginCheckout, 'validate:windows:candidate', {
			OPERON_WINDOWS_CANDIDATE_RECEIPT: pluginReceiptPath,
		});
		runNpmValidationV1(npmExecPath, projectRoot, 'validate:windows:candidate', {
			OPERON_CLI_WINDOWS_CANDIDATE_RECEIPT: cliReceiptPath,
		});
		const pluginReceipt = JSON.parse(await readFile(pluginReceiptPath, 'utf8'));
		const cliReceipt = JSON.parse(await readFile(cliReceiptPath, 'utf8'));
		assertPluginReceiptV1(pluginReceipt, pluginSha);
		assertCliReceiptV1(cliReceipt, cliSha);
		const decoderParity = await decoderParityV1(pluginCheckout, projectRoot);
		receipt = {
			kind: 'operon-windows-pair-validation-v1',
			schemaVersion: 1,
			status: 'passed',
			releaseEligible: false,
			platform: process.platform,
			arch: process.arch,
			toolchain: { node: process.version, npm: npmVersion },
			pluginSha,
			cliSha,
			plugin: {
				native: pluginReceipt.nativeSummary,
				artifacts: pluginReceipt.artifacts,
			},
			cli: {
				candidate: cliReceipt.candidate,
				hosted: cliReceipt.hosted,
			},
			decoderParity,
			trackedClean: true,
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
		assertTrackedClean(projectRoot, 'FINAL');
	} catch (error) {
		postflightErrors.push(error);
	}
	const failures = [...(primaryError ? [primaryError] : []), ...postflightErrors];
	if (failures.length > 1) {
		throw new AggregateError(failures, 'OPERON_WINDOWS_PAIR_VALIDATION_AND_POSTFLIGHT_FAILED');
	}
	if (failures.length === 1) throw failures[0];
	assert.ok(receipt, 'OPERON_WINDOWS_PAIR_RECEIPT_MISSING');
	await writePairReceiptIfRequestedV1(receipt);
	console.log(JSON.stringify(receipt));
	return receipt;
}

export function assertPairInputsV1({ pluginSha, cliSha, platform, arch, nodeVersion }) {
	assert.equal(platform, 'win32', `OPERON_WINDOWS_PAIR_HOST_REQUIRED:${platform}`);
	assert.equal(arch, 'x64', `OPERON_WINDOWS_PAIR_ARCH_MISMATCH:${arch}`);
	assert.equal(nodeVersion, EXPECTED_NODE, `OPERON_WINDOWS_PAIR_NODE_VERSION_MISMATCH:${nodeVersion}`);
	assert.match(pluginSha ?? '', SHA_PATTERN, 'OPERON_WINDOWS_PAIR_PLUGIN_SHA_INVALID');
	assert.match(cliSha ?? '', SHA_PATTERN, 'OPERON_WINDOWS_PAIR_CLI_SHA_INVALID');
}

export function canonicalExistingDirectoryV1(directory) {
	return realpathSync.native(directory);
}

export function assertPluginReceiptV1(receipt, expectedSha) {
	assert.equal(receipt?.kind, 'operon-windows-candidate-validation', 'OPERON_WINDOWS_PAIR_PLUGIN_RECEIPT_KIND');
	assert.equal(receipt?.schemaVersion, 1, 'OPERON_WINDOWS_PAIR_PLUGIN_RECEIPT_SCHEMA');
	assert.equal(receipt?.repository, 'hasanyilmaz/operon', 'OPERON_WINDOWS_PAIR_PLUGIN_REPOSITORY');
	assert.equal(receipt?.status, 'passed', 'OPERON_WINDOWS_PAIR_PLUGIN_STATUS');
	assert.equal(receipt?.releaseEligible, false, 'OPERON_WINDOWS_PAIR_PLUGIN_RELEASE_ELIGIBILITY');
	assert.equal(receipt?.headSha, expectedSha, 'OPERON_WINDOWS_PAIR_PLUGIN_SHA_MISMATCH');
	assert.equal(receipt?.platform, 'win32', 'OPERON_WINDOWS_PAIR_PLUGIN_PLATFORM');
	assert.equal(receipt?.arch, 'x64', 'OPERON_WINDOWS_PAIR_PLUGIN_ARCH');
	assert.deepEqual(receipt?.toolchain, { node: EXPECTED_NODE, npm: EXPECTED_NPM }, 'OPERON_WINDOWS_PAIR_PLUGIN_TOOLCHAIN');
	assert.equal(receipt?.nativeSummary?.fail, 0, 'OPERON_WINDOWS_PAIR_PLUGIN_NATIVE_FAILURE');
	assert.equal(receipt?.nativeSummary?.cancelled, 0, 'OPERON_WINDOWS_PAIR_PLUGIN_NATIVE_CANCELLED');
	assert.equal(receipt?.nativeSummary?.skipped, 0, 'OPERON_WINDOWS_PAIR_PLUGIN_NATIVE_SKIPPED');
	assert.equal(Number.isSafeInteger(receipt?.nativeSummary?.tests) && receipt.nativeSummary.tests > 0, true, 'OPERON_WINDOWS_PAIR_PLUGIN_NATIVE_EMPTY');
	for (const artifact of ['mainJs', 'manifestJson', 'stylesCss']) {
		assert.match(receipt?.artifacts?.[artifact]?.sha256 ?? '', /^[0-9a-f]{64}$/u, `OPERON_WINDOWS_PAIR_PLUGIN_ARTIFACT_INVALID:${artifact}`);
	}
}

export function assertCliReceiptV1(receipt, expectedSha) {
	assert.equal(receipt?.kind, 'operon-cli-windows-candidate-validation-v1', 'OPERON_WINDOWS_PAIR_CLI_RECEIPT_KIND');
	assert.equal(receipt?.schemaVersion, 1, 'OPERON_WINDOWS_PAIR_CLI_RECEIPT_SCHEMA');
	assert.equal(receipt?.repository, 'hasanyilmaz/operon-cli', 'OPERON_WINDOWS_PAIR_CLI_REPOSITORY');
	assert.equal(receipt?.status, 'passed', 'OPERON_WINDOWS_PAIR_CLI_STATUS');
	assert.equal(receipt?.releaseEligible, false, 'OPERON_WINDOWS_PAIR_CLI_RELEASE_ELIGIBILITY');
	assert.equal(receipt?.headSha, expectedSha, 'OPERON_WINDOWS_PAIR_CLI_SHA_MISMATCH');
	assert.equal(receipt?.platform, 'win32', 'OPERON_WINDOWS_PAIR_CLI_PLATFORM');
	assert.equal(receipt?.arch, 'x64', 'OPERON_WINDOWS_PAIR_CLI_ARCH');
	assert.deepEqual(receipt?.toolchain, { node: EXPECTED_NODE, npm: EXPECTED_NPM }, 'OPERON_WINDOWS_PAIR_CLI_TOOLCHAIN');
	assert.equal(receipt?.candidate?.inventory, 48, 'OPERON_WINDOWS_PAIR_CLI_INVENTORY');
	assert.match(receipt?.candidate?.sha256 ?? '', /^[0-9a-f]{64}$/u, 'OPERON_WINDOWS_PAIR_CLI_TARBALL_SHA');
	assert.equal(receipt?.hosted?.assertions, 4, 'OPERON_WINDOWS_PAIR_CLI_HOSTED_ASSERTIONS');
	assert.equal(receipt?.hosted?.skipped, 0, 'OPERON_WINDOWS_PAIR_CLI_HOSTED_SKIPPED');
}

async function decoderParityV1(pluginCheckout, cliRoot) {
	const files = [
		'src/agent-runtime/contracts/v1/decode.ts',
		'src/agent-runtime/extensions/task-workflows-v1/contracts.ts',
		'src/agent-runtime/extensions/task-workflows-v1/decode.ts',
		'contracts/agent-runtime/extensions/task-workflows-v1/extension-manifest.json',
	];
	const hashes = {};
	for (const relative of files) {
		const pluginBytes = await readFile(path.join(pluginCheckout, relative));
		const cliBytes = await readFile(path.join(cliRoot, 'vendor', 'operon-plugin-v1', relative));
		const pluginSha256 = createHash('sha256').update(pluginBytes).digest('hex');
		const cliSha256 = createHash('sha256').update(cliBytes).digest('hex');
		assert.equal(cliSha256, pluginSha256, `OPERON_WINDOWS_PAIR_CONTRACT_PARITY_MISMATCH:${relative}`);
		hashes[relative] = pluginSha256;
	}
	const extensionManifest = JSON.parse(await readFile(path.join(
		pluginCheckout,
		'contracts/agent-runtime/extensions/task-workflows-v1/extension-manifest.json',
	), 'utf8'));
	assert.equal(extensionManifest.baseContractDigest, '407f3a222f8c59a9622038e99e9345d0d34882fd358149b38bce5354ae0ca92b', 'OPERON_WINDOWS_PAIR_EXTENSION_BASE_DIGEST');
	assert.equal(extensionManifest.baseSchemaManifestAggregateSha256, '7cc7826093758c61491551c9ee925440e7641fecc44b953f7ea2c8595eb345fa', 'OPERON_WINDOWS_PAIR_EXTENSION_BASE_SCHEMA');
	assert.equal(extensionManifest.aggregateSha256, '5a5a4c18a225b693054988615f0565f92293f7489b46563aaa1e107118c6fc1c', 'OPERON_WINDOWS_PAIR_EXTENSION_AGGREGATE');
	return {
		status: 'passed',
		baseDecoderSha256: hashes['src/agent-runtime/contracts/v1/decode.ts'],
		taskWorkflowsV1: {
			aggregateSha256: extensionManifest.aggregateSha256,
			files: hashes,
		},
	};
}

function checkoutExactPluginV1(pluginCheckout, pluginSha) {
	run('git', ['init', '--quiet', pluginCheckout]);
	run('git', ['-C', pluginCheckout, 'remote', 'add', 'origin', PLUGIN_REMOTE]);
	run('git', ['-C', pluginCheckout, 'fetch', '--quiet', '--no-tags', '--depth=1', 'origin', pluginSha]);
	assert.equal(run('git', ['-C', pluginCheckout, 'rev-parse', 'FETCH_HEAD'], { capture: true }).trim(), pluginSha, 'OPERON_WINDOWS_PAIR_PLUGIN_FETCH_MISMATCH');
	run('git', ['-C', pluginCheckout, 'checkout', '--quiet', '--detach', 'FETCH_HEAD']);
	assert.equal(exactHeadSha(pluginCheckout), pluginSha, 'OPERON_WINDOWS_PAIR_PLUGIN_HEAD_MISMATCH');
	assertTrackedClean(pluginCheckout, 'PLUGIN-CHECKOUT');
}

function runNpmValidationV1(npmExecPath, cwd, script, extraEnvironment) {
	run(process.execPath, [npmExecPath, 'run', script], {
		cwd,
		environment: { ...process.env, ...extraEnvironment, NO_COLOR: '1' },
	});
}

function exactHeadSha(cwd) {
	const sha = run('git', ['rev-parse', 'HEAD'], { cwd, capture: true }).trim();
	assert.match(sha, SHA_PATTERN, 'OPERON_WINDOWS_PAIR_HEAD_INVALID');
	return sha;
}

function assertTrackedClean(cwd, stage) {
	const dirty = run('git', ['status', '--porcelain=v1', '--untracked-files=no'], { cwd, capture: true }).trim();
	assert.equal(dirty, '', `OPERON_WINDOWS_PAIR_TRACKED_MUTATION:${stage}\n${dirty}`);
	run('git', ['diff', '--check'], { cwd });
}

function requiredNpmExecPathV1(value) {
	assert.equal(typeof value, 'string', 'OPERON_WINDOWS_PAIR_NPM_EXECPATH_MISSING');
	assert.notEqual(value.trim(), '', 'OPERON_WINDOWS_PAIR_NPM_EXECPATH_EMPTY');
	assert.equal(value.includes('\0'), false, 'OPERON_WINDOWS_PAIR_NPM_EXECPATH_NUL');
	const resolved = path.resolve(value);
	const stat = lstatSync(resolved);
	assert.equal(stat.isFile(), true, 'OPERON_WINDOWS_PAIR_NPM_EXECPATH_NOT_FILE');
	assert.equal(stat.isSymbolicLink(), false, 'OPERON_WINDOWS_PAIR_NPM_EXECPATH_SYMLINK');
	assert.equal(realpathSync.native(resolved), resolved, 'OPERON_WINDOWS_PAIR_NPM_EXECPATH_NONCANONICAL');
	return resolved;
}

async function writePairReceiptIfRequestedV1(receipt) {
	const configured = process.env.OPERON_WINDOWS_PAIR_RECEIPT;
	if (configured === undefined) return;
	const target = validateReceiptPathV1(configured, projectRoot);
	await writeReceiptV1(receipt, target);
}

function run(executable, args, options = {}) {
	const result = spawnSync(executable, args, {
		cwd: options.cwd ?? projectRoot,
		encoding: 'utf8',
		stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
		env: options.environment ?? process.env,
		maxBuffer: 64 * 1024 * 1024,
		windowsHide: true,
		shell: false,
	});
	if (result.error || result.status !== 0) {
		throw new Error(`OPERON_WINDOWS_PAIR_COMMAND_FAILED:${executable}:${result.status}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`, { cause: result.error });
	}
	return result.stdout ?? '';
}
