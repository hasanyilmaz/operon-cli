import assert from 'node:assert/strict';
import test from 'node:test';
import { createChildEnvironmentWithPathV1 } from '../../scripts/child-process-environment.mjs';

test('Windows child environments contain exactly one canonical PATH key', () => {
	const result = createChildEnvironmentWithPathV1({
		PATH: 'first',
		Path: 'second',
		PaTh: 'third',
		SystemRoot: 'C:\\Windows',
	}, 'C:\\Operon Bin', 'win32');
	assert.deepEqual(result, {
		SystemRoot: 'C:\\Windows',
		PATH: 'C:\\Operon Bin',
	});
});

test('Windows child environments canonicalize a lone Path key', () => {
	const result = createChildEnvironmentWithPathV1({ Path: 'old', TEMP: 'C:\\Temp' }, '', 'win32');
	assert.deepEqual(result, { TEMP: 'C:\\Temp', PATH: '' });
});

test('POSIX child environments preserve separately-cased Path keys', () => {
	const result = createChildEnvironmentWithPathV1({ PATH: 'old', Path: 'preserved' }, '/operon/bin', 'linux');
	assert.deepEqual(result, { Path: 'preserved', PATH: '/operon/bin' });
});

test('child environment PATH rejects NUL input', () => {
	assert.throws(
		() => createChildEnvironmentWithPathV1({}, 'invalid\0path', 'win32'),
		/OPERON_CLI_CHILD_PATH_INVALID/u,
	);
});
