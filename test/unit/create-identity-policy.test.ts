import assert from 'node:assert/strict';

import type { CreateTaskSpecV1 } from '../../vendor/operon-plugin-v1/src/agent-runtime/contracts/v1';
import { withFileTaskIdentityPlaceholderPolicyV1 } from '../../src/create-identity-policy';

const spec: CreateTaskSpecV1 = {
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

assert.equal(withFileTaskIdentityPlaceholderPolicyV1(spec, false), spec);
const enabled = withFileTaskIdentityPlaceholderPolicyV1(spec, true);
assert.notEqual(enabled, spec);
assert.equal(identityPolicy(enabled.items[0].target), 'resolve-operon-id-v1');
assert.equal(identityPolicy(enabled.items[1].target), 'resolve-operon-id-v1');
assert.equal(identityPolicy(enabled.items[2].target), undefined);
assert.equal(identityPolicy(enabled.items[3].target), undefined);
assert.deepEqual(enabled.items[1].parent, { kind: 'created', itemRef: 'file-parent' });
assert.equal(withFileTaskIdentityPlaceholderPolicyV1(enabled, true), enabled);
console.log('File Task identity placeholder policy tests passed');

function identityPolicy(target: CreateTaskSpecV1['items'][number]['target']): unknown {
	return 'identityPlaceholderPolicy' in target ? target.identityPlaceholderPolicy : undefined;
}
