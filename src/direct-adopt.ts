import { isAbsolute, join, relative } from 'node:path';
import { realpathSync } from 'node:fs';

import { validateVaultRelativePathV1 } from '../vendor/operon-plugin-v1/src/agent-runtime/contracts/v1';
import type { AdoptTaskPreviewIntentV1 } from '../vendor/operon-plugin-v1/src/agent-runtime/extensions/task-workflows-v1/contracts';
import type { GuidedMutationIntentV1 } from './guided-maintenance';
import { readInputFileSafelyV1 } from './protocol';
import { sanitizeTerminalTextV1 } from './terminal-text';

export function compileDirectAdoptIntentV1(options: {
	vaultRoot: string;
	filePath: string | undefined;
	line: string | undefined;
	statusId?: string;
	reopen: boolean;
}): GuidedMutationIntentV1 {
	const filePath = directAdoptMarkdownPathV1(options.filePath);
	const line = Number(options.line);
	if (!Number.isSafeInteger(line) || line < 1) throw new Error('DIRECT_ADOPT_LINE_INVALID');
	const absolutePath = join(options.vaultRoot, filePath);
	const realVaultRoot = realpathSync(options.vaultRoot);
	let realPath: string;
	try {
		realPath = realpathSync(absolutePath);
	} catch {
		throw new Error('DIRECT_ADOPT_FILE_UNAVAILABLE');
	}
	const relativeRealPath = relative(realVaultRoot, realPath);
	if (relativeRealPath.startsWith('..') || isAbsolute(relativeRealPath)) {
		throw new Error('DIRECT_ADOPT_FILE_OUTSIDE_VAULT');
	}
	let content: string;
	try {
		content = new TextDecoder('utf-8', { fatal: true }).decode(readInputFileSafelyV1(absolutePath));
	} catch (error) {
		if (error instanceof TypeError) throw new Error('DIRECT_ADOPT_FILE_UTF8_INVALID');
		throw error;
	}
	const lines = content.split(/\r?\n/u);
	if (line > lines.length) throw new Error('DIRECT_ADOPT_LINE_OUT_OF_RANGE');
	const expectedLine = lines[line - 1];
	const statusId = options.statusId === undefined
		? undefined
		: directAdoptStatusIdV1(options.statusId);
	const spec: AdoptTaskPreviewIntentV1 = {
		operation: 'adopt-inline',
		source: {
			filePath,
			lineNumber: line - 1,
			expectedLine,
		},
		...(statusId ? { statusId } : {}),
		...(options.reopen ? { terminalSourcePolicy: 'reopen' } : {}),
	};
	return {
		contractVersion: 1,
		kind: 'mutation-intent',
		reason: 'The user requested adoption of one exact Markdown checkbox as an Operon task.',
		spec: { ...spec },
	};
}

function directAdoptMarkdownPathV1(raw: string | undefined): string {
	const filePath = raw?.trim() ?? '';
	if (
		!filePath
		|| filePath !== raw
		|| filePath !== filePath.normalize('NFC')
		|| sanitizeTerminalTextV1(filePath) !== filePath
		|| validateVaultRelativePathV1(filePath) !== null
		|| !filePath.endsWith('.md')
	) throw new Error('DIRECT_ADOPT_FILE_INVALID');
	return filePath;
}

function directAdoptStatusIdV1(raw: string): string {
	if (
		!raw
		|| raw !== raw.trim()
		|| raw !== raw.normalize('NFC')
		|| raw.length > 256
		|| sanitizeTerminalTextV1(raw) !== raw
	) throw new Error('DIRECT_ADOPT_STATUS_ID_INVALID');
	return raw;
}
