import assert from 'node:assert/strict';
import fs, { type BigIntStats, type PathLike, type StatOptions, type StatSyncOptions } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveOperonInstallationV1 } from '../../src/config';
import { readInputFileSafelyV1 } from '../../src/protocol';

type Identity = Pick<BigIntStats, 'dev' | 'ino' | 'birthtimeNs'>;

const fullIdentity: Identity = {
	dev: BigInt('0x1234567812345678'),
	ino: BigInt('0x20000000000000'),
	birthtimeNs: BigInt('1790000000000000000'),
};
const legacyHandle = { ...fullIdentity, dev: BigInt('0x12345678') };
const manifest = { id: 'operon', version: '4.6.0', minAppVersion: '1.12.2' };

test('the Windows manifest reader admits the legacy libuv serial representation', () => {
	for (const uv of ['1.49.2', '1.50.0']) {
		withWindowsFileStats(uv, fullIdentity, legacyHandle, undefined, (vaultPath, _filePath, pathChecks) => {
			assert.deepEqual(resolveOperonInstallationV1(vaultPath), { configDir: '.obsidian', manifest });
			assert.equal(pathChecks(), 2);
		});
	}
	withWindowsFileStats('1.51.0', fullIdentity, fullIdentity, undefined, (vaultPath, _filePath, pathChecks) => {
		assert.deepEqual(resolveOperonInstallationV1(vaultPath), { configDir: '.obsidian', manifest });
		assert.equal(pathChecks(), 1);
	});
});

test('Windows rejects unrelated, unavailable, or changed file identities', () => {
	const cases: Array<[string, string, Identity, Identity, Partial<BigIntStats>?]> = [
		['new libuv must compare the full serial', '1.51.0', fullIdentity, legacyHandle],
		['unrelated volume', '1.50.0', fullIdentity, { ...legacyHandle, dev: legacyHandle.dev + BigInt(1) }],
		['other full-width serial with the same low bits', '1.50.0', fullIdentity, {
			...legacyHandle, dev: fullIdentity.dev + BigInt('0x100000000'),
		}],
		['different inode beyond Number precision', '1.50.0', fullIdentity, { ...legacyHandle, ino: fullIdentity.ino + BigInt(1) }],
		['zero device', '1.50.0', { ...fullIdentity, dev: BigInt('0x100000000') }, { ...legacyHandle, dev: BigInt(0) }],
		['zero inode', '1.50.0', { ...fullIdentity, ino: BigInt(0) }, { ...legacyHandle, ino: BigInt(0) }],
		['different creation time', '1.50.0', fullIdentity, { ...legacyHandle, birthtimeNs: fullIdentity.birthtimeNs + BigInt(1) }],
		['path replaced after open', '1.50.0', fullIdentity, legacyHandle, { dev: fullIdentity.dev + BigInt('0x100000000') }],
		['path became a symlink', '1.50.0', fullIdentity, legacyHandle, { isSymbolicLink: () => true }],
	];
	for (const [label, uv, original, opened, afterOpen] of cases) {
		withWindowsFileStats(uv, original, opened, afterOpen, (_vaultPath, filePath) => {
			assert.throws(() => readInputFileSafelyV1(filePath), /^Error: INPUT_FILE_CHANGED$/u, label);
		});
	}
});

function withWindowsFileStats(
	uv: string,
	original: Identity,
	opened: Identity,
	afterOpen: Partial<BigIntStats> | undefined,
	check: (vaultPath: string, filePath: string, pathChecks: () => number) => void,
): void {
	const vaultPath = fs.mkdtempSync(path.join(tmpdir(), 'operon-windows-file-identity-'));
	const directory = path.join(vaultPath, '.obsidian', 'plugins', 'operon');
	const filePath = path.join(directory, 'manifest.json');
	const lstat = fs.lstatSync;
	const fstat = fs.fstatSync;
	const platform = process.platform;
	const uvVersion = process.versions.uv;
	let pathChecks = 0;
	try {
		fs.mkdirSync(directory, { recursive: true });
		fs.writeFileSync(filePath, JSON.stringify(manifest));
		Object.defineProperty(process, 'platform', { value: 'win32' });
		Object.defineProperty(process.versions, 'uv', { value: uv });
		const simulatedLstat = (candidate: PathLike, options?: StatSyncOptions) => {
			if (candidate !== filePath) return lstat(candidate, options);
			if (!options?.bigint) {
				return Object.assign(lstat(candidate), { dev: Number(original.dev), ino: Number(original.ino) });
			}
			const stat = lstat(candidate, { bigint: true });
			pathChecks += 1;
			return Object.assign(stat, original, pathChecks > 1 ? afterOpen : undefined);
		};
		const simulatedFstat = (descriptor: number, options?: StatOptions) => (
			options?.bigint
				? Object.assign(fstat(descriptor, { bigint: true }), opened)
				: Object.assign(fstat(descriptor), { dev: Number(opened.dev), ino: Number(opened.ino) })
		);
		Object.defineProperty(fs, 'lstatSync', { value: simulatedLstat });
		Object.defineProperty(fs, 'fstatSync', { value: simulatedFstat });
		syncBuiltinESMExports();
		check(vaultPath, filePath, () => pathChecks);
	} finally {
		Object.defineProperty(fs, 'lstatSync', { value: lstat });
		Object.defineProperty(fs, 'fstatSync', { value: fstat });
		syncBuiltinESMExports();
		Object.defineProperty(process.versions, 'uv', { value: uvVersion });
		Object.defineProperty(process, 'platform', { value: platform });
		fs.rmSync(vaultPath, { recursive: true, force: true });
	}
}
