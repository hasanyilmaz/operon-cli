import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (mode !== '--write' && mode !== '--check') {
	throw new Error('Usage: snapshot-manifest.mjs --write|--check');
}
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotRoot = path.join(projectRoot, 'vendor', 'operon-plugin-v1');
const manifestPath = path.join(snapshotRoot, 'snapshot-manifest-v1.json');
const files = [];
await walk(snapshotRoot, '');
files.sort((left, right) => left.path.localeCompare(right.path));
const groups = {
	contractSource: aggregate(files.filter(item => item.path.startsWith('src/agent-runtime/contracts/v1/'))),
	publicTypeSource: aggregate(files.filter(item => item.path.startsWith('src/agent-runtime/public/v1/'))),
	runtimeSchemas: aggregate(files.filter(item => item.path.startsWith('contracts/agent-runtime/v1/'))),
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
		pluginCheckpointCommit: '1eb694e99bac1276647d22fe2cf29e4908c2a2de',
		pluginTreeOid: 'd2ae12e584dfdf542b7e131b3340437a6ea08335',
		contractSourceTreeOid: 'b693fca9ce0920100d29a01b9a5068e9202ca95e',
		publicTypeSourceTreeOid: '680bc193f5b59ffe2dfc09507f014d2e63350571',
		runtimeSchemaTreeOid: '0bc4a6ef38dc5ac87da5c6ac98171f6b870f7d45',
	},
	runtimeV1: {
		contractVersion: 1,
		contractDigest: '79ba528ea0f8e249cb9583bc0d9b91bba6293d7b2531051fbecd25c39820c9ef',
		schemaAggregateSha256: 'd1ade3d9214c5ad06f3731388c15751d240993045e124da39f09f1a0ba099c4e',
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
assert.equal(files.length, 38, 'Snapshot inventory must contain exactly 38 files.');
const runtimeSchemaManifest = JSON.parse(await readFile(path.join(
	snapshotRoot,
	'contracts',
	'agent-runtime',
	'v1',
	'schema-manifest.json',
), 'utf8'));
assert.equal(runtimeSchemaManifest.aggregateSha256, document.runtimeV1.schemaAggregateSha256);
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
