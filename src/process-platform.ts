import { spawn } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { win32 } from 'node:path';

import {
	resolveTrustedWindowsSystemExecutableV1,
	type WindowsSystemPathStatV1,
} from './windows-system';

const WINDOWS_EXECUTABLE_EXTENSIONS_V1 = ['.com', '.exe'] as const;

interface WindowsTerminatorV1 {
	once(event: 'error', listener: () => void): this;
	once(event: 'close', listener: (exitCode: number | null) => void): this;
	unref(): void;
}

export function resolveObsidianExecutableV1(
	value: string,
	options: {
		platform?: NodeJS.Platform;
		env?: NodeJS.ProcessEnv;
		cwd?: string;
		lstat?: (path: string) => WindowsSystemPathStatV1;
	} = {},
): string {
	if (value.length === 0 || value.includes('\0')) throw new Error('OBSIDIAN_BIN_INVALID');
	const platform = options.platform ?? process.platform;
	if (platform !== 'win32') return value;
	const env = options.env ?? process.env;
	const cwd = options.cwd ?? process.cwd();
	const lstat = options.lstat ?? lstatSync;
	if (isWindowsExplicitPathV1(value)) {
		const absolute = win32.isAbsolute(value) ? value : win32.resolve(cwd, value);
		assertWindowsExecutableFileV1(absolute, lstat);
		return absolute;
	}
	const extension = win32.extname(value).toLocaleLowerCase('en-US');
	if (extension && !WINDOWS_EXECUTABLE_EXTENSIONS_V1.includes(
		extension as typeof WINDOWS_EXECUTABLE_EXTENSIONS_V1[number],
	)) throw new Error('OBSIDIAN_BIN_INVALID');
	const candidates = extension
		? [value]
		: WINDOWS_EXECUTABLE_EXTENSIONS_V1.map(candidate => `${value}${candidate}`);
	for (const directory of windowsPathEntriesV1(env)) {
		for (const candidate of candidates) {
			try {
				return assertWindowsExecutableFileV1(win32.join(directory, candidate), lstat);
			} catch (error) {
				if (error instanceof Error && error.message === 'OBSIDIAN_BIN_NOT_FOUND') continue;
				throw error;
			}
		}
	}
	throw new Error('OBSIDIAN_BIN_NOT_FOUND');
}

export function terminateProcessTreeV1(
	pid: number | undefined,
	platform: NodeJS.Platform = process.platform,
	ports: {
		env?: NodeJS.ProcessEnv;
		lstat?: (path: string) => WindowsSystemPathStatV1;
		spawn?: (
			executable: string,
			args: readonly string[],
			options: { stdio: 'ignore'; windowsHide: true; shell: false },
		) => WindowsTerminatorV1;
		kill?: (pid: number, signal: NodeJS.Signals) => void;
	} = {},
): void {
	if (!pid || !Number.isSafeInteger(pid) || pid < 1) return;
	const kill = ports.kill ?? process.kill.bind(process);
	if (platform !== 'win32') {
		try {
			kill(pid, 'SIGTERM');
		} catch {
			// The child may already have exited.
		}
		return;
	}
	let fallbackUsed = false;
	const fallback = () => {
		if (fallbackUsed) return;
		fallbackUsed = true;
		try {
			kill(pid, 'SIGKILL');
		} catch {
			// The target may already have exited.
		}
	};
	let executable: string;
	try {
		executable = resolveTrustedWindowsSystemExecutableV1(['System32', 'taskkill.exe'], {
			env: ports.env,
			lstat: ports.lstat,
			failureCode: 'TASKKILL_UNAVAILABLE',
		}).executable;
	} catch {
		fallback();
		return;
	}
	let terminator: WindowsTerminatorV1;
	try {
		const spawnTerminator = ports.spawn ?? ((command, args, options) => spawn(command, [...args], options));
		terminator = spawnTerminator(
			executable,
			['/pid', String(pid), '/t', '/f'],
			{
				stdio: 'ignore',
				windowsHide: true,
				shell: false,
			},
		);
	} catch {
		fallback();
		return;
	}
	terminator.once('error', fallback);
	terminator.once('close', exitCode => {
		if (exitCode !== 0) fallback();
	});
	terminator.unref();
}

function isWindowsExplicitPathV1(value: string): boolean {
	return value.includes('\\')
		|| value.includes('/')
		|| /^[A-Za-z]:/u.test(value)
		|| value.startsWith('\\\\');
}

function assertWindowsExecutableFileV1(
	path: string,
	lstat: (path: string) => WindowsSystemPathStatV1,
): string {
	const extension = win32.extname(path).toLocaleLowerCase('en-US');
	if (!WINDOWS_EXECUTABLE_EXTENSIONS_V1.includes(
		extension as typeof WINDOWS_EXECUTABLE_EXTENSIONS_V1[number],
	)) throw new Error('OBSIDIAN_BIN_INVALID');
	try {
		const stat = lstat(path);
		if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('OBSIDIAN_BIN_INVALID');
		return path;
	} catch (error) {
		if (
			error
			&& typeof error === 'object'
			&& (error as Record<string, unknown>).code === 'ENOENT'
		) throw new Error('OBSIDIAN_BIN_NOT_FOUND');
		throw error;
	}
}

function windowsPathEntriesV1(env: NodeJS.ProcessEnv): string[] {
	const pathEntries = Object.entries(env).filter(([key]) => key.toLocaleLowerCase('en-US') === 'path');
	const definedValues = pathEntries.map(([, value]) => value).filter((value): value is string => value !== undefined);
	if (definedValues.length === 0) return [];
	const pathValue = definedValues[0];
	if (definedValues.some(value => value !== pathValue)) throw new Error('OBSIDIAN_BIN_INVALID');
	return pathValue.split(win32.delimiter).map(entry => {
		if (entry.length === 0) throw new Error('OBSIDIAN_BIN_INVALID');
		if (entry.includes('\0')) throw new Error('OBSIDIAN_BIN_INVALID');
		const startsQuoted = entry.startsWith('"');
		const endsQuoted = entry.endsWith('"');
		if (startsQuoted !== endsQuoted) throw new Error('OBSIDIAN_BIN_INVALID');
		const unquoted = startsQuoted ? entry.slice(1, -1) : entry;
		if (unquoted.length === 0 || unquoted.includes('"')) throw new Error('OBSIDIAN_BIN_INVALID');
		if (!/^[A-Za-z]:[\\/]/u.test(unquoted) || !win32.isAbsolute(unquoted)) {
			throw new Error('OBSIDIAN_BIN_INVALID');
		}
		return unquoted;
	});
}
