import type {
	CliCommandV1,
	CliInvocationV1,
	CliResultEnvelopeV1,
	CapabilityAdvertisementV1,
	MutationApplyRequestV1,
	MutationPreviewRequestV1,
	MutationPreviewResultV1,
	MutationResultV1,
	SealedMutationPlanV1,
} from '../vendor/operon-plugin-v1/src/agent-runtime/contracts/v1';
import {
	admitMutationResultV1,
	decodeCliInvocationV1 as decodeBaseCliInvocationV1,
	decodeCliResultEnvelopeV1 as decodeBaseCliResultEnvelopeV1,
	decodeMutationApplyRequestV1 as decodeBaseMutationApplyRequestV1,
	decodeMutationResultV1 as decodeBaseMutationResultV1,
	decodeSealedMutationPlanV1 as decodeBaseSealedMutationPlanV1,
	type DecodeIssueV1,
	type DecodeResultV1,
} from '../vendor/operon-plugin-v1/src/agent-runtime/contracts/v1/decode';
import { canonicalJsonV1, sha256HexV1, toJsonValueV1 } from '../vendor/operon-plugin-v1/src/agent-runtime/contracts/v1/canonical';
import type {
	TaskWorkflowApplyRequestV1,
	TaskWorkflowCapabilityIdV1,
	TaskWorkflowCliInvocationV1,
	TaskWorkflowCliResultEnvelopeV1,
	TaskWorkflowMutationResultV1,
	TaskWorkflowPreviewRequestV1,
	TaskWorkflowPreviewResultV1,
	TaskWorkflowSealedPlanV1,
} from '../vendor/operon-plugin-v1/src/agent-runtime/extensions/task-workflows-v1/contracts';
import {
	decodeTaskWorkflowApplyRequestExtensionV1,
	decodeTaskWorkflowCliInvocationExtensionV1,
	decodeTaskWorkflowCliResultEnvelopeExtensionV1,
	decodeTaskWorkflowMutationResultExtensionV1,
	decodeTaskWorkflowPreviewRequestExtensionV1,
	decodeTaskWorkflowSealedPlanExtensionV1,
} from '../vendor/operon-plugin-v1/src/agent-runtime/extensions/task-workflows-v1/decode';

export type RuntimeCliCommandV1 = CliCommandV1 | TaskWorkflowCliInvocationV1['command'];
export type RuntimeCapabilityAdvertisementV1 = Omit<CapabilityAdvertisementV1, 'id'> & {
	id: CapabilityAdvertisementV1['id'] | TaskWorkflowCapabilityIdV1;
};
export type RuntimeCliInvocationV1 = CliInvocationV1 | TaskWorkflowCliInvocationV1;
export type RuntimeCliResultEnvelopeV1 = CliResultEnvelopeV1 | TaskWorkflowCliResultEnvelopeV1;
export type RuntimeMutationPreviewRequestV1 = MutationPreviewRequestV1 | TaskWorkflowPreviewRequestV1;
export type RuntimeMutationPreviewResultV1 = MutationPreviewResultV1 | TaskWorkflowPreviewResultV1;
export type RuntimeMutationApplyRequestV1 = MutationApplyRequestV1 | TaskWorkflowApplyRequestV1;
export type RuntimeMutationResultV1 = MutationResultV1 | TaskWorkflowMutationResultV1;
export type RuntimeSealedMutationPlanV1 = SealedMutationPlanV1 | TaskWorkflowSealedPlanV1;

export interface RuntimeMutationResultAdmissionScopeV1 {
	vaultIdentityHash: string;
	clientInstanceId: string;
}

export function isTaskWorkflowPlanV1(value: unknown): value is TaskWorkflowSealedPlanV1 {
	if (!isRecord(value)) return false;
	return (
		value.mutationKind === 'task.adopt'
		&& value.capability === 'tasks.adopt.preview'
	) || (
		value.mutationKind === 'task.create'
		&& value.capability === 'tasks.create.identity-placeholders'
	);
}

export function isTaskWorkflowPreviewRequestV1(value: unknown): value is TaskWorkflowPreviewRequestV1 {
	return isRecord(value)
		&& value.kind === 'mutation-preview'
		&& isTaskWorkflowPlanDiscriminator(value);
}

