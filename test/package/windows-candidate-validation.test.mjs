import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
	assertWindowsBootstrapAcceptanceV1,
	assertWindowsCandidateHostV1,
	parsePassedJsonLineV1,
	throwValidationFailuresV1,
	validateReceiptPathV1,
	writeReceiptV1,
} from '../../scripts/windows-candidate-validation.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('package exposes the canonical Windows candidate entrypoint', async () => {
	const packageDocument = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
	assert.equal(packageDocument.scripts['validate:windows:candidate'], 'node scripts/windows-candidate-validation.mjs');
});

test('Windows candidate validation rejects non-Windows hosts and toolchain drift', () => {
	assert.throws(() => assertWindowsCandidateHostV1('darwin', 'v24.18.0'), /HOST_REQUIRED/u);
	assert.throws(() => assertWindowsCandidateHostV1('win32', 'v24.17.0'), /NODE_VERSION_MISMATCH/u);
	assert.doesNotThrow(() => assertWindowsCandidateHostV1('win32', 'v24.18.0'));
});

test('Windows candidate evidence parser requires a matching passed JSON line', () => {
	const output = 'diagnostic\n{"status":"passed","platform":"win32","skipped":0,"assertions":4}\n';
	assert.deepEqual(parsePassedJsonLineV1(output, value => value.platform === 'win32'), {
		status: 'passed', platform: 'win32', skipped: 0, assertions: 4,
	});
	assert.throws(() => parsePassedJsonLineV1('{"status":"failed"}\n'), /EVIDENCE_MISSING/u);
});

test('Windows bootstrap acceptance requires every mandatory portable cell', () => {
	const acceptance = {
		kind: 'operon-cli-windows-bootstrap-acceptance-v1',
		status: 'passed',
		assertions: {
			strictEnvelopeAndNonce: 'passed',
			secureAtomicDescriptorContract: 'passed',
			cachedSecondUse: 'passed',
			restartAndStaleRefresh: 'passed',
			concurrentColdStart: 'passed',
			postFrameNoReplay: 'passed',
			mutationApplyNoReplay: 'passed',
			cancellationAndRedaction: 'passed',
		},
	};
	assert.doesNotThrow(() => assertWindowsBootstrapAcceptanceV1(acceptance));
	assert.throws(
		() => assertWindowsBootstrapAcceptanceV1({
			...acceptance,
			assertions: { ...acceptance.assertions, postFrameNoReplay: 'failed' },
		}),
		/ACCEPTANCE_MATRIX/u,
	);
});

test('Windows candidate receipt must be absolute and outside the repository', () => {
	assert.throws(() => validateReceiptPathV1('receipt.json', projectRoot), /RECEIPT_RELATIVE/u);
	assert.throws(
		() => validateReceiptPathV1(path.join(projectRoot, 'receipt.json'), projectRoot),
		/RECEIPT_INSIDE_REPOSITORY/u,
	);
	assert.equal(
		validateReceiptPathV1(path.join(path.dirname(projectRoot), 'receipt.json'), projectRoot),
		path.join(path.dirname(projectRoot), 'receipt.json'),
	);
});

test('Windows candidate receipt rejects an external spelling that resolves inside the repository', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'operon-cli-windows-receipt-path-'));
	const repository = path.join(root, 'repository');
	const linkedRepository = path.join(root, 'linked-repository');
	try {
		await mkdir(path.join(repository, 'receipts'), { recursive: true });
		await symlink(repository, linkedRepository, process.platform === 'win32' ? 'junction' : 'dir');
		assert.throws(
			() => validateReceiptPathV1(path.join(linkedRepository, 'receipts', 'receipt.json'), repository),
			/RECEIPT_INSIDE_REPOSITORY/u,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('Windows candidate receipt is created atomically and never overwrites evidence', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'operon-cli-windows-receipt-'));
	const target = path.join(root, 'receipt.json');
	try {
		await writeReceiptV1({ kind: 'test', status: 'passed' }, target);
		assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), { kind: 'test', status: 'passed' });
		await assert.rejects(() => writeReceiptV1({ kind: 'replacement' }, target), error => error?.code === 'EEXIST');
		assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), { kind: 'test', status: 'passed' });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('Windows candidate validation preserves primary and postflight failures', () => {
	const primary = new Error('primary');
	const postflight = new Error('postflight');
	assert.throws(
		() => throwValidationFailuresV1(primary, [postflight]),
		error => error instanceof AggregateError
			&& error.errors[0] === primary
			&& error.errors[1] === postflight,
	);
	assert.throws(() => throwValidationFailuresV1(primary, []), error => error === primary);
	assert.doesNotThrow(() => throwValidationFailuresV1(undefined, []));
});
