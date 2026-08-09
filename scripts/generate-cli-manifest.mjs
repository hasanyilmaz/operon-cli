import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { buildCliManifestDocumentV1, CLI_SCHEMA_ENTRYPOINTS_V1 } from '../contract-manifest.mjs';

const mode = process.argv[2];
if (mode !== '--write' && mode !== '--check') throw new Error('Usage: generate-cli-manifest.mjs --write|--check');
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'operon-cli-manifest-'));
const modulePath = path.join(temporaryRoot, 'manifest-data.cjs');
try {
	const packageDocument = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
	await build({
		entryPoints: [path.join(projectRoot, 'src', 'manifest-data.ts')],
		outfile: modulePath,
		bundle: true,
		platform: 'node',
		format: 'cjs',
		target: 'node22',
		minify: true,
		logLevel: 'silent',
	});
	const require = createRequire(import.meta.url);
	const manifestModule = require(modulePath);
	const schemaRoot = path.join(projectRoot, 'schemas', 'v1');
	const schemaFiles = (await listFiles(schemaRoot)).filter(name => name.endsWith('.json')).sort();
	assert.equal(schemaFiles.length, 22);
	const schemas = [];
	const documents = new Map();
	for (const fileName of schemaFiles) {
		const bytes = await readFile(path.join(schemaRoot, fileName));
		const sha256 = createHash('sha256').update(bytes).digest('hex');
		const document = JSON.parse(bytes.toString('utf8'));
		if (typeof document?.$id === 'string') {
			assert.equal(documents.has(document.$id), false, `OPERON_CLI_SCHEMA_DUPLICATE_ID:${document.$id}`);
			documents.set(document.$id, { file: fileName, sha256, document });
		}
		schemas.push({ file: fileName, ...(typeof document?.$id === 'string' ? { id: document.$id } : {}), sha256 });
	}
	const runtimeSchemaManifest = JSON.parse(await readFile(path.join(schemaRoot, 'schema-manifest.json'), 'utf8'));
	assert.equal(runtimeSchemaManifest.aggregateSha256, '7cc7826093758c61491551c9ee925440e7641fecc44b953f7ea2c8595eb345fa');
	const extensionManifest = JSON.parse(await readFile(path.join(
		schemaRoot,
		'extensions',
		'task-workflows-v1',
		'extension-manifest.json',
	), 'utf8'));
	assert.equal(extensionManifest.baseContractDigest, '407f3a222f8c59a9622038e99e9345d0d34882fd358149b38bce5354ae0ca92b');
	assert.equal(extensionManifest.baseSchemaManifestAggregateSha256, runtimeSchemaManifest.aggregateSha256);
	assert.equal(extensionManifest.aggregateSha256, '5a5a4c18a225b693054988615f0565f92293f7489b46563aaa1e107118c6fc1c');
	for (const record of extensionManifest.documents) {
		const relative = path.posix.join('extensions/task-workflows-v1', record.file);
		const bytes = await readFile(path.join(schemaRoot, relative));
		const document = JSON.parse(bytes.toString('utf8'));
		assert.equal(document.$id, record.id, `OPERON_CLI_EXTENSION_SCHEMA_ID_MISMATCH:${record.file}`);
		assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, `OPERON_CLI_EXTENSION_SCHEMA_HASH_MISMATCH:${record.file}`);
	}
	const schemaEntrypoints = [
		...runtimeSchemaManifest.entrypoints,
		...extensionManifest.entrypoints,
		...CLI_SCHEMA_ENTRYPOINTS_V1,
	].map(entrypoint => {
		const [documentId] = entrypoint.ref.split('#', 1);
		const found = documents.get(documentId);
		assert.ok(found, `OPERON_CLI_SCHEMA_ENTRYPOINT_INVALID:${entrypoint.schemaId}`);
		const fragment = entrypoint.ref.includes('#') ? entrypoint.ref.split('#', 2)[1] : '';
		assert.ok(fragment === '' || resolveJsonPointer(found.document, fragment) !== undefined, `OPERON_CLI_SCHEMA_FRAGMENT_MISSING:${entrypoint.schemaId}`);
		return {
			schemaId: entrypoint.schemaId,
			ref: entrypoint.ref,
			file: found.file,
			sha256: found.sha256,
			stability: entrypoint.stability ?? 'stable',
			...(entrypoint.deprecation ? { deprecation: entrypoint.deprecation } : {}),
		};
	}).sort((left, right) => left.schemaId.localeCompare(right.schemaId));
	const manifest = buildCliManifestDocumentV1(
		manifestModule.createCliManifestBaseV1(packageDocument.version),
		schemas,
		schemaEntrypoints,
	);
	assert.equal(manifest.contractDigest, 'd4da03dca3be377d5937cab2b8f6da0d6afffa14edc9b6ab85451e76d37a78b2');
	const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
	const target = path.join(projectRoot, 'cli-manifest-v1.json');
	if (mode === '--write') await writeFile(target, serialized, 'utf8');
	else assert.equal(await readFile(target, 'utf8'), serialized, 'CLI manifest is stale.');
	console.log(JSON.stringify({ status: 'passed', mode: mode.slice(2), contractDigest: manifest.contractDigest }));
} finally {
	await rm(temporaryRoot, { recursive: true, force: true });
}

function resolveJsonPointer(document, fragment) {
	if (!fragment.startsWith('/')) return undefined;
	let current = document;
	for (const rawToken of fragment.slice(1).split('/')) {
		const token = rawToken.replaceAll('~1', '/').replaceAll('~0', '~');
		if (current === null || typeof current !== 'object' || !(token in current)) return undefined;
		current = current[token];
	}
	return current;
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
				assert.equal(entry.isFile(), true, `OPERON_CLI_SCHEMA_NON_FILE:${relative}`);
				output.push(relative);
			}
		}
	}
}
