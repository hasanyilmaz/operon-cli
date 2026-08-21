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
	taskWorkflowExtensionSource: aggregate(files.filter(item => item.path.startsWith('src/agent-runtime/extensions/task-workflows-v1/'))),
	taskWorkflowExtensionSchemas: aggregate(files.filter(item => item.path.startsWith('contracts/agent-runtime/extensions/task-workflows-v1/'))),
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
		pluginCheckpointCommit: '3f00fa69c036db4818dace7ea12366ec5d8ad73a',
		pluginTreeOid: '3937f3a95947c476df6fea5f58005dcdf1033e70',
		contractSourceTreeOid: '715a63d03d36f9a04ba9d2d292e2b4037edbc73d',
		publicTypeSourceTreeOid: '7f86bf8212e6a58fe9dd44abd9818cada542907f',
		runtimeSchemaTreeOid: '421474db07a9603e547e5bcd08fdaa2f1d68b068',
		taskWorkflowExtensionSourceTreeOid: '1f03fa7b68819b77e0449a10d5d8b6bdde2c072f',
		taskWorkflowExtensionSchemaTreeOid: 'b865ba3ce4d9b6646475d998dfa2d472a214b9e8',
	},
	runtimeV1: {
		contractVersion: 1,
		contractDigest: '407f3a222f8c59a9622038e99e9345d0d34882fd358149b38bce5354ae0ca92b',
		schemaAggregateSha256: '7f0123fc1da01ca5d10d02c8a95def5aae2bac9086ad19787dae547d94b59d8f',
	},
	extensions: {
		taskWorkflowsV1: {
			extensionId: 'task-workflows-v1',
			contractVersion: 1,
			baseSchemaManifestAggregateSha256: '7cc7826093758c61491551c9ee925440e7641fecc44b953f7ea2c8595eb345fa',
			aggregateSha256: '2905fcf85df861a7d19e583636eaf3ad6d505d631b8776c6f77e1948b36feffc',
		},
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
assert.equal(files.length, 46, 'Snapshot inventory must contain exactly 46 files.');
const runtimeSchemaManifest = JSON.parse(await readFile(path.join(
	snapshotRoot,
	'contracts',
	'agent-runtime',
	'v1',
	'schema-manifest.json',
), 'utf8'));
assert.equal(runtimeSchemaManifest.aggregateSha256, document.runtimeV1.schemaAggregateSha256);
const taskWorkflowExtensionManifest = JSON.parse(await readFile(path.join(
	snapshotRoot,
	'contracts',
	'agent-runtime',
	'extensions',
	'task-workflows-v1',
	'extension-manifest.json',
), 'utf8'));
assert.equal(
	taskWorkflowExtensionManifest.baseContractDigest,
	document.runtimeV1.contractDigest,
);
assert.equal(
	taskWorkflowExtensionManifest.baseSchemaManifestAggregateSha256,
	document.extensions.taskWorkflowsV1.baseSchemaManifestAggregateSha256,
);
assert.equal(
	taskWorkflowExtensionManifest.aggregateSha256,
	document.extensions.taskWorkflowsV1.aggregateSha256,
);
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
