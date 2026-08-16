import { canonicalJsonV1, sha256HexV1, toJsonValueV1 } from '../../vendor/operon-plugin-v1/src/agent-runtime/contracts/v1/canonical';
import type {
	TaskWorkflowApplyRequestV1,
	TaskWorkflowCliInvocationV1,
	TaskWorkflowCliResultEnvelopeV1,
	TaskWorkflowMutationResultV1,
	TaskWorkflowPreviewRequestV1,
	TaskWorkflowPreviewResultV1,
	TaskWorkflowSealedPlanV1,
} from '../../vendor/operon-plugin-v1/src/agent-runtime/extensions/task-workflows-v1/contracts';

export const TASK_WORKFLOW_VAULT_SHA256 = 'a'.repeat(64);
export const TASK_WORKFLOW_IDEMPOTENCY_KEY = 'identity-route-key-0001';
export const TASK_WORKFLOW_CLIENT_ID = 'operon-cli-extension';

export function identityWorkflowPreviewResultV1(
	request: Extract<TaskWorkflowPreviewRequestV1, { mutationKind: 'task.create' }>,
): TaskWorkflowPreviewResultV1 {
	const createdAt = new Date().toISOString();
	const resources = [...new Set(request.spec.items.map((item, index) => (
		item.target.mode === 'exact-path' ? item.target.filePath : `Tasks/Task-${index + 1}.md`
	)))];
	const plan: TaskWorkflowSealedPlanV1 = {
		contractVersion: 1,
		planId: sha256HexV1(`plan\0${request.requestId}`),
		planHash: '',
		clientInstanceId: request.clientInstanceId,
		correlationId: request.correlationId ?? request.requestId,
		idempotencyKeyHash: sha256HexV1(request.idempotencyKey),
		receiptTargetDigest: '',
		capability: request.capability,
		mutationKind: request.mutationKind,
		createdAt,
		expiresAt: new Date(Date.parse(createdAt) + 300_000).toISOString(),
		targets: request.spec.items.map((item, index) => {
			const filePath = item.target.mode === 'exact-path'
				? item.target.filePath
				: `Tasks/Task-${index + 1}.md`;
			const operonId = sha256HexV1(`task\0${request.requestId}\0${item.itemRef}`).slice(0, 7);
			return {
				operonId,
				locator: { representation: 'file' as const, filePath },
				targetDigest: sha256HexV1(`target\0${operonId}\0${filePath}`),
			};
		}),
		contextRevision: fixtureContextRevisionV1(),
		affectedResources: resources.map(resourceKey => ({ resourceKind: 'task-source' as const, resourceKey, revision: 'absent' })),
		atomicGroups: resources.map((resourceKey, order) => ({
			groupId: `task-source:${resourceKey}`,
			order,
			resources: [{ resourceKind: 'task-source' as const, resourceKey }],
		})),
		predictedEffects: resources.map(resourceKey => ({
			resourceKind: 'task-source' as const,
			resourceKey,
			action: 'create' as const,
			summary: 'Create task.',
		})),
		riskLevel: 'routine',
		requiresConfirmation: false,
		requiredAcknowledgements: [],
		warnings: [],
		spec: structuredClone(request.spec),
		createEffects: request.spec.items.map((item, index) => {
			const target = request.spec.items[index]!.target;
			const filePath = target.mode === 'exact-path' ? target.filePath : `Tasks/Task-${index + 1}.md`;
			const operonId = sha256HexV1(`task\0${request.requestId}\0${item.itemRef}`).slice(0, 7);
			return {
				itemRef: item.itemRef,
				operonId,
				locator: { representation: 'file' as const, filePath },
				renderedTaskDigest: sha256HexV1(`rendered\0${item.description}\0${operonId}`),
				plannedSourceDigest: sha256HexV1(`source\0${filePath}\0${item.description}`),
				expectedAbsence: true,
				templateIdentityAllocations: [],
				resolvedRelatedOperonIds: [],
			};
		}),
	};
	plan.targets.forEach((target, index) => {
		target.targetDigest = sha256HexV1(canonicalJsonV1(toJsonValueV1(plan.createEffects[index]!)));
	});
	sealPlanV1(plan);
	return { contractVersion: 1, requestId: request.requestId, kind: 'mutation-preview-result', ok: true, plan, warnings: [] };
}

