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
	for (const [sourceRoot, relativeTarget] of [
		[path.join(projectRoot, 'vendor', 'operon-plugin-v1', 'contracts', 'agent-runtime', 'v1'), ''],
		[path.join(projectRoot, 'schema-source'), ''],
		[
			path.join(projectRoot, 'vendor', 'operon-plugin-v1', 'contracts', 'agent-runtime', 'extensions', 'task-workflows-v1'),
			'extensions/task-workflows-v1',
		],
	]) {
		for (const fileName of (await readdir(sourceRoot)).filter(name => name.endsWith('.json')).sort()) {
			const relative = relativeTarget ? path.posix.join(relativeTarget, fileName) : fileName;
			assert.equal(copied.has(relative), false, `OPERON_CLI_SCHEMA_FILENAME_COLLISION:${relative}`);
			copied.add(relative);
			const target = path.join(generatedRoot, relative);
			await mkdir(path.dirname(target), { recursive: true });
			await copyFile(path.join(sourceRoot, fileName), target);
			await chmod(target, 0o644);
		}
	}
	assert.equal(copied.size, 22, 'Generated schema inventory must contain 22 files.');
	const manifest = JSON.parse(await readFile(path.join(generatedRoot, 'schema-manifest.json'), 'utf8'));
	assert.equal(manifest.aggregateSha256, '7f0123fc1da01ca5d10d02c8a95def5aae2bac9086ad19787dae547d94b59d8f');
	const extensionManifest = JSON.parse(await readFile(path.join(
		generatedRoot,
		'extensions',
		'task-workflows-v1',
		'extension-manifest.json',
	), 'utf8'));
	assert.equal(extensionManifest.baseContractDigest, '407f3a222f8c59a9622038e99e9345d0d34882fd358149b38bce5354ae0ca92b');
	assert.equal(extensionManifest.baseSchemaManifestAggregateSha256, '7cc7826093758c61491551c9ee925440e7641fecc44b953f7ea2c8595eb345fa');
	assert.equal(extensionManifest.aggregateSha256, '2905fcf85df861a7d19e583636eaf3ad6d505d631b8776c6f77e1948b36feffc');
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
	const expected = await listFiles(expectedRoot);
	const actual = await listFiles(actualRoot);
	assert.deepEqual(actual, expected, 'Generated schema inventory is stale.');
	for (const file of expected) {
		assert.deepEqual(await readFile(path.join(actualRoot, file)), await readFile(path.join(expectedRoot, file)), `Generated schema is stale: ${file}`);
		if (process.platform !== 'win32') assert.equal((await stat(path.join(actualRoot, file))).mode & 0o777, 0o644);
	}
}

async function listFiles(root) {
	const output = [];
	await walk(root, '');
	return output.sort();

	async function walk(directory, relativeDirectory) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const relative = relativeDirectory
				? path.posix.join(relativeDirectory, entry.name)
				: entry.name;
			if (entry.isDirectory()) await walk(path.join(directory, entry.name), relative);
			else {
				assert.equal(entry.isFile(), true, `Generated schema non-file is forbidden: ${relative}`);
				output.push(relative);
			}
		}
	}
}
