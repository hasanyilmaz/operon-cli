import assert from 'node:assert/strict';

import { canonicalJsonV1, sha256HexV1, toJsonValueV1 } from '../../vendor/operon-plugin-v1/src/agent-runtime/contracts/v1/canonical';
import { decodeCliInvocationV1 as decodeBaseCliInvocationV1 } from '../../vendor/operon-plugin-v1/src/agent-runtime/contracts/v1/decode';
import type { TaskWorkflowPreviewRequestV1, TaskWorkflowSealedPlanV1 } from '../../vendor/operon-plugin-v1/src/agent-runtime/extensions/task-workflows-v1/contracts';
import { decodeTaskWorkflowCliInvocationExtensionV1 } from '../../vendor/operon-plugin-v1/src/agent-runtime/extensions/task-workflows-v1/decode';
import {
	admitRuntimeMutationPreviewPlanV1,
	admitRuntimeMutationResultV1,
	decodeRuntimeCliInvocationV1,
	decodeRuntimeCliResultEnvelopeV1,
	isTaskWorkflowInvocationV1,
} from '../../src/runtime-contract-compatibility';
import {
	TASK_WORKFLOW_CLIENT_ID,
	TASK_WORKFLOW_VAULT_SHA256,
	adoptWorkflowPreviewResultV1,
	identityWorkflowAlreadyAppliedResultV1,
	identityWorkflowApplyRequestV1,
	identityWorkflowInvocationV1,
	identityWorkflowPlanV1,
	identityWorkflowPreviewResultV1,
	identityWorkflowResultEnvelopeV1,
	taskWorkflowAppliedResultV1,
} from '../fixtures/task-workflow-contract';

const filterInvocation = {
	contractVersion: 1,
	kind: 'cli-invocation',
	requestId: 'filter-query-route',
	command: 'tasks.filter-query',
	mode: 'live',
	clientVersion: '1.1.0',
	compatibility: { contractVersion: 1, runtimeApi: { min: 1, max: 1 } },
	cliContract: { min: 1, max: 1 },
	expectedVaultSha256: TASK_WORKFLOW_VAULT_SHA256,
	readinessTimeoutMs: 15_000,
	request: {
		contractVersion: 1,
		requestId: 'filter-query-route',
		kind: 'task-filter-query',
		consistency: 'live-verified',
		filterSetId: 'saved-filter',
	},
};
assert.equal(isTaskWorkflowInvocationV1(filterInvocation), true);
assert.equal(decodeRuntimeCliInvocationV1(filterInvocation).ok, true);
assert.equal(decodeBaseCliInvocationV1(filterInvocation).ok, false, 'frozen core must reject filter-query');

const legacyCreateInvocation = {
	...filterInvocation,
	requestId: 'legacy-create-route',
	command: 'mutation.preview',
	request: {
		contractVersion: 1,
		requestId: 'legacy-create-route',
		kind: 'mutation-preview',
		clientInstanceId: 'operon-cli-legacy',
		idempotencyKey: 'legacy-create-route-key',
		capability: 'tasks.create.preview',
		mutationKind: 'task.create',
		spec: {
			operation: 'create',
			items: [{ itemRef: 'item-1', description: 'Legacy task', target: { representation: 'file', mode: 'configured-default' }, fields: [] }],
		},
		authorization: { basis: 'user-explicit-request' },
	},
};
assert.equal(isTaskWorkflowInvocationV1(legacyCreateInvocation), false);
assert.equal(decodeRuntimeCliInvocationV1(legacyCreateInvocation).ok, true);
assert.equal(decodeTaskWorkflowCliInvocationExtensionV1(legacyCreateInvocation).ok, false, 'extension must reject legacy create');

const adoptInvocation = {
	...filterInvocation,
	requestId: 'adopt-preview-route',
	command: 'mutation.preview',
	request: {
		contractVersion: 1,
		requestId: 'adopt-preview-route',
		kind: 'mutation-preview',
		clientInstanceId: TASK_WORKFLOW_CLIENT_ID,
		idempotencyKey: 'adopt-preview-key-0001',
		capability: 'tasks.adopt.preview',
		mutationKind: 'task.adopt',
		spec: {
			operation: 'adopt-inline',
			source: {
				filePath: 'Inbox.md',
				lineNumber: 12,
				expectedLine: '- [ ] Adopt me',
			},
		},
		authorization: { basis: 'user-explicit-request' },
	},
};
assert.equal(isTaskWorkflowInvocationV1(adoptInvocation), true);
assert.equal(decodeRuntimeCliInvocationV1(adoptInvocation).ok, true);
assert.equal(decodeBaseCliInvocationV1(adoptInvocation).ok, false, 'frozen core must reject adopt preview');