export function isTaskWorkflowApplyRequestV1(value: unknown): value is TaskWorkflowApplyRequestV1 {
	return isRecord(value)
		&& value.kind === 'mutation-apply'
		&& isTaskWorkflowPlanV1(value.plan);
}

export function isTaskWorkflowInvocationV1(value: unknown): value is TaskWorkflowCliInvocationV1 {
	if (!isRecord(value)) return false;
	if (value.command === 'tasks.filter-query') return true;
	if (value.command === 'mutation.preview') return isTaskWorkflowPreviewRequestV1(value.request);
	if (value.command === 'mutation.apply') return isTaskWorkflowApplyRequestV1(value.request);
	return false;
}

export function decodeRuntimeCliInvocationV1(
	value: unknown,
): DecodeResultV1<RuntimeCliInvocationV1> {
	return isTaskWorkflowInvocationV1(value)
		? decodeTaskWorkflowCliInvocationExtensionV1(value)
		: decodeBaseCliInvocationV1(value);
}

export function decodeRuntimeCliResultEnvelopeV1(
	value: unknown,
	originatingInvocation: RuntimeCliInvocationV1,
): DecodeResultV1<RuntimeCliResultEnvelopeV1> {
	return isTaskWorkflowInvocationV1(originatingInvocation)
		? decodeTaskWorkflowCliResultEnvelopeExtensionV1(value)
		: decodeBaseCliResultEnvelopeV1(value);
}

export function decodeRuntimeSealedMutationPlanV1(
	value: unknown,
): DecodeResultV1<RuntimeSealedMutationPlanV1> {
	return isTaskWorkflowPlanV1(value)
		? decodeTaskWorkflowSealedPlanExtensionV1(value)
		: decodeBaseSealedMutationPlanV1(value);
}

export function decodeRuntimeMutationApplyRequestV1(
	value: unknown,
): DecodeResultV1<RuntimeMutationApplyRequestV1> {
	return isTaskWorkflowApplyRequestV1(value)
		? decodeTaskWorkflowApplyRequestExtensionV1(value)
		: decodeBaseMutationApplyRequestV1(value);
}

export function decodeRuntimeMutationResultV1(
	value: unknown,
	plan: RuntimeSealedMutationPlanV1,
): DecodeResultV1<RuntimeMutationResultV1> {
	return isTaskWorkflowPlanV1(plan)
		? decodeTaskWorkflowMutationResultExtensionV1(value)
		: decodeBaseMutationResultV1(value);
}

export function admitRuntimeMutationPreviewPlanV1(
	requestValue: unknown,
	planValue: unknown,
): DecodeResultV1<RuntimeSealedMutationPlanV1> {
	const requestIsExtension = isTaskWorkflowPreviewRequestV1(requestValue);
	const planIsExtension = isTaskWorkflowPlanV1(planValue);
	if (requestIsExtension !== planIsExtension) {
		return {
			ok: false,
			issues: [issue('/plan', 'Preview request and sealed plan must use the same Runtime contract route.')],
		};
	}
	const decodedPlan = decodeRuntimeSealedMutationPlanV1(planValue);
	if (!decodedPlan.ok || !requestIsExtension || !planIsExtension) return decodedPlan;
	const decodedRequest = decodeTaskWorkflowPreviewRequestExtensionV1(requestValue);
	if (!decodedRequest.ok) return prefixIssues(decodedRequest, '/request');
	const request = decodedRequest.value;
	const plan = decodedPlan.value;
	const issues: DecodeIssueV1[] = [];
	for (const [actual, expected, path] of [
		[plan.capability, request.capability, '/plan/capability'],
		[plan.mutationKind, request.mutationKind, '/plan/mutationKind'],
		[plan.clientInstanceId, request.clientInstanceId, '/plan/clientInstanceId'],
		[plan.idempotencyKeyHash, sha256HexV1(request.idempotencyKey), '/plan/idempotencyKeyHash'],
		[plan.correlationId, request.correlationId ?? request.requestId, '/plan/correlationId'],
	] as const) {
		if (actual !== expected) issues.push(issue(path, 'Extension preview plan does not match its originating request.'));
	}
	if (request.mutationKind === 'task.create' && plan.mutationKind === 'task.create') {
		if (!canonicalEqual(plan.spec, request.spec)) {
			issues.push(issue('/plan/spec', 'Identity-placeholder plan spec must exactly preserve the preview request spec.'));
		}
	} else if (request.mutationKind === 'task.adopt' && plan.mutationKind === 'task.adopt') {
		const projected = {
			operation: plan.spec.operation,
			source: plan.spec.source,
			...(plan.spec.statusId !== undefined ? { statusId: plan.spec.statusId } : {}),
			...(plan.spec.terminalSourcePolicy !== undefined
				? { terminalSourcePolicy: plan.spec.terminalSourcePolicy }
				: {}),
		};
		if (!canonicalEqual(projected, request.spec)) {
			issues.push(issue('/plan/spec', 'Adoption plan must preserve every user-supplied preview intent field.'));
		}
	}
	return issues.length === 0 ? decodedPlan : { ok: false, issues };
}

