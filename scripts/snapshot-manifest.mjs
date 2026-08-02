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
		canonicalVaultCommit: 'aaaa70b6f831b79998444e4048d1503af7218b4f',
		publicEquivalenceCommit: 'a9ba9ec82430f9a8f6e285831085c9363d7d1a34',
		cliPackageTreeOid: 'ae8fd8c092d7fa3ab70bd80440a786ee2b8a0454',
		cliSourceTreeOid: 'acbce9d541f386302a97e5e4cefb5e90132b7592',
		cliTestTreeOid: 'd9b0b8abb383ae584d0da6752db4efbbe40f56f7',
		contractSourceTreeOid: 'f913196f35fd2942ff30194e5ba4daff8c6e7da9',
		publicTypeSourceTreeOid: '7f86bf8212e6a58fe9dd44abd9818cada542907f',
		runtimeSchemaTreeOid: 'bd2175490f0357c336603ce7d56a06b20a8b1491',
	},
	runtimeV1: {
		contractVersion: 1,
		contractDigest: '407f3a222f8c59a9622038e99e9345d0d34882fd358149b38bce5354ae0ca92b',
		schemaAggregateSha256: '7cc7826093758c61491551c9ee925440e7641fecc44b953f7ea2c8595eb345fa',
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
