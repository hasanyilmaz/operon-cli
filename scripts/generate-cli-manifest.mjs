import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { buildCliManifestDocumentV1, CLI_SCHEMA_ENTRYPOINTS_V1 } from '../contract-manifest.mjs';
import { RUNTIME_SCHEMA_AGGREGATE_V1, readRuntimeExtensionManifestsV1 } from './runtime-snapshot-schemas.mjs';

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
	assert.equal(schemaFiles.length, 29);
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
	assert.equal(runtimeSchemaManifest.aggregateSha256, RUNTIME_SCHEMA_AGGREGATE_V1);
	const extensionManifests = await readRuntimeExtensionManifestsV1(schemaRoot);
	const schemaEntrypoints = [
		...runtimeSchemaManifest.entrypoints,
		...extensionManifests.flatMap(manifest => manifest.entrypoints),
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
	assert.equal(manifest.contractDigest, 'd4d9d977836973d22800b04bcf3d82c0462a59f6275efd3685f89fb738ee058e');
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