const identityPreviewPlan = identityWorkflowPlanV1();
if (identityPreviewPlan.mutationKind !== 'task.create') throw new Error('expected identity plan');
const identityPreviewRequest: Extract<TaskWorkflowPreviewRequestV1, { mutationKind: 'task.create' }> = {
	contractVersion: 1 as const,
	requestId: 'identity-apply-route',
	kind: 'mutation-preview' as const,
	clientInstanceId: TASK_WORKFLOW_CLIENT_ID,
	idempotencyKey: 'identity-route-key-0001',
	capability: 'tasks.create.identity-placeholders' as const,
	mutationKind: 'task.create' as const,
	spec: identityPreviewPlan.spec,
	authorization: { basis: 'user-explicit-request' as const },
};
assert.equal(admitRuntimeMutationPreviewPlanV1(identityPreviewRequest, identityPreviewPlan).ok, true);
const requestBoundIdentityPreview = identityWorkflowPreviewResultV1(identityPreviewRequest);
if (!requestBoundIdentityPreview.ok) throw new Error('expected identity preview success');
assert.equal(
	admitRuntimeMutationPreviewPlanV1(identityPreviewRequest, requestBoundIdentityPreview.plan).ok,
	true,
	'request-bound identity fixture must pass strict preview admission',
);
const adoptPreviewRequest = adoptInvocation.request as Extract<
	TaskWorkflowPreviewRequestV1,
	{ mutationKind: 'task.adopt' }
>;
const requestBoundAdoptPreview = adoptWorkflowPreviewResultV1(adoptPreviewRequest);
if (!requestBoundAdoptPreview.ok) throw new Error('expected adopt preview success');
assert.equal(
	admitRuntimeMutationPreviewPlanV1(adoptPreviewRequest, requestBoundAdoptPreview.plan).ok,
	true,
	'request-bound adoption fixture must pass strict preview admission',
);
assert.equal(
	admitRuntimeMutationPreviewPlanV1(adoptInvocation.request, identityPreviewPlan).ok,
	false,
	'cross-kind extension preview plans must be rejected',
);
const changedSpecPlan = rehashPlan({
	...identityPreviewPlan,
	spec: {
		...identityPreviewPlan.spec,
		items: identityPreviewPlan.spec.items.map((item, index) => (
			index === 0 ? { ...item, description: 'Different task' } : item
		)),
	},
});
assert.equal(
	admitRuntimeMutationPreviewPlanV1(identityPreviewRequest, changedSpecPlan).ok,
	false,
	'extension preview plan spec must preserve the exact request intent',
);
for (const changedPlan of [
	rehashPlan({ ...identityPreviewPlan, clientInstanceId: 'different-client' }),
	rehashPlan({ ...identityPreviewPlan, idempotencyKeyHash: 'e'.repeat(64) }),
	rehashPlan({ ...identityPreviewPlan, correlationId: 'different-correlation' }),
]) {
	assert.equal(
		admitRuntimeMutationPreviewPlanV1(identityPreviewRequest, changedPlan).ok,
		false,
		'extension preview plan must preserve exact request bindings',
	);
}

const identityInvocation = identityWorkflowInvocationV1();
assert.equal(isTaskWorkflowInvocationV1(identityInvocation), true);
assert.equal(decodeRuntimeCliInvocationV1(identityInvocation).ok, true);
assert.equal(decodeBaseCliInvocationV1(identityInvocation).ok, false, 'frozen core must reject identity apply');

const envelope = identityWorkflowResultEnvelopeV1();
assert.equal(decodeRuntimeCliResultEnvelopeV1(envelope, identityInvocation).ok, true);
const filterFailureEnvelope = {
	contractVersion: 1,
	kind: 'cli-result',
	requestId: 'filter-query-route',
	command: 'tasks.filter-query',
	ok: false,
	transport: { channel: 'request-file', inputBytes: 128 },
	vaultIdentity: { expectedMatch: true },
	timing: { handlerMs: 1 },
	warnings: [],
	failure: {
		stage: 'readiness',
		error: {
			contractVersion: 1,
			code: 'live-settling',
			reason: 'Runtime is settling.',
			retryable: true,
			action: 'wait-and-retry',
		},
	},
};
assert.equal(decodeRuntimeCliResultEnvelopeV1(filterFailureEnvelope, filterInvocation as never).ok, true);
assert.equal(
	decodeRuntimeCliResultEnvelopeV1(filterFailureEnvelope, legacyCreateInvocation as never).ok,
	false,
	'result decoding must follow the originating route, not a permissive fallback',
);

