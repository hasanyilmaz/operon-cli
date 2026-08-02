import { createHash } from 'node:crypto';
import { lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';

const TAR_BLOCK_BYTES = 512;
export const EXPECTED_PACKAGE_PATHS_V1 = Object.freeze([
	'package/cli-manifest-v1.json', 'package/dist/operon.mjs',
	'package/examples/developer-api-consumer/main.ts', 'package/examples/developer-api-consumer/manifest.json',
	'package/examples/developer-api-consumer/package.json', 'package/examples/developer-api-consumer/README.md',
	'package/examples/developer-api-consumer/tsconfig.json', 'package/LICENSE', 'package/package.json', 'package/README.md',
	'package/schemas/v1/capabilities.schema.json', 'package/schemas/v1/catalog.schema.json',
	'package/schemas/v1/cli-manifest.schema.json', 'package/schemas/v1/cli.schema.json',
	'package/schemas/v1/common.schema.json', 'package/schemas/v1/compatibility.schema.json',
	'package/schemas/v1/context.schema.json', 'package/schemas/v1/developer-api.schema.json',
	'package/schemas/v1/lifecycle.schema.json', 'package/schemas/v1/mutation.schema.json',
	'package/schemas/v1/operon-cli-local.schema.json', 'package/schemas/v1/read.schema.json',
	'package/schemas/v1/schema-manifest.json', 'package/schemas/v1/schema-manifest.schema.json',
	'package/schemas/v1/session.schema.json', 'package/schemas/v1/timer.schema.json',
	'package/types/not-exported.d.ts', 'package/types/src/agent-runtime/contracts/v1/capabilities.d.ts',
	'package/types/src/agent-runtime/contracts/v1/catalog.d.ts', 'package/types/src/agent-runtime/contracts/v1/cli.d.ts',
	'package/types/src/agent-runtime/contracts/v1/context.d.ts', 'package/types/src/agent-runtime/contracts/v1/identity.d.ts',
	'package/types/src/agent-runtime/contracts/v1/lifecycle.d.ts', 'package/types/src/agent-runtime/contracts/v1/mutation.d.ts',
	'package/types/src/agent-runtime/contracts/v1/primitives.d.ts', 'package/types/src/agent-runtime/contracts/v1/timer.d.ts',
	'package/types/src/agent-runtime/public/v1/cli.d.ts', 'package/types/src/agent-runtime/public/v1/developer-api.d.ts',
	'package/types/src/agent-runtime/public/v1/index.d.ts', 'package/types/src/agent-runtime/public/v1/runtime.d.ts',
	'package/types/src/agent-runtime/public/v1/shared.d.ts',
]);

export async function inspectPackageTarballV1(tarballPath) {
	const compressed = await readFile(tarballPath);
	const archive = gunzipSync(compressed);
	const entries = [];
	const seenPaths = new Set();
	let offset = 0;
	while (offset + TAR_BLOCK_BYTES <= archive.length) {
		const header = archive.subarray(offset, offset + TAR_BLOCK_BYTES);
		if (header.every(byte => byte === 0)) break;
		const name = readString(header, 0, 100);
		const prefix = readString(header, 345, 155);
		const path = prefix ? `${prefix}/${name}` : name;
		if (
			path.length === 0
			|| path.startsWith('/')
			|| path.includes('\\')
			|| path.split('/').some(segment => segment === '' || segment === '.' || segment === '..')
			|| seenPaths.has(path)
		) throw new Error(`OPERON_CLI_PACKAGE_ARCHIVE_PATH_INVALID:${path}`);
		seenPaths.add(path);
		const mode = readOctal(header, 100, 8) & 0o7777;
		const size = readOctal(header, 124, 12);
		const type = String.fromCharCode(header[156] ?? 0);
		const contentStart = offset + TAR_BLOCK_BYTES;
		const contentEnd = contentStart + size;
		if (contentEnd > archive.length) throw new Error('OPERON_CLI_PACKAGE_ARCHIVE_TRUNCATED');
		if (type === '\0' || type === '0') {
			entries.push({
				path,
				mode,
				size,
				sha256: createHash('sha256').update(archive.subarray(contentStart, contentEnd)).digest('hex'),
				content: Buffer.from(archive.subarray(contentStart, contentEnd)),
			});
		} else if (type !== '5') {
			throw new Error(`OPERON_CLI_PACKAGE_ARCHIVE_TYPE_FORBIDDEN:${type}:${path}`);
		}
		offset = contentStart + Math.ceil(size / TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES;
	}
	entries.sort((left, right) => left.path.localeCompare(right.path, 'en'));
	return {
		bytes: compressed.length,
		sha256: createHash('sha256').update(compressed).digest('hex'),
		sha512: createHash('sha512').update(compressed).digest('base64'),
		entries,
	};
}

export async function normalizeOperonPackageTarballV1(tarballPath) {
	const sourceStat = await lstat(tarballPath);
	if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
		throw new Error('OPERON_CLI_PACKAGE_NORMALIZE_SOURCE_INVALID');
	}
	const compressed = await readFile(tarballPath);
	const archive = gunzipSync(compressed);
	const seenPaths = new Set();
	let executableHeader;
	let offset = 0;
	let terminated = false;
	while (offset + TAR_BLOCK_BYTES <= archive.length) {
		const header = archive.subarray(offset, offset + TAR_BLOCK_BYTES);
		if (header.every(byte => byte === 0)) {
			if (archive.length - offset < TAR_BLOCK_BYTES * 2 || !archive.subarray(offset).every(byte => byte === 0)) {
				throw new Error('OPERON_CLI_PACKAGE_NORMALIZE_TERMINATOR_INVALID');
			}
			terminated = true;
			break;
		}
		assertTarHeaderChecksum(header);
		const name = readString(header, 0, 100);
		const prefix = readString(header, 345, 155);
		const entryPath = prefix ? `${prefix}/${name}` : name;
		if (
			entryPath.length === 0
			|| entryPath.startsWith('/')
			|| entryPath.includes('\\')
			|| entryPath.split('/').some(segment => segment === '' || segment === '.' || segment === '..')
			|| seenPaths.has(entryPath)
		) throw new Error(`OPERON_CLI_PACKAGE_NORMALIZE_PATH_INVALID:${entryPath}`);
		seenPaths.add(entryPath);
		const type = String.fromCharCode(header[156] ?? 0);
		if (type !== '\0' && type !== '0') {
			throw new Error(`OPERON_CLI_PACKAGE_NORMALIZE_TYPE_FORBIDDEN:${type}:${entryPath}`);
		}
		const mode = readOctal(header, 100, 8) & 0o7777;
		if (entryPath === 'package/dist/operon.mjs') {
			if (mode !== 0o644 && mode !== 0o755) {
				throw new Error(`OPERON_CLI_PACKAGE_NORMALIZE_EXECUTABLE_MODE_INVALID:${mode.toString(8)}`);
			}
			executableHeader = header;
		} else if (mode !== 0o644) {
			throw new Error(`OPERON_CLI_PACKAGE_NORMALIZE_MODE_INVALID:${entryPath}`);
		}
		const size = readOctal(header, 124, 12);
		const contentStart = offset + TAR_BLOCK_BYTES;
		const contentEnd = contentStart + size;
		const paddedEnd = contentStart + Math.ceil(size / TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES;
		if (contentEnd > archive.length || paddedEnd > archive.length) {
			throw new Error('OPERON_CLI_PACKAGE_NORMALIZE_TRUNCATED');
		}
		if (!archive.subarray(contentEnd, paddedEnd).every(byte => byte === 0)) {
			throw new Error(`OPERON_CLI_PACKAGE_NORMALIZE_PADDING_INVALID:${entryPath}`);
		}
		offset = paddedEnd;
	}
	if (!terminated) throw new Error('OPERON_CLI_PACKAGE_NORMALIZE_TERMINATOR_MISSING');
	if (!executableHeader) throw new Error('OPERON_CLI_PACKAGE_NORMALIZE_EXECUTABLE_MISSING');
	const paths = [...seenPaths].sort((left, right) => left.localeCompare(right, 'en'));
	if (JSON.stringify(paths) !== JSON.stringify(EXPECTED_PACKAGE_PATHS_V1)) {
		throw new Error('OPERON_CLI_PACKAGE_NORMALIZE_INVENTORY_MISMATCH');
	}
	const executableMode = readOctal(executableHeader, 100, 8) & 0o7777;
	if (executableMode === 0o755) return inspectPackageTarballV1(tarballPath);
	if (process.version !== 'v24.18.0') {
		throw new Error(`OPERON_CLI_PACKAGE_NORMALIZE_NODE_MISMATCH:${process.version}`);
	}
	executableHeader.set(Buffer.from('000755 \0', 'ascii'), 100);
	writeTarHeaderChecksum(executableHeader);
	const normalized = gzipSync(archive, { level: 9, mtime: 0 });
	if (normalized.subarray(0, 9).toString('hex') !== '1f8b08000000000002') {
		throw new Error('OPERON_CLI_PACKAGE_NORMALIZE_GZIP_HEADER_INVALID');
	}
	normalized[9] = 0xff;
	const temporaryPath = `${tarballPath}.normalize-${process.pid}-${Date.now()}`;
	try {
		await writeFile(temporaryPath, normalized, { flag: 'wx', mode: 0o600 });
		const result = await inspectPackageTarballV1(temporaryPath);
		assertOperonPackageInventoryV1(result.entries);
		await rename(temporaryPath, tarballPath);
		return result;
	} finally {
		await rm(temporaryPath, { force: true });
	}
}

export function assertOperonPackageInventoryV1(entries) {
	const paths = entries.map(entry => entry.path).sort((left, right) => left.localeCompare(right, 'en'));
	if (JSON.stringify(paths) !== JSON.stringify(EXPECTED_PACKAGE_PATHS_V1)) {
		throw new Error('OPERON_CLI_PACKAGE_PATH_INVENTORY_MISMATCH');
	}
	for (const entry of entries) {
		const expectedMode = entry.path === 'package/dist/operon.mjs' ? 0o755 : 0o644;
		if (entry.mode !== expectedMode) throw new Error(`OPERON_CLI_PACKAGE_MODE_MISMATCH:${entry.path}`);
	}
}

function readString(buffer, start, length) {
	const end = buffer.indexOf(0, start);
	const boundedEnd = end === -1 || end > start + length ? start + length : end;
	return buffer.subarray(start, boundedEnd).toString('utf8');
}

function readOctal(buffer, start, length) {
	const value = readString(buffer, start, length).trim();
	if (!/^[0-7]+$/u.test(value)) throw new Error('OPERON_CLI_PACKAGE_ARCHIVE_OCTAL_INVALID');
	return Number.parseInt(value, 8);
}

function assertTarHeaderChecksum(header) {
	const expected = readOctal(header, 148, 8);
	const checksumHeader = Buffer.from(header);
	checksumHeader.fill(0x20, 148, 156);
	const actual = checksumHeader.reduce((sum, byte) => sum + byte, 0);
	if (actual !== expected) throw new Error('OPERON_CLI_PACKAGE_NORMALIZE_CHECKSUM_INVALID');
}

function writeTarHeaderChecksum(header) {
	header.fill(0x20, 148, 156);
	const checksum = header.reduce((sum, byte) => sum + byte, 0);
	const value = checksum.toString(8).padStart(6, '0');
	if (value.length !== 6) throw new Error('OPERON_CLI_PACKAGE_NORMALIZE_CHECKSUM_OVERFLOW');
	header.set(Buffer.from(`${value} \0`, 'ascii'), 148);
}
