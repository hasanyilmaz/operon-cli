import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNTIME_SCHEMA_AGGREGATE_V1, readRuntimeExtensionManifestsV1 } from './runtime-snapshot-schemas.mjs';

const mode = process.argv[2];
if (mode !== '--write' && mode !== '--check') {
	throw new Error('Usage: snapshot-manifest.mjs --write|--check');
}
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotRoot = path.join(projectRoot, 'vendor', 'operon-plugin-v1');
const manifestPath = path.join(snapshotRoot, 'snapshot-manifest-v1.json');
const schemaRoot = path.join(snapshotRoot, 'contracts', 'agent-runtime');
const extensionManifests = await readRuntimeExtensionManifestsV1(schemaRoot);
const files = [];
await walk(snapshotRoot, '');
files.sort((left, right) => left.path.localeCompare(right.path));
const groups = {
	contractSource: aggregate(files.filter(item => item.path.startsWith('src/agent-runtime/contracts/v1/'))),
	publicTypeSource: aggregate(files.filter(item => item.path.startsWith('src/agent-runtime/public/v1/'))),
	runtimeSchemas: aggregate(files.filter(item => item.path.startsWith('contracts/agent-runtime/v1/'))),
	taskWorkflowExtensionSource: aggregate(files.filter(item => item.path.startsWith('src/agent-runtime/extensions/task-workflows-v1/'))),
	taskWorkflowExtensionSchemas: aggregate(files.filter(item => item.path.startsWith('contracts/agent-runtime/extensions/task-workflows-v1/'))),
	fileTaskTitlesExtensionSource: aggregate(files.filter(item => item.path.startsWith('src/agent-runtime/extensions/file-task-titles-v1/'))),
	fileTaskTitlesExtensionSchemas: aggregate(files.filter(item => item.path.startsWith('contracts/agent-runtime/extensions/file-task-titles-v1/'))),
	taskCreationExtensionSchemas: aggregate(files.filter(item => item.path.startsWith('contracts/agent-runtime/extensions/task-creation-v1/'))),
	extensionReferences: aggregate(files.filter(item => item.path.startsWith('reference/'))),
	temporalCodecs: aggregate(files.filter(item => item.path.startsWith('src/core/'))),
	vaultIdentity: aggregate(files.filter(item => item.path.endsWith('/vault-path-identity.ts'))),
};
const parityFixture = files.find(item => item.path === 'parity/shared-parity.test.ts');
assert.ok(parityFixture, 'Snapshot parity fixture is missing.');
const projection = {
	schemaVersion: 1,
	kind: 'operon-cli-plugin-snapshot',
	origin: {
		repository: 'https://github.com/hasanyilmaz/operon',
		pluginCheckpointCommit: 'a04545858ae975123a4c015efb06827b3a6a1f47',
		pluginTreeOid: '49c163f03d66ee7e27e25feb8b32fc6f3b0fb4db',
		contractSourceTreeOid: '6e43e5ef356c2ab1a539d7bd747621d5eb3b2ee0',
		publicTypeSourceTreeOid: '7f86bf8212e6a58fe9dd44abd9818cada542907f',
		runtimeSchemaTreeOid: 'fe6956c0bf03c6cc72026c843011c4340dbf5094',
		taskWorkflowExtensionSourceTreeOid: '091ecece390b302311d2ba9db90f5d84219a6839',
		taskWorkflowExtensionSchemaTreeOid: 'b865ba3ce4d9b6646475d998dfa2d472a214b9e8',
		fileTaskTitlesExtensionSourceTreeOid: '8fe9aa53fe269f87d79324fe284ff12d614f29c7',
		fileTaskTitlesExtensionSchemaTreeOid: '9bef61e3bf8e9a3a3d358c390b88803a74f9ab23',
		taskCreationExtensionSourceTreeOid: '274d31789c221d1584beb10c18a029436f67b03f',
		taskCreationExtensionSchemaTreeOid: 'e18d09c76df201d8c7a9576a1483b2a682195728',
	},
	runtimeV1: {
		contractVersion: 1,
		contractDigest: '407f3a222f8c59a9622038e99e9345d0d34882fd358149b38bce5354ae0ca92b',
		schemaAggregateSha256: RUNTIME_SCHEMA_AGGREGATE_V1,
	},
	extensions: {
		taskWorkflowsV1: extensionIdentity('task-workflows-v1'),
		fileTaskTitlesV1: extensionIdentity('file-task-titles-v1'),
		taskCreationV1: extensionIdentity('task-creation-v1'),
	},
	toolchain: {
		node: '24.18.0',
		npm: '11.12.1',
		esbuild: '0.28.1',
		typescript: '5.9.3',
		ajv: '8.20.0',
	},
	groups,
	parityFixture: {
		path: parityFixture.path,
		sha256: parityFixture.sha256,
		bytes: parityFixture.bytes,
	},
	files,
};
const document = {
	...projection,
	snapshotAggregateSha256: sha256(Buffer.from(JSON.stringify(projection), 'utf8')),
};
assert.equal(files.length, 65, 'Snapshot inventory must contain exactly 65 files.');
const runtimeSchemaManifest = JSON.parse(await readFile(path.join(
	snapshotRoot,
	'contracts',
	'agent-runtime',
	'v1',
	'schema-manifest.json',
), 'utf8'));
assert.equal(runtimeSchemaManifest.aggregateSha256, document.runtimeV1.schemaAggregateSha256);
for (const manifest of extensionManifests) {
	assert.equal(manifest.baseContractDigest, document.runtimeV1.contractDigest);
	if (manifest.extensionId !== 'task-workflows-v1') {
		assert.equal(manifest.baseSchemaManifestAggregateSha256, document.runtimeV1.schemaAggregateSha256);
	}
}
const serialized = `${JSON.stringify(document, null, 2)}\n`;
if (mode === '--write') {
	await writeFile(manifestPath, serialized, 'utf8');
} else {
	assert.equal(await readFile(manifestPath, 'utf8'), serialized, 'Snapshot manifest is stale or snapshot identity drifted.');
}
console.log(JSON.stringify({
	status: 'passed',
	mode: mode.slice(2),
	fileCount: files.length,
	snapshotAggregateSha256: document.snapshotAggregateSha256,
}));

