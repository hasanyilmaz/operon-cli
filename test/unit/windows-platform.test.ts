import assert from 'node:assert/strict';

import {
	resolveObsidianExecutableV1,
	terminateProcessTreeV1,
} from '../../src/process-platform';
import { resolveWindowsPowerShellV1 } from '../../src/secure-storage';

declare global {
	var __operonWindowsPlatformTestRun: Promise<void> | undefined;
}

globalThis.__operonWindowsPlatformTestRun = Promise.resolve().then(run);

function run(): void {
	testObsidianExtensionPriorityAndFallback();
	testObsidianExplicitPathsAndInvalidTargets();
	testWindowsPathParsing();
	testTrustedPowerShellResolution();
	testTaskkillInvocationAndSingleFallback();
	console.log('Windows platform contract tests passed');
}

function testObsidianExtensionPriorityAndFallback(): void {
	const attempts: string[] = [];
	const resolved = resolveObsidianExecutableV1('obsidian', {
		platform: 'win32',
		env: { Path: 'C:\\Apps' },
		lstat: path => {
			attempts.push(path);
			if (path.endsWith('.com')) return fileStat();
			throw notFound();
		},
	});
	assert.equal(resolved, 'C:\\Apps\\obsidian.com');
	assert.deepEqual(attempts, ['C:\\Apps\\obsidian.com']);

	const fallbackAttempts: string[] = [];
	const fallback = resolveObsidianExecutableV1('obsidian', {
		platform: 'win32',
		env: { PATH: 'C:\\Apps' },
		lstat: path => {
			fallbackAttempts.push(path);
			if (path.endsWith('.exe')) return fileStat();
			throw notFound();
		},
	});
	assert.equal(fallback, 'C:\\Apps\\obsidian.exe');
	assert.deepEqual(fallbackAttempts, [
		'C:\\Apps\\obsidian.com',
		'C:\\Apps\\obsidian.exe',
	]);
}

function testObsidianExplicitPathsAndInvalidTargets(): void {
	for (const explicit of [
		'\\\\server\\share\\Obsidian.com',
		'\\\\?\\C:\\Program Files\\Obsidian\\Obsidian.exe',
	]) {
		let inspected = '';
		const resolved = resolveObsidianExecutableV1(explicit, {
			platform: 'win32',
			lstat: path => {
				inspected = path;
				return fileStat();
			},
		});
		assert.equal(resolved, explicit);
		assert.equal(inspected, explicit);
	}

	for (const invalid of [
		'C:\\Apps\\obsidian',
		'C:\\Apps\\obsidian.cmd',
		'C:\\Apps\\obsidian.bat',
		'C:\\Apps\\obsidian.exe\0ignored',
	]) assert.throws(
		() => resolveObsidianExecutableV1(invalid, { platform: 'win32', lstat: () => fileStat() }),
		{ message: 'OBSIDIAN_BIN_INVALID' },
	);
	assert.throws(
		() => resolveObsidianExecutableV1('C:\\Apps\\obsidian.exe', {
			platform: 'win32',
			lstat: () => fileStat({ symbolicLink: true }),
		}),
		{ message: 'OBSIDIAN_BIN_INVALID' },
	);
	assert.throws(
		() => resolveObsidianExecutableV1('C:\\Apps\\obsidian.exe', {
			platform: 'win32',
			lstat: () => fileStat({ file: false }),
		}),
		{ message: 'OBSIDIAN_BIN_INVALID' },
	);
}

function testWindowsPathParsing(): void {
	const attempts: string[] = [];
	const resolved = resolveObsidianExecutableV1('obsidian.exe', {
		platform: 'win32',
		env: { pAtH: '"C:\\Program Files\\Ünicode Apps";D:\\Other' },
		lstat: path => {
			attempts.push(path);
			if (path.startsWith('C:')) return fileStat();
			throw notFound();
		},
	});
	assert.equal(resolved, 'C:\\Program Files\\Ünicode Apps\\obsidian.exe');
	assert.deepEqual(attempts, ['C:\\Program Files\\Ünicode Apps\\obsidian.exe']);

	for (const pathValue of [
		'"C:\\Program Files;D:\\Other',
		'C:\\Apps";D:\\Other',
		'"C:\\Apps"garbage";D:\\Other',
		'C:\\Apps\0;D:\\Other',
		'.\\tools',
		'tools',
		';C:\\Apps',
		'C:\\Apps;',
		'\\\\server\\share\\Apps',
		'\\\\?\\C:\\Apps',
	]) assert.throws(
		() => resolveObsidianExecutableV1('obsidian', {
			platform: 'win32',
			env: { PATH: pathValue },
			lstat: () => fileStat(),
		}),
		{ message: 'OBSIDIAN_BIN_INVALID' },
	);
	assert.throws(
		() => resolveObsidianExecutableV1('obsidian', {
			platform: 'win32',
			env: { PATH: 'C:\\Trusted', Path: 'C:\\Untrusted' },
			lstat: () => fileStat(),
		}),
		{ message: 'OBSIDIAN_BIN_INVALID' },
	);
}

