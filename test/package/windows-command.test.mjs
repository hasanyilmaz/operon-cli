import assert from 'node:assert/strict';
import test from 'node:test';

import {
	assertWindowsCommandPathSafeV1,
	resolveTrustedWindowsCommandProcessorV1,
} from '../../scripts/windows-command.mjs';

test('trusted Windows command processor requires a local drive root and safe ancestors', () => {
	const inspected = [];
	const executable = resolveTrustedWindowsCommandProcessorV1({
		env: { systemroot: 'C:\\Windows\\', WINDIR: 'c:\\windows' },
		lstat: path => {
			inspected.push(path);
			return stat({ file: path.endsWith('cmd.exe') });
		},
	});
	assert.equal(executable, 'C:\\Windows\\System32\\cmd.exe');
	assert.equal(inspected.at(-1), 'C:\\Windows');
});

test('trusted Windows command processor rejects remote, device, mismatched, and reparse roots', () => {
	for (const env of [
		{},
		{ SystemRoot: 'C:\\Windows', WINDIR: 'D:\\Windows' },
		{ SystemRoot: '\\\\server\\share\\Windows', WINDIR: '\\\\server\\share\\Windows' },
		{ SystemRoot: '\\\\?\\C:\\Windows', WINDIR: '\\\\?\\C:\\Windows' },
		{ SystemRoot: '\\\\.\\C:\\Windows', WINDIR: '\\\\.\\C:\\Windows' },
	]) assert.throws(
		() => resolveTrustedWindowsCommandProcessorV1({ env, lstat: () => stat() }),
		/OPERON_CLI_WINDOWS_COMMAND_PROCESSOR_INVALID/u,
	);
	assert.throws(
		() => resolveTrustedWindowsCommandProcessorV1({
			env: { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows' },
			lstat: path => stat({ file: path.endsWith('cmd.exe'), symbolicLink: path.endsWith('System32') }),
		}),
		/OPERON_CLI_WINDOWS_COMMAND_PROCESSOR_INVALID/u,
	);
});

test('Windows command shim paths reject shell metacharacters and non-local roots', () => {
	assert.equal(
		assertWindowsCommandPathSafeV1('C:\\Temp Folder\\Ünicode\\operon.cmd'),
		'C:\\Temp Folder\\Ünicode\\operon.cmd',
	);
	for (const value of [
		'C:\\Temp&Run\\operon.cmd',
		'C:\\Temp%PATH%\\operon.cmd',
		'C:\\Temp!Delayed!\\operon.cmd',
		'C:\\Temp\\operon.cmd\nwhoami',
		'\\\\server\\share\\operon.cmd',
		'operon.cmd',
	]) assert.throws(
		() => assertWindowsCommandPathSafeV1(value),
		/OPERON_CLI_WINDOWS_COMMAND_PATH_INVALID/u,
	);
});

function stat(options = {}) {
	return {
		isFile: () => options.file ?? false,
		isDirectory: () => !(options.file ?? false),
		isSymbolicLink: () => options.symbolicLink ?? false,
	};
}
