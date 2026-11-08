import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('standalone package boundary is closed', async () => {
	const document = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
	assert.equal(document.name, '@stratejya/operon-cli');
	assert.equal(document.version, '1.3.0');
	assert.equal('private' in document, false);
	assert.deepEqual(document.dependencies ?? {}, {});
	assert.deepEqual(document.optionalDependencies ?? {}, {});
	assert.equal(document.repository.url, 'git+https://github.com/hasanyilmaz/operon-cli.git');
	assert.equal('directory' in document.repository, false);
	assert.deepEqual(document.publishConfig, {
		access: 'public',
		registry: 'https://registry.npmjs.org/',
		provenance: true,
	});
	const files = document.files.join('\n');
	for (const forbidden of ['vendor/', 'src/', 'scripts/', 'test/', 'snapshot-manifest']) {
		assert.equal(files.includes(forbidden), false);
	}
});

test('generated public inventories are exact', async () => {
	const schemas = (await list(path.join(projectRoot, 'schemas', 'v1')))
		.filter(name => name.endsWith('.json'));
	assert.equal(schemas.length, 29);
	assert.deepEqual(schemas.filter(name => name.startsWith('extensions/')), [
		'extensions/file-task-titles-v1/capabilities.schema.json',
		'extensions/file-task-titles-v1/cli.schema.json',
		'extensions/file-task-titles-v1/developer-api.schema.json',
		'extensions/file-task-titles-v1/extension-manifest.json',
		'extensions/file-task-titles-v1/mutation.schema.json',
		'extensions/task-creation-v1/creation.schema.json',
		'extensions/task-creation-v1/extension-manifest.json',
		'extensions/task-workflows-v1/capabilities.schema.json',
		'extensions/task-workflows-v1/cli.schema.json',
		'extensions/task-workflows-v1/developer-api.schema.json',
		'extensions/task-workflows-v1/extension-manifest.json',
		'extensions/task-workflows-v1/mutation.schema.json',
		'extensions/task-workflows-v1/read.schema.json',
	]);
	assert.equal((await list(path.join(projectRoot, 'types'))).filter(name => name.endsWith('.d.ts')).length, 16);
});

test('the generated CLI manifest satisfies its published schema', async () => {
	const schema = JSON.parse(await readFile(path.join(projectRoot, 'schemas', 'v1', 'cli-manifest.schema.json'), 'utf8'));
	const manifest = JSON.parse(await readFile(path.join(projectRoot, 'cli-manifest-v1.json'), 'utf8'));
	const validate = new Ajv2020({ strict: false }).compile(schema);
	assert.equal(validate(manifest), true, JSON.stringify(validate.errors));
});

test('source and build files contain no plugin-relative or private path markers', async () => {
	for (const root of ['src', 'scripts']) {
		for (const file of await list(path.join(projectRoot, root))) {
			if (!/\.(?:ts|mjs)$/u.test(file)) continue;
			const source = await readFile(path.join(projectRoot, root, file), 'utf8');
			for (const marker of ['../../../src/', 'packages/operon-cli', '/Users/', 'Dropbox/', 'Stratejya_Next', 'pluginRoot']) {
				assert.equal(source.includes(marker), false, `Forbidden marker ${marker} in ${root}/${file}`);
			}
		}
	}
});

async function list(root) {
	const output = [];
	await walk(root, '');
	return output.sort();
	async function walk(directory, relative) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const next = relative ? path.posix.join(relative, entry.name) : entry.name;
			if (entry.isDirectory()) await walk(path.join(directory, entry.name), next);
			else if (entry.isFile()) output.push(next);
		}
	}
}