export function adoptWorkflowPreviewResultV1(
	request: Extract<TaskWorkflowPreviewRequestV1, { mutationKind: 'task.adopt' }>,
): TaskWorkflowPreviewResultV1 {
	const createdAt = new Date().toISOString();
	const operonId = sha256HexV1(`adopt\0${request.requestId}\0${request.spec.source.filePath}\0${request.spec.source.lineNumber}`).slice(0, 7);
	const resultingLine = `${request.spec.source.expectedLine} <!-- operon:id=${operonId} -->`;
	const resourceKey = request.spec.source.filePath;
	const plan: TaskWorkflowSealedPlanV1 = {
		contractVersion: 1,
		planId: sha256HexV1(`plan\0${request.requestId}`),
		planHash: '',
		clientInstanceId: request.clientInstanceId,
		correlationId: request.correlationId ?? request.requestId,
		idempotencyKeyHash: sha256HexV1(request.idempotencyKey),
		receiptTargetDigest: '',
		capability: request.capability,
		mutationKind: request.mutationKind,
		createdAt,
		expiresAt: new Date(Date.parse(createdAt) + 300_000).toISOString(),
		targets: [{
			operonId,
			locator: { representation: 'inline', filePath: resourceKey, lineNumber: request.spec.source.lineNumber },
			targetDigest: sha256HexV1(`target\0${operonId}\0${resourceKey}\0${request.spec.source.lineNumber}`),
		}],
		contextRevision: fixtureContextRevisionV1(),
		affectedResources: [{ resourceKind: 'task-source', resourceKey, revision: sha256HexV1(request.spec.source.expectedLine) }],
		atomicGroups: [{ groupId: `task-source:${resourceKey}`, order: 0, resources: [{ resourceKind: 'task-source', resourceKey }] }],
		predictedEffects: [{ resourceKind: 'task-source', resourceKey, action: 'update', summary: 'Adopt inline task.' }],
		riskLevel: 'routine',
		requiresConfirmation: false,
		requiredAcknowledgements: [],
		warnings: [],
		spec: {
			...structuredClone(request.spec),
			operonId,
			...(request.spec.statusId !== undefined ? { resolvedStatusId: request.spec.statusId } : {}),
			resultingLine,
			sourceDigest: sha256HexV1(request.spec.source.expectedLine),
			resultDigest: sha256HexV1(resultingLine),
			locator: { representation: 'inline', filePath: resourceKey, lineNumber: request.spec.source.lineNumber },
		},
	};
	sealPlanV1(plan);
	return { contractVersion: 1, requestId: request.requestId, kind: 'mutation-preview-result', ok: true, plan, warnings: [] };
}

export function taskWorkflowAppliedResultV1(
	request: TaskWorkflowApplyRequestV1,
	vaultIdentityHash: string,
): TaskWorkflowMutationResultV1 {
	const effectiveAt = new Date().toISOString();
	const completedAt = new Date(Date.parse(effectiveAt) + 1).toISOString();
	return {
		contractVersion: 1,
		requestId: request.requestId,
		kind: 'mutation-result',
		status: 'applied',
		mutationMayHaveApplied: true,
		retryAllowed: false,
		groupResults: request.plan.atomicGroups.map(group => ({
			groupId: group.groupId,
			status: 'committed',
			resourceRevisions: group.resources.map(resource => ({
				...resource,
				revision: sha256HexV1(`revision\0${resource.resourceKind}\0${resource.resourceKey}`),
			})),
		})),
		receipt: {
			contractVersion: 1,
			vaultIdentityHash,
			clientInstanceId: request.plan.clientInstanceId,
			idempotencyKeyHash: request.plan.idempotencyKeyHash,
			planHash: request.plan.planHash,
			mutationKind: request.plan.mutationKind,
			targetDigest: request.plan.receiptTargetDigest,
			terminalOutcome: 'applied',
			effectiveAt,
			completedAt,
			expiresAt: new Date(Date.parse(completedAt) + 86_400_000).toISOString(),
		},
		postflight: { status: 'verified', observedAt: completedAt, contextRevision: structuredClone(request.plan.contextRevision) },
	};
}

export function identityWorkflowPlanV1(): TaskWorkflowSealedPlanV1 {
	const plan: TaskWorkflowSealedPlanV1 = {
		contractVersion: 1,
		planId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
		planHash: '',
		clientInstanceId: TASK_WORKFLOW_CLIENT_ID,
		correlationId: 'identity-apply-route',
		idempotencyKeyHash: sha256HexV1(TASK_WORKFLOW_IDEMPOTENCY_KEY),
		receiptTargetDigest: '',
		capability: 'tasks.create.identity-placeholders',
		mutationKind: 'task.create',
		createdAt: '2026-08-08T23:57:30.000Z',
		expiresAt: '2026-08-09T00:02:30.000Z',
		targets: [{
			operonId: 'abc1234',
			locator: { representation: 'file', filePath: 'Tasks/Task.md' },
			targetDigest: 'd'.repeat(64),
		}],
		contextRevision: {
			index: { sessionId: 'runtime-test', ramGeneration: 1, durable: { status: 'missing' } },
			settingsFingerprint: '1'.repeat(64),
			pinnedGeneration: 0,
			activeTrackerGeneration: 0,
			repeatSeriesRevision: 0,
			projectSerialGeneration: 0,
			projectSerialSignature: '2'.repeat(64),
		},
		affectedResources: [{ resourceKind: 'task-source', resourceKey: 'Tasks/Task.md', revision: 'absent' }],
		atomicGroups: [{
			groupId: 'task-source:Tasks/Task.md',
			order: 0,
			resources: [{ resourceKind: 'task-source', resourceKey: 'Tasks/Task.md' }],
		}],
		predictedEffects: [{ resourceKind: 'task-source', resourceKey: 'Tasks/Task.md', action: 'create', summary: 'Create task.' }],
		riskLevel: 'routine',
		requiresConfirmation: false,
		requiredAcknowledgements: [],
		warnings: [],
		spec: {
			operation: 'create',
			items: [{
				itemRef: 'item-1',
				description: 'Task',
				target: {
					representation: 'file',
					mode: 'configured-default',
					identityPlaceholderPolicy: 'resolve-operon-id-v1',
				},
				fields: [],
			}],
		},
		createEffects: [{
			itemRef: 'item-1',
			operonId: 'abc1234',
			locator: { representation: 'file', filePath: 'Tasks/Task.md' },
			renderedTaskDigest: 'f'.repeat(64),
			plannedSourceDigest: '1'.repeat(64),
			expectedAbsence: true,
			templateIdentityAllocations: [{ occurrence: 0, operonId: 'def5678' }],
			resolvedRelatedOperonIds: [],
		}],
	};
	plan.receiptTargetDigest = sha256HexV1(canonicalJsonV1(toJsonValueV1(plan.targets)));
	const { planHash: _planHash, ...material } = plan;
	plan.planHash = sha256HexV1(canonicalJsonV1(toJsonValueV1(material)));
	return plan;
}

