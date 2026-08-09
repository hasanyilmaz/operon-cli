import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
	buildMutationApplyRequestV1,
	markMutationPlanDispatchedV1,
	readMutationPlanV1,
	recordMutationOutcomeV1,
	storeMutationPlanV1,
	writeStoredPlanV1,
} from '../../src/plan-store';
import { canonicalJsonV1, sha256HexV1, toJsonValueV1 } from '../../vendor/operon-plugin-v1/src/agent-runtime/contracts/v1/canonical';
import {
	TASK_WORKFLOW_IDEMPOTENCY_KEY,
	identityWorkflowAlreadyAppliedResultV1,
	identityWorkflowPlanV1,
} from '../fixtures/task-workflow-contract';

const root = mkdtempSync(path.join(tmpdir(), 'operon-cli-extension-plan-store-'));
try {
	const plan = identityWorkflowPlanV1();
	if (plan.capability !== 'tasks.create.identity-placeholders') {
		throw new Error('expected identity-placeholder fixture plan');
	}
	const previewRequest = {
		contractVersion: 1 as const,
		requestId: 'identity-apply-route',
		kind: 'mutation-preview' as const,
		clientInstanceId: plan.clientInstanceId,
		idempotencyKey: TASK_WORKFLOW_IDEMPOTENCY_KEY,
		capability: 'tasks.create.identity-placeholders' as const,
		mutationKind: 'task.create' as const,
		spec: plan.spec,
		authorization: { basis: 'user-explicit-request' as const },
	};
	assert.throws(
		() => storeMutationPlanV1({
			vaultPath: '/private/tmp/test-vault',
			vaultSha256: 'a'.repeat(64),
			request: {
				...previewRequest,
				spec: {
					...previewRequest.spec,
					items: previewRequest.spec.items.map((item, index) => (
						index === 0 ? { ...item, description: 'Mismatched persisted intent' } : item
					)),
				},
			},
			plan,
		}, root),
		/PLAN_MALFORMED/u,
		'preview persistence must bind the exact extension request and plan',
	);
	const stored = storeMutationPlanV1({
		vaultPath: '/private/tmp/test-vault',
		vaultSha256: 'a'.repeat(64),
		request: previewRequest,
		plan,
	}, root);
	const restored = readMutationPlanV1(stored.planRef, root, {
		allowExpired: true,
		now: Date.parse(plan.createdAt),
	});
	assert.equal(restored.plan.capability, 'tasks.create.identity-placeholders');
	assert.equal(restored.plan.planHash, plan.planHash);

	const apply = buildMutationApplyRequestV1(restored, { now: '2026-08-09T00:00:00.000Z' });
	assert.equal(apply.plan.capability, 'tasks.create.identity-placeholders');
	const foreignPlan = structuredClone(plan);
	foreignPlan.planId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
	const { planHash: _foreignHash, ...foreignMaterial } = foreignPlan;
	foreignPlan.planHash = sha256HexV1(canonicalJsonV1(toJsonValueV1(foreignMaterial)));
	const foreignApply = { ...apply, plan: foreignPlan };
	assert.throws(
		() => markMutationPlanDispatchedV1(
			restored,
			foreignApply,
			root,
			Date.parse('2026-08-09T00:00:00.000Z'),
		),
		/PLAN_MALFORMED/u,
		'dispatch must reject an apply for a different sealed plan',
	);
	const dispatched = markMutationPlanDispatchedV1(
		restored,
		apply,
		root,
		Date.parse('2026-08-09T00:00:00.000Z'),
	);
	assert.equal(dispatched.applyRequest?.plan.planHash, plan.planHash);

	assert.throws(
		() => writeStoredPlanV1({ ...dispatched, applyRequest: foreignApply }, root),
		/PLAN_MALFORMED/u,
		'stored apply must bind the exact outer plan',
	);

	const terminalResult = {
		...identityWorkflowAlreadyAppliedResultV1(),
		requestId: apply.requestId,
	};
	assert.equal(
		recordMutationOutcomeV1(dispatched, apply, terminalResult, root),
		'retained',
	);
	const terminal = readMutationPlanV1(stored.planRef, root, {
		allowExpired: true,
		now: Date.parse('2026-08-09T00:00:02.000Z'),
	});
	assert.equal(terminal.terminalResult?.status, 'already-applied');
	assert.equal(terminal.applyRequest?.plan.capability, 'tasks.create.identity-placeholders');

	const forgedTerminal = structuredClone(terminal);
	if (!forgedTerminal.terminalResult?.receipt) throw new Error('expected stored terminal receipt');
	forgedTerminal.terminalResult.receipt.planHash = 'e'.repeat(64);
	assert.throws(
		() => writeStoredPlanV1(forgedTerminal, root),
		/PLAN_MALFORMED/u,
		'stored terminal receipts must be re-admitted against the stored apply and scope',
	);

	const planPath = path.join(root, 'plans', `${stored.planRef}.json`);
	writeFileSync(planPath, `${JSON.stringify(forgedTerminal)}\n`, { mode: 0o600 });
	chmodSync(planPath, 0o600);
	assert.throws(
		() => readMutationPlanV1(stored.planRef, root, { allowExpired: true }),
		/PLAN_MALFORMED/u,
		'restart must reject a forged terminal receipt',
	);
} finally {
	rmSync(root, { recursive: true, force: true });
}

console.log('Task-workflow plan store and recovery tests passed');