export function admitRuntimeMutationResultV1(
	resultValue: unknown,
	applyRequestValue: unknown,
	scope: RuntimeMutationResultAdmissionScopeV1,
): DecodeResultV1<RuntimeMutationResultV1> {
	if (!isTaskWorkflowApplyRequestV1(applyRequestValue)) {
		return admitMutationResultV1(resultValue, applyRequestValue, scope);
	}
	const applyRequest = decodeTaskWorkflowApplyRequestExtensionV1(applyRequestValue);
	if (!applyRequest.ok) return prefixIssues(applyRequest, '/applyRequest');
	const result = decodeTaskWorkflowMutationResultExtensionV1(resultValue);
	if (!result.ok) return result;
	const issues: DecodeIssueV1[] = [];
	if (!/^[a-f0-9]{64}$/u.test(scope.vaultIdentityHash)) {
		issues.push(issue('/scope/vaultIdentityHash', 'Receipt admission requires a canonical SHA-256 vault identity.'));
	}
	if (!scope.clientInstanceId || scope.clientInstanceId.length > 128) {
		issues.push(issue('/scope/clientInstanceId', 'Receipt admission requires the exact bounded client instance id.'));
	}
	bindExtensionResult(result.value, applyRequest.value.plan, scope, issues);
	return issues.length === 0 ? result : { ok: false, issues };
}

function isTaskWorkflowPlanDiscriminator(value: Record<string, unknown>): boolean {
	return (
		value.mutationKind === 'task.adopt'
		&& value.capability === 'tasks.adopt.preview'
	) || (
		value.mutationKind === 'task.create'
		&& value.capability === 'tasks.create.identity-placeholders'
	);
}

function bindExtensionResult(
	result: TaskWorkflowMutationResultV1,
	plan: TaskWorkflowSealedPlanV1,
	scope: RuntimeMutationResultAdmissionScopeV1,
	issues: DecodeIssueV1[],
): void {
	if (result.groupResults.length > plan.atomicGroups.length) {
		issues.push(issue('/groupResults', 'Result contains more groups than the sealed extension plan.'));
	} else {
		result.groupResults.forEach((group, index) => {
			const planned = plan.atomicGroups[index];
			if (group.groupId !== planned?.groupId) {
				issues.push(issue(`/groupResults/${index}/groupId`, 'Result groups must be the exact ordered extension-plan prefix.'));
			}
			if (group.resourceRevisions !== undefined && planned !== undefined) {
				const actual = group.resourceRevisions.map(item => `${item.resourceKind}\0${item.resourceKey}`);
				const expected = planned.resources.map(item => `${item.resourceKind}\0${item.resourceKey}`);
				if (!canonicalEqual(actual, expected)) {
					issues.push(issue(`/groupResults/${index}/resourceRevisions`, 'Committed revisions must exactly cover the sealed extension group.'));
				}
			}
		});
	}
	if (result.receipt) {
		for (const [actual, expected, path] of [
			[result.receipt.planHash, plan.planHash, '/receipt/planHash'],
			[result.receipt.idempotencyKeyHash, plan.idempotencyKeyHash, '/receipt/idempotencyKeyHash'],
			[result.receipt.mutationKind, plan.mutationKind, '/receipt/mutationKind'],
			[result.receipt.targetDigest, plan.receiptTargetDigest, '/receipt/targetDigest'],
			[result.receipt.vaultIdentityHash, scope.vaultIdentityHash, '/receipt/vaultIdentityHash'],
			[result.receipt.clientInstanceId, scope.clientInstanceId, '/receipt/clientInstanceId'],
		] as const) {
			if (actual !== expected) issues.push(issue(path, 'Extension receipt does not match the admitted plan and Runtime scope.'));
		}
	}
	if (result.continuation) bindExtensionContinuation(result, plan, issues);
}

