import { lstatSync } from 'node:fs';
import path from 'node:path';

const FAILURE = 'OPERON_CLI_WINDOWS_COMMAND_PROCESSOR_INVALID';

export function resolveTrustedWindowsCommandProcessorV1(options = {}) {
	const environment = options.env ?? process.env;
	const lstat = options.lstat ?? lstatSync;
	const systemRoot = readEnvironmentValueV1(environment, 'SystemRoot');
	const windowsDirectory = readEnvironmentValueV1(environment, 'WINDIR');
	if (
		!systemRoot
		|| !windowsDirectory
		|| systemRoot.includes('\0')
		|| windowsDirectory.includes('\0')
		|| !/^[A-Za-z]:[\\/]/u.test(systemRoot)
		|| !/^[A-Za-z]:[\\/]/u.test(windowsDirectory)
		|| !path.win32.isAbsolute(systemRoot)
		|| !path.win32.isAbsolute(windowsDirectory)
	) throw new Error(FAILURE);
	const normalizedRoot = normalizeRootV1(systemRoot);
	const normalizedWindowsDirectory = normalizeRootV1(windowsDirectory);
	if (normalizedRoot.toLocaleLowerCase('en-US') !== normalizedWindowsDirectory.toLocaleLowerCase('en-US')) {
		throw new Error(FAILURE);
	}
	const executable = path.win32.join(normalizedRoot, 'System32', 'cmd.exe');
	let cursor = executable;
	while (true) {
		let stat;
		try {
			stat = lstat(cursor);
		} catch {
			throw new Error(FAILURE);
		}
		if (
			stat.isSymbolicLink()
			|| (cursor === executable && !stat.isFile())
			|| (cursor !== executable && !stat.isDirectory())
		) throw new Error(FAILURE);
		if (samePathV1(cursor, normalizedRoot)) break;
		const parent = path.win32.dirname(cursor);
		if (parent === cursor) throw new Error(FAILURE);
		cursor = parent;
	}
	return executable;
}

export function assertWindowsCommandPathSafeV1(value) {
	if (
		typeof value !== 'string'
		|| value.length === 0
		|| /[\0\r\n"&|<>^%!]/u.test(value)
		|| !/^[A-Za-z]:[\\/]/u.test(value)
		|| !path.win32.isAbsolute(value)
	) throw new Error('OPERON_CLI_WINDOWS_COMMAND_PATH_INVALID');
	return value;
}

function readEnvironmentValueV1(environment, name) {
	const values = Object.entries(environment)
		.filter(([key]) => key.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'))
		.map(([, value]) => value)
		.filter(value => typeof value === 'string');
	if (values.length === 0) return undefined;
	if (values.some(value => value.toLocaleLowerCase('en-US') !== values[0].toLocaleLowerCase('en-US'))) {
		throw new Error(FAILURE);
	}
	return values[0];
}

function normalizeRootV1(value) {
	return path.win32.normalize(value).replace(/[\\/]+$/u, '');
}

function samePathV1(left, right) {
	return path.win32.normalize(left).toLocaleLowerCase('en-US')
		=== path.win32.normalize(right).toLocaleLowerCase('en-US');
}
