import assert from 'node:assert/strict';
import test from 'node:test';

import {
	listCliSchemasV1,
	readCliSchemaV1,
} from '../../src/package-assets';

test('package schema assets expose the nested task-workflows extension', () => {
	const previousRoot = process.env.OPERON_CLI_PACKAGE_ROOT;
	process.env.OPERON_CLI_PACKAGE_ROOT = process.cwd();
	try {
		const file = 'extensions/task-workflows-v1/read.schema.json';
		assert.equal(listCliSchemasV1().includes(file), true);
		const document = readCliSchemaV1(file) as { $id?: string };
		assert.equal(
			document.$id,
			'urn:operon:schema:runtime:v1:extension:task-workflows:read',
		);
		const entrypoint = readCliSchemaV1('task-filter-query-request') as {
			schemaId?: string;
			ref?: string;
		};
		assert.equal(entrypoint.schemaId, 'task-filter-query-request');
		assert.equal(
			entrypoint.ref,
			'urn:operon:schema:runtime:v1:extension:task-workflows:read#/$defs/request',
		);
	} finally {
		if (previousRoot === undefined) delete process.env.OPERON_CLI_PACKAGE_ROOT;
		else process.env.OPERON_CLI_PACKAGE_ROOT = previousRoot;
	}
});

test('package schema assets reject traversal and alternate separators', () => {
	for (const invalid of [
		'../read.schema.json',
		'extensions/../read.schema.json',
		'extensions\\task-workflows-v1\\read.schema.json',
		'/extensions/task-workflows-v1/read.schema.json',
	]) {
		assert.throws(() => readCliSchemaV1(invalid), /INVALID_SCHEMA_ID/u);
	}
});