function bindExtensionContinuation(
	result: TaskWorkflowMutationResultV1,
	origin: TaskWorkflowSealedPlanV1,
	issues: DecodeIssueV1[],
): void {
	const continuation = result.continuation;
	if (!continuation) return;
	if (continuation.originPlanHash !== origin.planHash) {
		issues.push(issue('/continuation/originPlanHash', 'Continuation origin must be the admitted extension plan hash.'));
	}
	const plan = continuation.plan;
	for (const [actual, expected, field] of [
		[plan.capability, origin.capability, 'capability'],
		[plan.mutationKind, origin.mutationKind, 'mutationKind'],
		[plan.idempotencyKeyHash, origin.idempotencyKeyHash, 'idempotencyKeyHash'],
		[plan.receiptTargetDigest, origin.receiptTargetDigest, 'receiptTargetDigest'],
		[plan.targets, origin.targets, 'targets'],
		[plan.spec, origin.spec, 'spec'],
		[plan.riskLevel, origin.riskLevel, 'riskLevel'],
		[plan.requiresConfirmation, origin.requiresConfirmation, 'requiresConfirmation'],
		[plan.requiredAcknowledgements, origin.requiredAcknowledgements, 'requiredAcknowledgements'],
	] as const) {
		if (!canonicalEqual(actual, expected)) {
			issues.push(issue(`/continuation/plan/${field}`, 'Continuation must preserve the extension operation binding.'));
		}
	}
	if (plan.planId === origin.planId) issues.push(issue('/continuation/plan/planId', 'Continuation requires a fresh plan id.'));
	if (Date.parse(plan.createdAt) < Date.parse(origin.createdAt)) {
		issues.push(issue('/continuation/plan/createdAt', 'Continuation cannot predate its origin extension plan.'));
	}
	const stoppedIndex = result.groupResults.findIndex(group => group.status !== 'committed');
	if (stoppedIndex < 0 || result.groupResults[stoppedIndex]?.status === 'outcome-unknown') {
		issues.push(issue('/continuation', 'Continuation requires a proven untouched extension-plan suffix.'));
		return;
	}
	const expectedGroups = origin.atomicGroups.slice(stoppedIndex);
	if (
		plan.atomicGroups.length !== expectedGroups.length
		|| plan.atomicGroups.some((group, index) => (
			group.groupId !== expectedGroups[index]?.groupId
			|| !canonicalEqual(group.resources, expectedGroups[index]?.resources)
		))
	) {
		issues.push(issue('/continuation/plan/atomicGroups', 'Continuation groups must preserve the untouched extension-plan suffix.'));
	}
	if (!canonicalEqual(continuation.remainingGroupIds, plan.atomicGroups.map(group => group.groupId))) {
		issues.push(issue('/continuation/remainingGroupIds', 'Remaining group ids must exactly match the continuation extension plan.'));
	}
}

function prefixIssues<T>(result: DecodeResultV1<T>, prefix: string): DecodeResultV1<T> {
	if (result.ok) return result;
	return {
		ok: false,
		issues: result.issues.map(item => ({
			...item,
			path: `${prefix}${item.path === '/' ? '' : item.path}`,
		})),
	};
}

function issue(path: string, message: string): DecodeIssueV1 {
	return { path, code: 'value', message };
}

function canonicalEqual(left: unknown, right: unknown): boolean {
	try {
		return canonicalJsonV1(toJsonValueV1(left)) === canonicalJsonV1(toJsonValueV1(right));
	} catch {
		return false;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null
		&& typeof value === 'object'
		&& !Array.isArray(value)
		&& Object.getPrototypeOf(value) === Object.prototype;
}
