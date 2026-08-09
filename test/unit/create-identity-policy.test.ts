import assert from 'node:assert/strict';

import type { CreateTaskSpecV1 } from '../../vendor/operon-plugin-v1/src/agent-runtime/contracts/v1';
import { withFileTaskIdentityPlaceholderPolicyV1 } from '../../src/create-identity-policy';
import { convenienceMapping } from '../../src/command-line';

const mixedSpec: CreateTaskSpecV1 = {
	operation: 'create',
	items: [
		{
			itemRef: 'file-parent',
			description: 'Parent',
			target: { representation: 'file', mode: 'configured-default' },
			fields: [],
		},
		{
			itemRef: 'file-child',
			description: 'Child',
			target: { representation: 'file', mode: 'exact-path', filePath: 'Tasks/Child.md' },
			fields: [],
			parent: { kind: 'created', itemRef: 'file-parent' },
		},
		{
			itemRef: 'inline',
			description: 'Inline',
			target: { representation: 'inline', mode: 'configured-default' },
			fields: [],
		},
		{
			itemRef: 'legacy-default',
			description: 'Configured default',
			target: { mode: 'configured-default' },
			fields: [],
		},
	],
};

assert.equal(withFileTaskIdentityPlaceholderPolicyV1(mixedSpec, false), mixedSpec);
assert.equal(withFileTaskIdentityPlaceholderPolicyV1(mixedSpec, true), mixedSpec);

const fileSpec: CreateTaskSpecV1 = {
	...mixedSpec,
	items: mixedSpec.items.slice(0, 2),
};
const enabled = withFileTaskIdentityPlaceholderPolicyV1(fileSpec, true);
assert.notEqual(enabled, fileSpec);
assert.equal(identityPolicy(enabled.items[0].target), 'resolve-operon-id-v1');
assert.equal(identityPolicy(enabled.items[1].target), 'resolve-operon-id-v1');
assert.deepEqual(enabled.items[1].parent, { kind: 'created', itemRef: 'file-parent' });
assert.deepEqual(withFileTaskIdentityPlaceholderPolicyV1(fileSpec, true), enabled);
assert.deepEqual(convenienceMapping('task.create', mixedSpec as unknown as Record<string, unknown>), {
	mutationKind: 'task.create',
	capability: 'tasks.create.preview',
	operation: 'create',
});
assert.deepEqual(convenienceMapping('task.create', enabled as unknown as Record<string, unknown>), {
	mutationKind: 'task.create',
	capability: 'tasks.create.identity-placeholders',
	operation: 'create',
});
assert.deepEqual(convenienceMapping('task.adopt'), {
	mutationKind: 'task.adopt',
	capability: 'tasks.adopt.preview',
	operation: 'adopt-inline',
});
console.log('File Task identity placeholder policy tests passed');

function identityPolicy(target: CreateTaskSpecV1['items'][number]['target']): unknown {
	return 'identityPlaceholderPolicy' in target ? target.identityPlaceholderPolicy : undefined;
}
