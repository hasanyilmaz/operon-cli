import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

for (const scenario of [
	{
		name: 'snapshot byte drift',
		mutate: async root => {
			const target = path.join(root, 'vendor', 'operon-plugin-v1', 'src', 'core', 'local-time.ts');
			await writeFile(target, `${await readFile(target, 'utf8')}\n`, 'utf8');
		},
	},
	{
		name: 'snapshot extra file',
		mutate: async root => {
			await writeFile(path.join(root, 'vendor', 'operon-plugin-v1', 'unexpected.ts'), 'export {};\n');
		},
	},
	{
		name: 'snapshot missing file',
		mutate: async root => {
			await unlink(path.join(root, 'vendor', 'operon-plugin-v1', 'src', 'core', 'local-time.ts'));
		},
	},
	{
		name: 'snapshot origin drift',
		mutate: async root => {
			const target = path.join(root, 'vendor', 'operon-plugin-v1', 'snapshot-manifest-v1.json');
			const document = JSON.parse(await readFile(target, 'utf8'));
			document.origin.repository = 'https://example.invalid/drift';
			await writeFile(target, `${JSON.stringify(document, null, 2)}\n`);
		},
	},
	{
		name: 'snapshot toolchain drift',
		mutate: async root => {
			const target = path.join(root, 'vendor', 'operon-plugin-v1', 'snapshot-manifest-v1.json');
			const document = JSON.parse(await readFile(target, 'utf8'));
			document.toolchain.node = '24.18.1';
			await writeFile(target, `${JSON.stringify(document, null, 2)}\n`);
		},
	},
	{
		name: 'snapshot traversal-like path is rejected',
		mutate: async root => {
			await writeFile(path.join(root, 'vendor', 'operon-plugin-v1', 'unexpected..ts'), 'export {};\n');
		},
	},
]) {
	test(scenario.name, async () => {
		const root = await createFixture();
		try {
			await scenario.mutate(root);
			assert.notEqual(runCheck(root).status, 0);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
}

test('snapshot symlink is rejected', async t => {
	const root = await createFixture();
	try {
		const target = path.join(root, 'vendor', 'operon-plugin-v1', 'src', 'core', 'local-time.ts');
		const linkTarget = path.join(root, 'local-time-copy.ts');
		await cp(target, linkTarget);
		await unlink(target);
		try {
			await symlink(linkTarget, target);
		} catch (error) {
			if (error?.code === 'EPERM') return t.skip('Symlink creation is unavailable.');
			throw error;
		}
		assert.notEqual(runCheck(root).status, 0);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

async function createFixture() {
	const root = await mkdtemp(path.join(tmpdir(), 'operon-cli-snapshot-negative-'));
	await cp(path.join(projectRoot, 'scripts'), path.join(root, 'scripts'), { recursive: true });
	await cp(path.join(projectRoot, 'vendor'), path.join(root, 'vendor'), { recursive: true });
	return root;
}

function runCheck(root) {
	return spawnSync(process.execPath, ['scripts/snapshot-manifest.mjs', '--check'], {
		cwd: root,
		encoding: 'utf8',
	});
}
