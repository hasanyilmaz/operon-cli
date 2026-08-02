import { lstatSync } from 'node:fs';
import { win32 } from 'node:path';

export interface WindowsSystemPathStatV1 {
	isFile(): boolean;
	isSymbolicLink(): boolean;
	isDirectory(): boolean;
}

export interface TrustedWindowsSystemExecutableOptionsV1 {
	env?: NodeJS.ProcessEnv;
	lstat?: (path: string) => WindowsSystemPathStatV1;
	failureCode: string;
}

export function resolveTrustedWindowsSystemExecutableV1(
	relativeSegments: readonly string[],
	options: TrustedWindowsSystemExecutableOptionsV1,
): { executable: string; systemRoot: string } {
	const env = options.env ?? process.env;
	const lstat = options.lstat ?? lstatSync;
	const systemRoot = readWindowsEnvironmentValueV1(env, 'SystemRoot', options.failureCode);
	const windowsDirectory = readWindowsEnvironmentValueV1(env, 'WINDIR', options.failureCode);
	if (
		!systemRoot
		|| !windowsDirectory
		|| systemRoot.includes('\0')
		|| windowsDirectory.includes('\0')
		|| !/^[A-Za-z]:[\\/]/u.test(systemRoot)
		|| !/^[A-Za-z]:[\\/]/u.test(windowsDirectory)
		|| !win32.isAbsolute(systemRoot)
		|| !win32.isAbsolute(windowsDirectory)
	) throw new Error(options.failureCode);
	const normalizedRoot = normalizeWindowsRootV1(systemRoot);
	const normalizedWindowsDirectory = normalizeWindowsRootV1(windowsDirectory);
	if (normalizedRoot.toLocaleLowerCase('en-US') !== normalizedWindowsDirectory.toLocaleLowerCase('en-US')) {
		throw new Error(options.failureCode);
	}
	const executable = win32.join(normalizedRoot, ...relativeSegments);
	let cursor = executable;
	while (true) {
		let stat: WindowsSystemPathStatV1;
		try {
			stat = lstat(cursor);
		} catch {
			throw new Error(options.failureCode);
		}
		if (
			stat.isSymbolicLink()
			|| (cursor === executable && !stat.isFile())
			|| (cursor !== executable && !stat.isDirectory())
		) throw new Error(options.failureCode);
		if (windowsPathsEqualV1(cursor, normalizedRoot)) break;
		const parent = win32.dirname(cursor);
		if (parent === cursor) throw new Error(options.failureCode);
		cursor = parent;
	}
	return { executable, systemRoot: normalizedRoot };
}

function readWindowsEnvironmentValueV1(
	env: NodeJS.ProcessEnv,
	name: string,
	failureCode: string,
): string | undefined {
	const matches = Object.entries(env).filter(([key]) => key.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'));
	if (matches.length === 0) return undefined;
	const values = matches.map(([, value]) => value).filter((value): value is string => value !== undefined);
	if (values.length === 0) return undefined;
	const first = values[0];
	if (values.some(value => value.toLocaleLowerCase('en-US') !== first.toLocaleLowerCase('en-US'))) {
		throw new Error(failureCode);
	}
	return first;
}

function normalizeWindowsRootV1(value: string): string {
	return win32.normalize(value).replace(/[\\/]+$/u, '');
}

function windowsPathsEqualV1(left: string, right: string): boolean {
	return win32.normalize(left).toLocaleLowerCase('en-US') === win32.normalize(right).toLocaleLowerCase('en-US');
}
