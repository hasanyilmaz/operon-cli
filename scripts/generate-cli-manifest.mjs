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
	const schemaFiles = (await readdir(schemaRoot)).filter(name => name.endsWith('.json')).sort();
	assert.equal(schemaFiles.length, 16);
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
	assert.equal(runtimeSchemaManifest.aggregateSha256, 'd1ade3d9214c5ad06f3731388c15751d240993045e124da39f09f1a0ba099c4e');
	const schemaEntrypoints = [...runtimeSchemaManifest.entrypoints, ...CLI_SCHEMA_ENTRYPOINTS_V1].map(entrypoint => {
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
	assert.equal(manifest.contractDigest, '79ba528ea0f8e249cb9583bc0d9b91bba6293d7b2531051fbecd25c39820c9ef');
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