export function identityWorkflowApplyRequestV1(): TaskWorkflowApplyRequestV1 {
	return {
		contractVersion: 1,
		requestId: 'identity-apply-route',
		kind: 'mutation-apply',
		plan: identityWorkflowPlanV1(),
		authorization: { basis: 'user-explicit-request' },
		idempotencyKey: TASK_WORKFLOW_IDEMPOTENCY_KEY,
		acknowledgements: [],
	};
}

export function identityWorkflowInvocationV1(): TaskWorkflowCliInvocationV1 {
	return {
		contractVersion: 1,
		kind: 'cli-invocation',
		requestId: 'identity-apply-route',
		command: 'mutation.apply',
		mode: 'live',
		clientVersion: '1.1.2',
		compatibility: { contractVersion: 1, runtimeApi: { min: 1, max: 1 } },
		cliContract: { min: 1, max: 1 },
		expectedVaultSha256: TASK_WORKFLOW_VAULT_SHA256,
		readinessTimeoutMs: 15_000,
		request: identityWorkflowApplyRequestV1(),
	};
}

export function identityWorkflowAlreadyAppliedResultV1(): TaskWorkflowMutationResultV1 {
	const plan = identityWorkflowPlanV1();
	return {
		contractVersion: 1,
		requestId: 'identity-apply-route',
		kind: 'mutation-result',
		status: 'already-applied',
		mutationMayHaveApplied: true,
		retryAllowed: false,
		groupResults: [],
		receipt: {
			contractVersion: 1,
			vaultIdentityHash: TASK_WORKFLOW_VAULT_SHA256,
			clientInstanceId: TASK_WORKFLOW_CLIENT_ID,
			idempotencyKeyHash: plan.idempotencyKeyHash,
			planHash: plan.planHash,
			mutationKind: plan.mutationKind,
			targetDigest: plan.receiptTargetDigest,
			terminalOutcome: 'already-applied',
			effectiveAt: '2026-08-09T00:00:00.000Z',
			completedAt: '2026-08-09T00:00:01.000Z',
			expiresAt: '2026-08-09T23:00:01.000Z',
		},
		postflight: { status: 'receipt-replay' },
	};
}

export function identityWorkflowResultEnvelopeV1(): TaskWorkflowCliResultEnvelopeV1 {
	return {
		contractVersion: 1,
		kind: 'cli-result',
		requestId: 'identity-apply-route',
		command: 'mutation.apply',
		ok: true,
		transport: { channel: 'request-file', inputBytes: 1 },
		vaultIdentity: { expectedMatch: true },
		compatibility: { contractVersion: 1, compatible: true, runtimeApi: 1 },
		cliContract: 1,
		runtime: { appVersion: '1.13.3', plugin: { id: 'operon', version: '3.2.0', minAppVersion: '1.7.2' }, apiVersion: 1 },
		timing: { handlerMs: 1 },
		warnings: [],
		result: identityWorkflowAlreadyAppliedResultV1(),
	};
}

function fixtureContextRevisionV1() {
	return {
		index: { sessionId: 'runtime-test', ramGeneration: 1, durable: { status: 'missing' as const } },
		settingsFingerprint: '1'.repeat(64),
		pinnedGeneration: 0,
		activeTrackerGeneration: 0,
		repeatSeriesRevision: 0,
		projectSerialGeneration: 0,
		projectSerialSignature: '2'.repeat(64),
	};
}

function sealPlanV1(plan: TaskWorkflowSealedPlanV1): void {
	plan.receiptTargetDigest = sha256HexV1(canonicalJsonV1(toJsonValueV1(plan.targets)));
	const { planHash: _planHash, ...material } = plan;
	plan.planHash = sha256HexV1(canonicalJsonV1(toJsonValueV1(material)));
}
