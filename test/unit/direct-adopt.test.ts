import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { compileDirectAdoptIntentV1 } from '../../src/direct-adopt';

const vault = mkdtempSync(path.join(tmpdir(), 'operon-cli-adopt-vault-'));
const outside = mkdtempSync(path.join(tmpdir(), 'operon-cli-adopt-outside-'));
try {
	writeFileSync(path.join(vault, 'Inbox.md'), [
		'# Inbox',
		'- [ ] Adopt this task',
		'- [x] Reopen this task',
	].join('\r\n'), 'utf8');
	const open = compileDirectAdoptIntentV1({
		vaultRoot: vault,
		filePath: 'Inbox.md',
		line: '2',
		reopen: false,
	});
	assert.deepEqual(open.spec, {
		operation: 'adopt-inline',
		source: {
			filePath: 'Inbox.md',
			lineNumber: 1,
			expectedLine: '- [ ] Adopt this task',
		},
	});
	const terminal = compileDirectAdoptIntentV1({
		vaultRoot: vault,
		filePath: 'Inbox.md',
		line: '3',
		statusId: 'pipeline.open',
		reopen: true,
	});
	assert.equal(terminal.spec.terminalSourcePolicy, 'reopen');
	assert.equal(terminal.spec.statusId, 'pipeline.open');
	assert.throws(() => compileDirectAdoptIntentV1({
		vaultRoot: vault,
		filePath: '../Outside.md',
		line: '1',
		reopen: false,
	}), /DIRECT_ADOPT_FILE_INVALID/u);
	assert.throws(() => compileDirectAdoptIntentV1({
		vaultRoot: vault,
		filePath: 'Inbox.md',
		line: '0',
		reopen: false,
	}), /DIRECT_ADOPT_LINE_INVALID/u);
	assert.throws(() => compileDirectAdoptIntentV1({
		vaultRoot: vault,
		filePath: 'Inbox.md',
		line: '99',
		reopen: false,
	}), /DIRECT_ADOPT_LINE_OUT_OF_RANGE/u);
	writeFileSync(path.join(outside, 'Outside.md'), '- [ ] Outside', 'utf8');
	symlinkSync(outside, path.join(vault, 'linked'));
	assert.throws(() => compileDirectAdoptIntentV1({
		vaultRoot: vault,
		filePath: 'linked/Outside.md',
		line: '1',
		reopen: false,
	}), /DIRECT_ADOPT_FILE_OUTSIDE_VAULT/u);
	console.log('Direct adoption compiler tests passed');
} finally {
	rmSync(vault, { recursive: true, force: true });
	rmSync(outside, { recursive: true, force: true });
}
