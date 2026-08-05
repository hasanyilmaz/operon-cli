import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
	assertCliReceiptV1,
	assertPairInputsV1,
	assertPluginReceiptV1,
	canonicalExistingDirectoryV1,
} from '../../scripts/operon-validate-windows-pair.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pluginSha = 'a'.repeat(40);
const cliSha = 'b'.repeat(40);

test('pair validator requires native Windows, exact Node, and two full SHAs', () => {
	assert.doesNotThrow(() => assertPairInputsV1({
		pluginSha, cliSha, platform: 'win32', arch: 'x64', nodeVersion: 'v24.18.0',
	}));
	for (const context of [
		{ pluginSha, cliSha, platform: 'darwin', arch: 'x64', nodeVersion: 'v24.18.0' },
		{ pluginSha, cliSha, platform: 'win32', arch: 'arm64', nodeVersion: 'v24.18.0' },
		{ pluginSha, cliSha, platform: 'win32', arch: 'x64', nodeVersion: 'v24.17.0' },
		{ pluginSha: 'main', cliSha, platform: 'win32', arch: 'x64', nodeVersion: 'v24.18.0' },
		{ pluginSha, cliSha: 'refs/heads/main', platform: 'win32', arch: 'x64', nodeVersion: 'v24.18.0' },
	]) assert.throws(() => assertPairInputsV1(context));
});

test('pair validator canonicalizes its existing temporary root before nested validation', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'operon-pair-root-'));
	try {
		await mkdir(path.join(root, 'child'));
		assert.equal(canonicalExistingDirectoryV1(path.join(root, 'child', '..')), canonicalExistingDirectoryV1(root));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('pair validator accepts only exact non-release Plugin and CLI evidence', () => {
	const pluginReceipt = {
		kind: 'operon-windows-candidate-validation',
		schemaVersion: 1,
		repository: 'hasanyilmaz/operon',
		status: 'passed',
		releaseEligible: false,
		headSha: pluginSha,
		platform: 'win32',
		arch: 'x64',
		toolchain: { node: 'v24.18.0', npm: '11.12.1' },
		nativeSummary: { tests: 22, fail: 0, cancelled: 0, skipped: 0 },
		artifacts: {
			mainJs: { sha256: '1'.repeat(64) },
			manifestJson: { sha256: '2'.repeat(64) },
			stylesCss: { sha256: '3'.repeat(64) },
		},
	};
	const cliReceipt = {
		kind: 'operon-cli-windows-candidate-validation-v1',
		schemaVersion: 1,
		repository: 'hasanyilmaz/operon-cli',
		status: 'passed',
		releaseEligible: false,
		headSha: cliSha,
		platform: 'win32',
		arch: 'x64',
		toolchain: { node: 'v24.18.0', npm: '11.12.1' },
		candidate: { inventory: 41, sha256: '4'.repeat(64) },
		hosted: { assertions: 4, skipped: 0 },
	};
	assert.doesNotThrow(() => assertPluginReceiptV1(pluginReceipt, pluginSha));
	assert.doesNotThrow(() => assertCliReceiptV1(cliReceipt, cliSha));
	assert.throws(() => assertPluginReceiptV1({ ...pluginReceipt, releaseEligible: true }, pluginSha));
	assert.throws(() => assertPluginReceiptV1({ ...pluginReceipt, nativeSummary: { ...pluginReceipt.nativeSummary, skipped: 1 } }, pluginSha));
	assert.throws(() => assertCliReceiptV1({ ...cliReceipt, candidate: { ...cliReceipt.candidate, inventory: 40 } }, cliSha));
	assert.throws(() => assertCliReceiptV1({ ...cliReceipt, hosted: { assertions: 4, skipped: 1 } }, cliSha));
});

test('pair workflow is read-only, pinned, and delegates to the canonical pair runner', async () => {
	const workflow = await readFile(path.join(projectRoot, '.github', 'workflows', 'windows-pair-validation.yml'), 'utf8');
	assert.equal(
		createHash('sha256').update(workflow).digest('hex'),
		'95c2a5e2735668b16f8eead05bedf752a9d8cab02964851448456f53a5aa8cac',
		'OPERON_WINDOWS_PAIR_WORKFLOW_DIGEST_MISMATCH',
	);
	for (const required of [
		'workflow_dispatch:',
		'permissions:\n  contents: read',
		'runs-on: windows-2022',
		'persist-credentials: false',
		'ref: ${{ inputs.cli_sha }}',
		'node-version: 24.18.0',
		'node scripts/hosted-validation.mjs acquire-npm "${{ runner.temp }}/operon-npm"',
		'node --test test/package/windows-pair-validation.test.mjs',
		'OPERON_PLUGIN_SHA: ${{ inputs.plugin_sha }}',
		'OPERON_CLI_SHA: ${{ inputs.cli_sha }}',
		'run validate:windows:pair -- "$env:OPERON_PLUGIN_SHA" "$env:OPERON_CLI_SHA"',
		'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
		'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
	]) assert.ok(workflow.includes(required), `missing pair workflow policy text: ${required}`);
	for (const forbidden of [
		'pull_request_target', 'push:', 'schedule:', 'contents: write', 'id-token:',
		'secrets.', 'actions/upload-artifact@', 'npm publish', 'npm dist-tag',
	]) assert.equal(workflow.includes(forbidden), false, `forbidden pair workflow policy text: ${forbidden}`);
	for (const match of workflow.matchAll(/uses:\s+([^\s#]+)/gu)) {
		assert.match(match[1] ?? '', /^[^@\s]+@[0-9a-f]{40}$/u);
	}
});

test('pair tooling remains development-only and does not add a public npm binary', async () => {
	const packageDocument = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
	const windowsWrapper = await readFile(path.join(projectRoot, 'operon-validate-windows-pair.cmd'), 'utf8');
	assert.equal(
		packageDocument.scripts['validate:windows:pair'],
		'node scripts/operon-validate-windows-pair.mjs',
	);
	assert.deepEqual(packageDocument.bin, { operon: './dist/operon.mjs' });
	assert.equal(packageDocument.files.some(value => value.startsWith('scripts/')), false);
	assert.equal(
		windowsWrapper,
		'@ECHO OFF\nIF "%~1"=="" EXIT /B 64\nIF "%~2"=="" EXIT /B 64\nIF NOT "%~3"=="" EXIT /B 64\nCALL npm run validate:windows:pair -- "%~1" "%~2"\nEXIT /B %ERRORLEVEL%\n',
	);
});
