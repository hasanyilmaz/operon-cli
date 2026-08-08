import assert from 'node:assert/strict';
import { chmod, copyFile, mkdtemp, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (mode !== '--write' && mode !== '--check') throw new Error('Usage: generate-schemas.mjs --write|--check');
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetRoot = path.join(projectRoot, 'schemas', 'v1');
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'operon-cli-schemas-'));
const generatedRoot = path.join(temporaryRoot, 'v1');
await mkdir(generatedRoot, { recursive: true });
try {
	const copied = new Set();
	for (const sourceRoot of [
		path.join(projectRoot, 'vendor', 'operon-plugin-v1', 'contracts', 'agent-runtime', 'v1'),
		path.join(projectRoot, 'schema-source'),
	]) {
		for (const fileName of (await readdir(sourceRoot)).filter(name => name.endsWith('.json')).sort()) {
			assert.equal(copied.has(fileName), false, `OPERON_CLI_SCHEMA_FILENAME_COLLISION:${fileName}`);
			copied.add(fileName);
			const target = path.join(generatedRoot, fileName);
			await copyFile(path.join(sourceRoot, fileName), target);
			await chmod(target, 0o644);
		}
	}
	assert.equal(copied.size, 16, 'Generated schema inventory must contain 16 files.');
	const manifest = JSON.parse(await readFile(path.join(generatedRoot, 'schema-manifest.json'), 'utf8'));
assert.equal(manifest.aggregateSha256, 'd1ade3d9214c5ad06f3731388c15751d240993045e124da39f09f1a0ba099c4e');
	if (mode === '--check') {
		await assertTreesEqual(generatedRoot, targetRoot);
	} else {
		const backup = `${targetRoot}.backup-${process.pid}`;
		await rm(backup, { recursive: true, force: true });
		try {
			await rename(targetRoot, backup);
		} catch (error) {
			if (error?.code !== 'ENOENT') throw error;
		}
		try {
			await mkdir(path.dirname(targetRoot), { recursive: true });
			await rename(generatedRoot, targetRoot);
			await rm(backup, { recursive: true, force: true });
		} catch (error) {
			await rm(targetRoot, { recursive: true, force: true });
			try { await rename(backup, targetRoot); } catch { /* No backup was available. */ }
			throw error;
		}
	}
	console.log(JSON.stringify({ status: 'passed', mode: mode.slice(2), files: copied.size }));
} finally {
	await rm(temporaryRoot, { recursive: true, force: true });
}

async function assertTreesEqual(expectedRoot, actualRoot) {
	const expected = (await readdir(expectedRoot)).sort();
	const actual = (await readdir(actualRoot)).sort();
	assert.deepEqual(actual, expected, 'Generated schema inventory is stale.');
	for (const file of expected) {
		assert.deepEqual(await readFile(path.join(actualRoot, file)), await readFile(path.join(expectedRoot, file)), `Generated schema is stale: ${file}`);
		if (process.platform !== 'win32') assert.equal((await stat(path.join(actualRoot, file))).mode & 0o777, 0o644);
	}
}
