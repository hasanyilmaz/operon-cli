import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const RUNTIME_SCHEMA_AGGREGATE_V1 = '43ca9fa184f9a2433a3583446ab19557e7c81b3e3b0f3f57be95a95ee3859506';

const EXTENSION_MANIFEST_HASHES_V1 = Object.freeze({
	'task-workflows-v1': '0760e969cac3e9bf5040df049ae74db0d1d79680402c95e91324b5606be36dac',
	'file-task-titles-v1': 'c79d8d66e70ad808c424d782b3bbd7694fb341749013eb60f4c44f543e8dd029',
	'task-creation-v1': '4db79280bd0b8c54e4183c2d0a278615ffe92070b79f801fa4f77209355d227f',
});

export async function readRuntimeExtensionManifestsV1(schemaRoot) {
	return Promise.all(Object.entries(EXTENSION_MANIFEST_HASHES_V1).map(async ([id, hash]) => {
		const root = path.join(schemaRoot, 'extensions', id);
		const bytes = await readFile(path.join(root, 'extension-manifest.json'));
		assert.equal(sha256(bytes), hash, `OPERON_CLI_EXTENSION_MANIFEST_HASH_MISMATCH:${id}`);
		const manifest = JSON.parse(bytes.toString('utf8'));
		assert.equal(manifest.extensionId, id);
		assert.equal(manifest.contractVersion, 1);
		for (const record of manifest.documents) {
			const document = await readFile(path.join(root, record.file));
			assert.equal(sha256(document), record.sha256, `OPERON_CLI_EXTENSION_SCHEMA_HASH_MISMATCH:${id}/${record.file}`);
			assert.equal(JSON.parse(document.toString('utf8')).$id, record.id);
		}
		return manifest;
	}));
}

function sha256(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}