function extensionIdentity(id) {
	const manifest = extensionManifests.find(item => item.extensionId === id);
	assert.ok(manifest, `Missing extension manifest: ${id}`);
	const { extensionId, contractVersion, baseSchemaManifestAggregateSha256, aggregateSha256 } = manifest;
	return { extensionId, contractVersion, baseSchemaManifestAggregateSha256, aggregateSha256 };
}

async function walk(directory, relativeDirectory) {
	const entries = await readdir(directory, { withFileTypes: true });
	entries.sort((left, right) => left.name.localeCompare(right.name));
	for (const entry of entries) {
		const relative = relativeDirectory ? path.posix.join(relativeDirectory, entry.name) : entry.name;
		if (relative === 'snapshot-manifest-v1.json') continue;
		assert.equal(relative.includes('..'), false, `Snapshot path traversal is forbidden: ${relative}`);
		const absolute = path.join(directory, entry.name);
		const metadata = await lstat(absolute);
		assert.equal(metadata.isSymbolicLink(), false, `Snapshot symlink is forbidden: ${relative}`);
		if (entry.isDirectory()) {
			await walk(absolute, relative);
			continue;
		}
		assert.equal(entry.isFile(), true, `Snapshot non-file is forbidden: ${relative}`);
		const bytes = await readFile(absolute);
		files.push({
			path: relative,
			sha256: sha256(bytes),
			bytes: bytes.length,
			mode: process.platform === 'win32'
				? '644'
				: (metadata.mode & 0o777).toString(8).padStart(3, '0'),
		});
	}
}

function aggregate(items) {
	return {
		fileCount: items.length,
		aggregateSha256: sha256(Buffer.from(JSON.stringify(items), 'utf8')),
	};
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}
