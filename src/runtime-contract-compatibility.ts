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
import { CONTRACT_LIMITS_V1, utf8ByteLengthV1 } from '../vendor/operon-plugin-v1/src/agent-runtime/contracts/v1/primitives';
import {
	FILE_TASK_TITLES_EXTENSION_V1,
	type FileTaskTitlesApplyRequestV1,
	type FileTaskTitlesCapabilityV1,
	type FileTaskTitlesCliInvocationV1,
	type FileTaskTitlesCliResultEnvelopeV1,
	type FileTaskTitlesMutationResultV1,
	type FileTaskTitlesPreviewRequestV1,
	type FileTaskTitlesPreviewResultV1,
	type FileTaskTitlesSealedPlanV1,
} from '../vendor/operon-plugin-v1/src/agent-runtime/extensions/file-task-titles-v1/contracts';
import {
	decodeFileTaskTitlesApplyV1,
	decodeFileTaskTitlesMutationResultV1,
	decodeFileTaskTitlesPlanV1,
	decodeFileTaskTitlesPreviewResultV1,
	decodeFileTaskTitlesPreviewV1,
	fileTaskTitlesExecutionKeyV1,
	fileTaskTitlesExecutionRequestV1,
	isFileTaskTitlesPreviewCapabilityV1,
} from '../vendor/operon-plugin-v1/src/agent-runtime/extensions/file-task-titles-v1/decode';
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
	id: CapabilityAdvertisementV1['id'] | TaskWorkflowCapabilityIdV1 | FileTaskTitlesCapabilityV1;
};
export type RuntimeCliInvocationV1 = CliInvocationV1 | TaskWorkflowCliInvocationV1 | FileTaskTitlesCliInvocationV1;
export type RuntimeCliResultEnvelopeV1 = CliResultEnvelopeV1 | TaskWorkflowCliResultEnvelopeV1 | FileTaskTitlesCliResultEnvelopeV1;
export type RuntimeMutationPreviewRequestV1 = MutationPreviewRequestV1 | TaskWorkflowPreviewRequestV1 | FileTaskTitlesPreviewRequestV1;
export type RuntimeMutationPreviewResultV1 = MutationPreviewResultV1 | TaskWorkflowPreviewResultV1 | FileTaskTitlesPreviewResultV1;
export type RuntimeMutationApplyRequestV1 = MutationApplyRequestV1 | TaskWorkflowApplyRequestV1 | FileTaskTitlesApplyRequestV1;
export type RuntimeMutationResultV1 = MutationResultV1 | TaskWorkflowMutationResultV1 | FileTaskTitlesMutationResultV1;
export type RuntimeSealedMutationPlanV1 = SealedMutationPlanV1 | TaskWorkflowSealedPlanV1 | FileTaskTitlesSealedPlanV1;

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
	) || (
		value.mutationKind === 'task.create'
		&& value.capability === 'tasks.create.periodic-note.preview'
	) || (
		value.mutationKind === 'task.update'
		&& value.capability === 'tasks.update.periodic-note.preview'
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

export function isFileTaskTitlesPlanV1(value: unknown): value is FileTaskTitlesSealedPlanV1 {
	return isRecord(value) && (
		value.extension === FILE_TASK_TITLES_EXTENSION_V1
		|| isFileTaskTitlesPreviewCapabilityV1(value.capability)
	);
}

function isFileTaskTitlesPreviewRequestV1(value: unknown): value is FileTaskTitlesPreviewRequestV1 {
	return isRecord(value) && value.kind === 'mutation-preview'
		&& isFileTaskTitlesPreviewCapabilityV1(value.capability);
}

function isFileTaskTitlesApplyRequestV1(value: unknown): value is FileTaskTitlesApplyRequestV1 {
	return isRecord(value) && value.kind === 'mutation-apply' && isFileTaskTitlesPlanV1(value.plan);
}

function isFileTaskTitlesInvocationV1(value: unknown): value is FileTaskTitlesCliInvocationV1 {
	if (!isRecord(value)) return false;
	return (value.command === 'mutation.preview' && isFileTaskTitlesPreviewRequestV1(value.request))
		|| (value.command === 'mutation.apply' && isFileTaskTitlesApplyRequestV1(value.request));
}

export function decodeRuntimeCliInvocationV1(
	value: unknown,
): DecodeResultV1<RuntimeCliInvocationV1> {
	if (isFileTaskTitlesInvocationV1(value)) return decodeFileTaskTitlesInvocationV1(value);
	return isTaskWorkflowInvocationV1(value)
		? decodeTaskWorkflowCliInvocationExtensionV1(value)
		: decodeBaseCliInvocationV1(value);
}

export function decodeRuntimeCliResultEnvelopeV1(
	value: unknown,
	originatingInvocation: RuntimeCliInvocationV1,
): DecodeResultV1<RuntimeCliResultEnvelopeV1> {
	if (isFileTaskTitlesInvocationV1(originatingInvocation)) {
		return decodeFileTaskTitlesEnvelopeV1(value, originatingInvocation.command);
	}
	return isTaskWorkflowInvocationV1(originatingInvocation)
		? decodeTaskWorkflowCliResultEnvelopeExtensionV1(value)
		: decodeBaseCliResultEnvelopeV1(value);
}

export function decodeRuntimeSealedMutationPlanV1(
	value: unknown,
): DecodeResultV1<RuntimeSealedMutationPlanV1> {
	if (isFileTaskTitlesPlanV1(value)) return decodeFileTaskTitlesPlanV1(value);
	return isTaskWorkflowPlanV1(value)
		? decodeTaskWorkflowSealedPlanExtensionV1(value)
		: decodeBaseSealedMutationPlanV1(value);
}

export function decodeRuntimeMutationApplyRequestV1(
	value: unknown,
): DecodeResultV1<RuntimeMutationApplyRequestV1> {
	if (isFileTaskTitlesApplyRequestV1(value)) return decodeFileTaskTitlesApplyV1(value);
	return isTaskWorkflowApplyRequestV1(value)
		? decodeTaskWorkflowApplyRequestExtensionV1(value)
		: decodeBaseMutationApplyRequestV1(value);
}

export function decodeRuntimeMutationResultV1(
	value: unknown,
	plan: RuntimeSealedMutationPlanV1,
): DecodeResultV1<RuntimeMutationResultV1> {
	if (isFileTaskTitlesPlanV1(plan)) return decodeFileTaskTitlesMutationResultV1(value);
	return isTaskWorkflowPlanV1(plan)
		? decodeTaskWorkflowMutationResultExtensionV1(value)
		: decodeBaseMutationResultV1(value);
}

export function admitRuntimeMutationPreviewPlanV1(
	requestValue: unknown,
	planValue: unknown,
): DecodeResultV1<RuntimeSealedMutationPlanV1> {
	const requestUsesTitle = isFileTaskTitlesPreviewRequestV1(requestValue);
	const planUsesTitle = isFileTaskTitlesPlanV1(planValue);
	if (requestUsesTitle || planUsesTitle) {
		if (!requestUsesTitle || !planUsesTitle) {
			return { ok: false, issues: [issue('/plan', 'Preview request and plan must use the same Runtime contract route.')] };
		}
		return admitFileTaskTitlesPlanV1(requestValue, planValue);
	}
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
			issues.push(issue('/plan/spec', 'Task workflow create plan must exactly preserve the preview request spec.'));
		}
	} else if (request.mutationKind === 'task.update' && plan.mutationKind === 'task.update') {
		if (!canonicalEqual(plan.spec, request.spec)) {
			issues.push(issue('/plan/spec', 'Periodic task update plan must exactly preserve the preview request spec.'));
		}
		if (
			plan.capability === 'tasks.update.periodic-note.preview'
			&& request.capability === 'tasks.update.periodic-note.preview'
			&& (
				!canonicalEqual(plan.periodicUpdate.originalLocator, request.spec.target.locator)
				|| !canonicalEqual(plan.targets[0]?.locator, request.spec.target.locator)
			)
		) {
			issues.push(issue('/plan/periodicUpdate/originalLocator', 'Periodic task update plan must preserve the exact physical task locator.'));
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
	if (isFileTaskTitlesApplyRequestV1(applyRequestValue)) {
		const apply = decodeFileTaskTitlesApplyV1(applyRequestValue);
		if (!apply.ok) return prefixIssues(apply, '/applyRequest');
		const result = decodeFileTaskTitlesMutationResultV1(resultValue);
		if (!result.ok) return result;
		const issues: DecodeIssueV1[] = [];
		if (result.value.requestId !== apply.value.requestId) {
			issues.push(issue('/requestId', 'Title result must match the apply request ID.'));
		}
		bindExtensionResult(result.value, apply.value.plan, scope, issues);
		return issues.length === 0 ? result : { ok: false, issues };
	}
	if (!isTaskWorkflowApplyRequestV1(applyRequestValue)) {
		return admitMutationResultV1(resultValue, applyRequestValue, scope);
	}
	const applyRequest = decodeTaskWorkflowApplyRequestExtensionV1(applyRequestValue);
	if (!applyRequest.ok) return prefixIssues(applyRequest, '/applyRequest');
	const result = decodeTaskWorkflowMutationResultExtensionV1(resultValue);
	if (!result.ok) return result;
	const issues: DecodeIssueV1[] = [];
	bindExtensionResult(result.value, applyRequest.value.plan, scope, issues);
	return issues.length === 0 ? result : { ok: false, issues };
}

function decodeFileTaskTitlesInvocationV1(
	value: FileTaskTitlesCliInvocationV1,
): DecodeResultV1<FileTaskTitlesCliInvocationV1> {
	if (!withinSerializedCap(value, CONTRACT_LIMITS_V1.transportInputBytes)) {
		return { ok: false, issues: [issue('/', 'CLI invocation exceeds the Runtime input limit.')] };
	}
	// Validate the existing CLI envelope against an equivalent base request.
	// Only the original extension request is returned for transport.
	if (value.command === 'mutation.preview') {
		const request = decodeFileTaskTitlesPreviewV1(value.request);
		if (!request.ok) return prefixIssues(request, '/request');
		const envelope = decodeBaseCliInvocationV1({ ...value, request: fileTaskTitlesExecutionRequestV1(request.value) });
		if (!envelope.ok) return envelope;
		return { ok: true, value: { ...envelope.value, command: value.command, request: request.value } };
	}
	const request = decodeFileTaskTitlesApplyV1(value.request);
	if (!request.ok) return prefixIssues(request, '/request');
	const { plan, idempotencyKey, acknowledgements } = request.value;
	const envelope = decodeBaseCliInvocationV1({
		...value,
		request: {
			...request.value,
			plan: plan.executionPlan,
			idempotencyKey: fileTaskTitlesExecutionKeyV1(plan.capability, idempotencyKey),
			acknowledgements: acknowledgements.map(item => ({ ...item, planHash: plan.executionPlan.planHash })),
		},
	});
	if (!envelope.ok) return envelope;
	return { ok: true, value: { ...envelope.value, command: value.command, request: request.value } };
}

function decodeFileTaskTitlesEnvelopeV1(
	value: unknown,
	command: FileTaskTitlesCliInvocationV1['command'],
): DecodeResultV1<RuntimeCliResultEnvelopeV1> {
	if (!isRecord(value) || value.command !== command) {
		return { ok: false, issues: [issue('/command', 'CLI result must match the title invocation command.')] };
	}
	if (value.ok !== true) return decodeBaseCliResultEnvelopeV1(value);
	if (!withinSerializedCap(value, CONTRACT_LIMITS_V1.transportResultBytes)) {
		return { ok: false, issues: [issue('/', 'CLI result exceeds the Runtime output limit.')] };
	}
	if (command === 'mutation.preview') {
		const result = decodeFileTaskTitlesPreviewResultV1(value.result);
		if (!result.ok) return prefixIssues(result, '/result');
		const baseResult = result.value.ok ? { ...result.value, plan: result.value.plan.executionPlan } : result.value;
		return validatedTitleEnvelope(value, baseResult, result.value);
	}
	const result = decodeFileTaskTitlesMutationResultV1(value.result);
	if (!result.ok) return prefixIssues(result, '/result');
	const { recoveryOutcome: _recoveryOutcome, continuation, ...baseResult } = result.value;
	return validatedTitleEnvelope(value, {
		...baseResult,
		...(continuation ? { continuation: { ...continuation, plan: continuation.plan.executionPlan } } : {}),
	}, result.value);
}

function validatedTitleEnvelope(
	value: Record<string, unknown>,
	baseResult: MutationPreviewResultV1 | MutationResultV1,
	titleResult: FileTaskTitlesPreviewResultV1 | FileTaskTitlesMutationResultV1,
): DecodeResultV1<FileTaskTitlesCliResultEnvelopeV1> {
	const envelope = decodeBaseCliResultEnvelopeV1({ ...value, result: baseResult });
	if (!envelope.ok) return envelope;
	return { ok: true, value: { ...envelope.value, result: titleResult } as FileTaskTitlesCliResultEnvelopeV1 };
}

function admitFileTaskTitlesPlanV1(
	requestValue: FileTaskTitlesPreviewRequestV1,
	planValue: FileTaskTitlesSealedPlanV1,
): DecodeResultV1<FileTaskTitlesSealedPlanV1> {
	const decodedRequest = decodeFileTaskTitlesPreviewV1(requestValue);
	if (!decodedRequest.ok) return prefixIssues(decodedRequest, '/request');
	const decodedPlan = decodeFileTaskTitlesPlanV1(planValue);
	if (!decodedPlan.ok) return decodedPlan;
	const request = decodedRequest.value;
	const plan = decodedPlan.value;
	const issues: DecodeIssueV1[] = [];
	for (const [actual, expected, path] of [
		[plan.capability, request.capability, '/plan/capability'],
		[plan.mutationKind, request.mutationKind, '/plan/mutationKind'],
		[plan.clientInstanceId, request.clientInstanceId, '/plan/clientInstanceId'],
		[plan.idempotencyKeyHash, sha256HexV1(request.idempotencyKey), '/plan/idempotencyKeyHash'],
		[plan.executionPlan.idempotencyKeyHash, sha256HexV1(fileTaskTitlesExecutionKeyV1(request.capability, request.idempotencyKey)), '/plan/executionPlan/idempotencyKeyHash'],
		[plan.correlationId, request.correlationId ?? request.requestId, '/plan/correlationId'],
		[plan.spec, request.spec, '/plan/spec'],
	] as const) {
		if (!canonicalEqual(actual, expected)) issues.push(issue(path, 'Title plan must match its originating preview request.'));
	}
	const target = plan.targets[0];
	if (request.capability === 'tasks.file.title.preview') {
		const { operonId, locator } = request.target;
		if (target?.operonId !== operonId || !canonicalEqual(target.locator, locator)) {
			issues.push(issue('/plan/targets', 'Title edit must preserve the exact File Task ID and path.'));
		}
		// The Runtime may also refresh a parent task's metadata in another file.
		const sourceEffects = plan.predictedEffects.filter(effect => effect.resourceKind === 'task-source');
		if (
			sourceEffects.some(effect => effect.action !== 'update')
			|| (sourceEffects.length > 0 && !sourceEffects.some(effect => effect.resourceKey === locator.filePath))
		) {
			issues.push(issue('/plan/predictedEffects', 'Title edit cannot change the File Task path.'));
		}
	} else {
		const item = request.spec.item;
		const effect = plan.createEffects?.[0];
		if (
			plan.createEffects?.length !== 1
			|| plan.targets.length !== 1
			|| effect?.itemRef !== item.itemRef
			|| effect.locator.representation !== 'file'
			|| effect.operonId !== target?.operonId
			|| !canonicalEqual(effect.locator, target.locator)
			|| (item.target.mode === 'exact-path' && effect.locator.filePath !== item.target.filePath)
		) {
			issues.push(issue('/plan/createEffects', 'Title creation must seal the requested File Task and exact path.'));
		}
	}
	return issues.length === 0 ? decodedPlan : { ok: false, issues };
}

function isTaskWorkflowPlanDiscriminator(value: Record<string, unknown>): boolean {
	return (
		value.mutationKind === 'task.adopt'
		&& value.capability === 'tasks.adopt.preview'
	) || (
		value.mutationKind === 'task.create'
		&& value.capability === 'tasks.create.identity-placeholders'
	) || (
		value.mutationKind === 'task.create'
		&& value.capability === 'tasks.create.periodic-note.preview'
	) || (
		value.mutationKind === 'task.update'
		&& value.capability === 'tasks.update.periodic-note.preview'
	);
}

function bindExtensionResult(
	result: TaskWorkflowMutationResultV1 | FileTaskTitlesMutationResultV1,
	plan: TaskWorkflowSealedPlanV1 | FileTaskTitlesSealedPlanV1,
	scope: RuntimeMutationResultAdmissionScopeV1,
	issues: DecodeIssueV1[],
): void {
	if (!/^[a-f0-9]{64}$/u.test(scope.vaultIdentityHash)) {
		issues.push(issue('/scope/vaultIdentityHash', 'Receipt admission requires a canonical SHA-256 vault identity.'));
	}
	if (!scope.clientInstanceId || scope.clientInstanceId.length > 128) {
		issues.push(issue('/scope/clientInstanceId', 'Receipt admission requires the exact bounded client instance id.'));
	}
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
	result: TaskWorkflowMutationResultV1 | FileTaskTitlesMutationResultV1,
	origin: TaskWorkflowSealedPlanV1 | FileTaskTitlesSealedPlanV1,
	issues: DecodeIssueV1[],
): void {
	const continuation = result.continuation;
	if (!continuation) return;
	if (continuation.originPlanHash !== origin.planHash) {
		issues.push(issue('/continuation/originPlanHash', 'Continuation origin must be the admitted extension plan hash.'));
	}
	const plan = continuation.plan;
	if (isFileTaskTitlesPlanV1(origin) && (
		!isFileTaskTitlesPlanV1(plan)
		|| plan.executionPlan.idempotencyKeyHash !== origin.executionPlan.idempotencyKeyHash
		|| plan.clientInstanceId !== origin.clientInstanceId
	)) {
		issues.push(issue('/continuation/plan', 'Title continuation must preserve the sealed execution identity.'));
	}
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

function withinSerializedCap(value: unknown, limit: number): boolean {
	try {
		return utf8ByteLengthV1(JSON.stringify(value)) <= limit;
	} catch {
		return false;
	}
}