function testTrustedPowerShellResolution(): void {
	const inspected: string[] = [];
	const result = resolveWindowsPowerShellV1({
		env: { systemroot: 'C:\\Windows\\', windir: 'c:\\windows' },
		lstat: path => {
			inspected.push(path);
			return fileStat();
		},
	});
	assert.deepEqual(result, {
		executable: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
		systemRoot: 'C:\\Windows',
	});
	assert.equal(inspected.at(-1), 'C:\\Windows');

	for (const env of [
		{ WINDIR: 'C:\\Windows' },
		{ SystemRoot: 'C:\\Windows' },
		{ SystemRoot: 'Windows', WINDIR: 'Windows' },
		{ SystemRoot: 'C:\\Windows', WINDIR: 'D:\\Windows' },
		{ SystemRoot: 'C:\\Windows\0', WINDIR: 'C:\\Windows\0' },
		{ SystemRoot: '\\\\server\\share\\Windows', WINDIR: '\\\\server\\share\\Windows' },
		{ SystemRoot: '\\\\?\\C:\\Windows', WINDIR: '\\\\?\\C:\\Windows' },
		{ SystemRoot: '\\\\.\\C:\\Windows', WINDIR: '\\\\.\\C:\\Windows' },
	]) assert.throws(
		() => resolveWindowsPowerShellV1({ env, lstat: () => fileStat() }),
		{ message: 'SECURITY_ACL_UNAVAILABLE' },
	);
	assert.throws(
		() => resolveWindowsPowerShellV1({
			env: trustedWindowsEnvironment(),
			lstat: path => fileStat({ symbolicLink: path.endsWith('System32') }),
		}),
		{ message: 'SECURITY_ACL_UNAVAILABLE' },
	);
	assert.throws(
		() => resolveWindowsPowerShellV1({
			env: trustedWindowsEnvironment(),
			lstat: path => fileStat({ file: path.endsWith('powershell.exe'), directory: false }),
		}),
		{ message: 'SECURITY_ACL_UNAVAILABLE' },
	);
}

function testTaskkillInvocationAndSingleFallback(): void {
	const terminator = new FakeTerminator();
	let invocation: {
		executable: string;
		args: readonly string[];
		options: { stdio: 'ignore'; windowsHide: true; shell: false };
	} | undefined;
	const kills: Array<[number, NodeJS.Signals]> = [];
	terminateProcessTreeV1(42, 'win32', {
		env: trustedWindowsEnvironment(),
		lstat: () => fileStat(),
		spawn: (executable, args, options) => {
			invocation = { executable, args, options };
			return terminator;
		},
		kill: (pid, signal) => { kills.push([pid, signal]); },
	});
	assert.deepEqual(invocation, {
		executable: 'C:\\Windows\\System32\\taskkill.exe',
		args: ['/pid', '42', '/t', '/f'],
		options: { stdio: 'ignore', windowsHide: true, shell: false },
	});
	assert.equal(terminator.unrefCalled, true);
	terminator.error?.();
	terminator.close?.(1);
	assert.deepEqual(kills, [[42, 'SIGKILL']]);

	let unsafeSpawnCalled = false;
	const resolverFallbacks: Array<[number, NodeJS.Signals]> = [];
	terminateProcessTreeV1(43, 'win32', {
		env: {},
		spawn: () => {
			unsafeSpawnCalled = true;
			return new FakeTerminator();
		},
		kill: (pid, signal) => { resolverFallbacks.push([pid, signal]); },
	});
	assert.equal(unsafeSpawnCalled, false);
	assert.deepEqual(resolverFallbacks, [[43, 'SIGKILL']]);

	const spawnFallbacks: Array<[number, NodeJS.Signals]> = [];
	terminateProcessTreeV1(44, 'win32', {
		env: trustedWindowsEnvironment(),
		lstat: () => fileStat(),
		spawn: () => { throw new Error('spawn failed'); },
		kill: (pid, signal) => { spawnFallbacks.push([pid, signal]); },
	});
	assert.deepEqual(spawnFallbacks, [[44, 'SIGKILL']]);
}

class FakeTerminator {
	error?: () => void;
	close?: (exitCode: number | null) => void;
	unrefCalled = false;

	once(event: 'error', listener: () => void): this;
	once(event: 'close', listener: (exitCode: number | null) => void): this;
	once(
		event: 'error' | 'close',
		listener: (() => void) | ((exitCode: number | null) => void),
	): this {
		if (event === 'error') this.error = listener as () => void;
		else this.close = listener as (exitCode: number | null) => void;
		return this;
	}

	unref(): void {
		this.unrefCalled = true;
	}
}

function trustedWindowsEnvironment(): NodeJS.ProcessEnv {
	return { SystemRoot: 'C:\\Windows', WINDIR: 'c:\\windows' };
}

function fileStat(options: { file?: boolean; symbolicLink?: boolean; directory?: boolean } = {}): {
	isFile(): boolean;
	isSymbolicLink(): boolean;
	isDirectory(): boolean;
} {
	return {
		isFile: () => options.file ?? true,
		isSymbolicLink: () => options.symbolicLink ?? false,
		isDirectory: () => options.directory ?? !(options.file ?? false),
	};
}

function notFound(): NodeJS.ErrnoException {
	const error = new Error('not found') as NodeJS.ErrnoException;
	error.code = 'ENOENT';
	return error;
}