const request = identityWorkflowApplyRequestV1();
const result = identityWorkflowAlreadyAppliedResultV1();
const scope = { vaultIdentityHash: TASK_WORKFLOW_VAULT_SHA256, clientInstanceId: TASK_WORKFLOW_CLIENT_ID };
assert.equal(admitRuntimeMutationResultV1(result, request, scope).ok, true);
assert.equal(
	admitRuntimeMutationResultV1(
		taskWorkflowAppliedResultV1(request, TASK_WORKFLOW_VAULT_SHA256),
		request,
		scope,
	).ok,
	true,
	'request-bound applied fixture must pass strict result admission',
);
for (const [field, replacement] of [
	['planHash', 'b'.repeat(64)],
	['idempotencyKeyHash', 'c'.repeat(64)],
	['mutationKind', 'task.adopt'],
	['targetDigest', 'd'.repeat(64)],
	['vaultIdentityHash', 'e'.repeat(64)],
	['clientInstanceId', 'different-client'],
] as const) {
	const forged = identityWorkflowAlreadyAppliedResultV1();
	if (!forged.receipt) throw new Error('fixture receipt missing');
	(forged.receipt as unknown as Record<string, unknown>)[field] = replacement;
	assert.equal(
		admitRuntimeMutationResultV1(forged, request, scope).ok,
		false,
		`extension receipt ${field} must bind exactly`,
	);
}

const continuationOrigin = twoGroupIdentityPlanV1();
const continuationRequest = {
	...identityWorkflowApplyRequestV1(),
	plan: continuationOrigin,
};
const chronologicalForgery = partialContinuationResultV1(continuationOrigin, {
	createdAt: '2026-08-08T23:57:29.000Z',
	remainingGroupIds: ['task-source:Second.md'],
});
const validContinuation = partialContinuationResultV1(continuationOrigin, {
	createdAt: continuationOrigin.createdAt,
	remainingGroupIds: ['task-source:Second.md'],
});
const validContinuationAdmission = admitRuntimeMutationResultV1(validContinuation, continuationRequest, scope);
assert.equal(
	validContinuationAdmission.ok,
	true,
	`valid extension continuation fixture must pass before negative mutations: ${JSON.stringify(validContinuationAdmission)}`,
);
assert.equal(
	admitRuntimeMutationResultV1(chronologicalForgery, continuationRequest, scope).ok,
	false,
	'extension continuation cannot predate its origin',
);
const groupIdForgery = partialContinuationResultV1(continuationOrigin, {
	createdAt: continuationOrigin.createdAt,
	remainingGroupIds: ['false-group-id'],
});
assert.equal(
	admitRuntimeMutationResultV1(groupIdForgery, continuationRequest, scope).ok,
	false,
	'extension remainingGroupIds must exactly bind the continuation plan',
);

console.log('Runtime base/extension compatibility tests passed');

function rehashPlan(plan: TaskWorkflowSealedPlanV1): TaskWorkflowSealedPlanV1 {
	const next = structuredClone(plan);
	const { planHash: _planHash, ...material } = next;
	next.planHash = sha256HexV1(canonicalJsonV1(toJsonValueV1(material)));
	return next;
}

function twoGroupIdentityPlanV1(): TaskWorkflowSealedPlanV1 {
	const plan = identityWorkflowPlanV1();
	plan.affectedResources.push({ resourceKind: 'task-source', resourceKey: 'Second.md', revision: 'absent' });
	plan.atomicGroups.push({
		groupId: 'task-source:Second.md',
		order: 1,
		resources: [{ resourceKind: 'task-source', resourceKey: 'Second.md' }],
	});
	plan.predictedEffects.push({ resourceKind: 'task-source', resourceKey: 'Second.md', action: 'create', summary: 'Create second resource.' });
	return rehashPlan(plan);
}

function partialContinuationResultV1(
	origin: TaskWorkflowSealedPlanV1,
	input: { createdAt: string; remainingGroupIds: string[] },
) {
	const continuation = structuredClone(origin);
	continuation.planId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
	continuation.createdAt = input.createdAt;
	continuation.expiresAt = new Date(Date.parse(input.createdAt) + 300_000).toISOString();
	continuation.affectedResources = [structuredClone(origin.affectedResources[1]!)];
	continuation.atomicGroups = [{ ...structuredClone(origin.atomicGroups[1]!), order: 0 }];
	continuation.predictedEffects = [structuredClone(origin.predictedEffects[1]!)];
	const sealedContinuation = rehashPlan(continuation);
	return {
		contractVersion: 1 as const,
		requestId: 'identity-apply-route',
		kind: 'mutation-result' as const,
		status: 'partial' as const,
		mutationMayHaveApplied: true,
		retryAllowed: false,
		groupResults: [
			{
				groupId: origin.atomicGroups[0]!.groupId,
				status: 'committed' as const,
				resourceRevisions: [{ ...origin.affectedResources[0]!, revision: 'committed-revision' }],
			},
			{
				groupId: origin.atomicGroups[1]!.groupId,
				status: 'failed' as const,
				error: {
					contractVersion: 1 as const,
					code: 'stale-plan' as const,
					reason: 'Second group failed.',
					retryable: false,
					action: 'refresh-state' as const,
				},
			},
		],
		continuation: {
			originPlanHash: origin.planHash,
			remainingGroupIds: input.remainingGroupIds,
			plan: sealedContinuation,
		},
		error: {
			contractVersion: 1 as const,
			code: 'stale-plan' as const,
			reason: 'Partial apply.',
			retryable: false,
			action: 'refresh-state' as const,
		},
	};
}
