import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import {
	EXPECTED_PACKAGE_PATHS_V1,
	normalizeOperonPackageTarballV1,
} from '../../scripts/package-archive.mjs';

test('package normalizer restores the canonical executable mode and is idempotent', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'operon-package-normalize-'));
	try {
		const target = path.join(root, 'candidate.tgz');
		await writeFile(target, createFixture({ executableMode: 0o644 }));
		if (process.version === 'v24.18.0') {
			const normalized = await normalizeOperonPackageTarballV1(target);
			const executable = normalized.entries.find(entry => entry.path === 'package/dist/operon.mjs');
			assert.equal(executable?.mode, 0o755);
			const first = await readFile(target);
			await normalizeOperonPackageTarballV1(target);
			assert.equal((await readFile(target)).equals(first), true);
		} else {
			await assert.rejects(
				normalizeOperonPackageTarballV1(target),
				new RegExp(`OPERON_CLI_PACKAGE_NORMALIZE_NODE_MISMATCH:${process.version.replaceAll('.', '\\.')}`, 'u'),
			);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('package normalizer rejects checksum, type, inventory, and mode drift', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'operon-package-normalize-negative-'));
	try {
		for (const [name, fixture, pattern] of [
			['checksum', createFixture({ corruptChecksum: true }), /OPERON_CLI_PACKAGE_NORMALIZE_CHECKSUM_INVALID/u],
			['type', createFixture({ forbiddenType: true }), /OPERON_CLI_PACKAGE_NORMALIZE_TYPE_FORBIDDEN/u],
			['duplicate', createFixture({ duplicatePath: true }), /OPERON_CLI_PACKAGE_NORMALIZE_PATH_INVALID/u],
			['executable-mode', createFixture({ executableMode: 0o600 }), /OPERON_CLI_PACKAGE_NORMALIZE_EXECUTABLE_MODE_INVALID/u],
			['executable-setuid', createFixture({ executableMode: 0o4755 }), /OPERON_CLI_PACKAGE_NORMALIZE_EXECUTABLE_MODE_INVALID/u],
			['ordinary-mode', createFixture({ ordinaryMode: 0o755 }), /OPERON_CLI_PACKAGE_NORMALIZE_MODE_INVALID/u],
			['ordinary-setuid', createFixture({ ordinaryMode: 0o4644 }), /OPERON_CLI_PACKAGE_NORMALIZE_MODE_INVALID/u],
		]) {
			const target = path.join(root, `${name}.tgz`);
			await writeFile(target, fixture);
			await assert.rejects(normalizeOperonPackageTarballV1(target), pattern);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

function createFixture({
	executableMode = 0o755,
	ordinaryMode = 0o644,
	corruptChecksum = false,
	forbiddenType = false,
	duplicatePath = false,
} = {}) {
	const blocks = [];
	for (let index = 0; index < EXPECTED_PACKAGE_PATHS_V1.length; index += 1) {
		let entryPath = EXPECTED_PACKAGE_PATHS_V1[index];
		if (duplicatePath && index === EXPECTED_PACKAGE_PATHS_V1.length - 1) {
			entryPath = EXPECTED_PACKAGE_PATHS_V1[0];
		}
		const content = Buffer.from(`entry-${index}\n`);
		const header = Buffer.alloc(512);
		header.write(entryPath, 0, 100, 'utf8');
		const mode = entryPath === 'package/dist/operon.mjs' ? executableMode : ordinaryMode;
		writeNpmOctal(header, 100, 8, mode);
		writeNpmOctal(header, 108, 8, 0);
		writeNpmOctal(header, 116, 8, 0);
		writeNpmOctal(header, 124, 12, content.length);
		writeNpmOctal(header, 136, 12, 0);
		header.fill(0x20, 148, 156);
		header[156] = forbiddenType && index === 0 ? '2'.charCodeAt(0) : '0'.charCodeAt(0);
		header.write('ustar\0', 257, 6, 'ascii');
		writeChecksum(header);
		if (corruptChecksum && index === 0) header[148] ^= 1;
		blocks.push(header, content, Buffer.alloc((512 - content.length % 512) % 512));
	}
	blocks.push(Buffer.alloc(1024));
	const compressed = gzipSync(Buffer.concat(blocks), { level: 9, mtime: 0 });
	compressed[9] = 0xff;
	return compressed;
}

function writeNpmOctal(buffer, offset, length, value) {
	const digits = value.toString(8).padStart(length - 2, '0');
	buffer.set(Buffer.from(`${digits} \0`, 'ascii'), offset);
}

function writeChecksum(header) {
	header.fill(0x20, 148, 156);
	const checksum = header.reduce((sum, byte) => sum + byte, 0);
	header.set(Buffer.from(`${checksum.toString(8).padStart(6, '0')} \0`, 'ascii'), 148);
}
