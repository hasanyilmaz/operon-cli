import assert from 'node:assert/strict';
import path from 'node:path';

import { createWindowsPersistentBootstrapPortV1 } from '../../src/client';

import {
	PersistentReadTransportErrorV1,
	bootstrapWindowsPersistentDescriptorV1,
	connectWindowsPersistentWithBootstrapV1,
	decodeWindowsPersistentBootstrapV1,
	decodeWindowsPersistentBootstrapResponseV1,
	type WindowsPersistentBootstrapRequestV1,
} from '../../src/persistent-read-client';

const vaultSha256 = 'a'.repeat(64);
const clientNonce = 'b'.repeat(32);
const requestRoot = 'C:\\Users\\owner\\AppData\\Local\\Operon\\runtime';
const now = 1_800_000_000_000;
const request: WindowsPersistentBootstrapRequestV1 = {
	bootstrapVersion: 1,
	expectedVaultSha256: vaultSha256,
	clientNonce,
};
const valid = {
	kind: 'operon-windows-persistent-bootstrap',
	bootstrapVersion: 1,
	ok: true,
	clientNonce,
	protocolVersion: 1,
	serverInstanceId: 'c'.repeat(64),
	vaultSha256,
	endpointKind: 'windows-named-pipe',
	endpoint: `\\\\.\\pipe\\operon-${'d'.repeat(64)}`,
	authSecret: 'e'.repeat(64),
	expiresAt: now + 86_400_000,
	pluginVersion: '3.3.1',
	apiVersion: 1,
} as const;

assert.deepEqual(
	decodeWindowsPersistentBootstrapV1(valid, request, requestRoot, now),
	{
		protocolVersion: 1,
		serverInstanceId: valid.serverInstanceId,
		vaultSha256,
		endpointKind: 'windows-named-pipe',
		endpoint: valid.endpoint,
		authSecret: valid.authSecret,
		expiresAt: valid.expiresAt,
		pluginVersion: '3.3.1',
		apiVersion: 1,
	},
);

for (const [name, candidate] of [
	['wrong nonce', { ...valid, clientNonce: 'f'.repeat(32) }],
	['wrong vault', { ...valid, vaultSha256: 'f'.repeat(64) }],
	['expired', { ...valid, expiresAt: now }],
	['unix endpoint', {
		...valid,
		endpointKind: 'unix-domain-socket',
		endpoint: '/tmp/read.sock',
	}],
	['unknown field', { ...valid, unexpected: true }],
] as const) {
	assert.throws(
		() => decodeWindowsPersistentBootstrapV1(candidate, request, requestRoot, now),
		error => error instanceof PersistentReadTransportErrorV1
			&& error.message === 'PERSISTENT_BOOTSTRAP_RESPONSE_INVALID',
		name,
	);
}

assert.throws(
	() => decodeWindowsPersistentBootstrapResponseV1({
		kind: 'operon-windows-persistent-bootstrap',
		bootstrapVersion: 1,
		ok: false,
		clientNonce,
		code: 'starting',
		retryable: true,
		apiVersion: 1,
	}, request, requestRoot, now),
	error => error instanceof PersistentReadTransportErrorV1
		&& error.message === 'PERSISTENT_BOOTSTRAP_STARTING',
);

assert.throws(
	() => decodeWindowsPersistentBootstrapV1(
		{ ...valid, expiresAt: now + 86_400_000 + 300_001 },
		request,
		requestRoot,
		now,
	),
	error => error instanceof PersistentReadTransportErrorV1
		&& error.message === 'PERSISTENT_BOOTSTRAP_RESPONSE_INVALID',
);

declare global {
	var __operonWindowsPersistentBootstrapTestRun: Promise<void> | undefined;
}

globalThis.__operonWindowsPersistentBootstrapTestRun = testBootstrapRunner();

async function testBootstrapRunner(): Promise<void> {
	let writtenPath = '';
	let writtenDescriptor: typeof valid | undefined;
	await bootstrapWindowsPersistentDescriptorV1(
		requestRoot,
		vaultSha256,
		async dynamicRequest => Buffer.from(JSON.stringify({
			...valid,
			clientNonce: dynamicRequest.clientNonce,
		})),
		now,
		{
			write: (descriptorPath, descriptor) => {
				writtenPath = descriptorPath;
				writtenDescriptor = descriptor as typeof valid;
			},
			read: () => writtenDescriptor as typeof valid,
		},
	);
	assert.equal(writtenPath, path.join(requestRoot, `persistent-read-${vaultSha256}.json`));
	assert.equal(writtenDescriptor?.authSecret, valid.authSecret);

	await assert.rejects(
		bootstrapWindowsPersistentDescriptorV1(
			requestRoot,
			vaultSha256,
			async () => Buffer.alloc(4097, 0x61),
			now,
		),
		/PERSISTENT_BOOTSTRAP_RESPONSE_INVALID/u,
	);
	await assert.rejects(
		bootstrapWindowsPersistentDescriptorV1(
			requestRoot,
			vaultSha256,
			async dynamicRequest => Buffer.from(JSON.stringify({
				...valid,
				clientNonce: dynamicRequest.clientNonce,
			})),
			now,
			{
				write: () => { throw new Error('ACL_FAILED'); },
				read: () => valid,
			},
		),
		/PERSISTENT_BOOTSTRAP_SECURITY_FAILED/u,
	);
	await assert.rejects(
		bootstrapWindowsPersistentDescriptorV1(
			requestRoot,
			vaultSha256,
			async dynamicRequest => Buffer.from(JSON.stringify({
				...valid,
				clientNonce: dynamicRequest.clientNonce,
			})),
			now,
			{
				write: () => undefined,
				read: () => ({ ...valid, serverInstanceId: 'f'.repeat(64) }),
			},
		),
		/PERSISTENT_BOOTSTRAP_DESCRIPTOR_CHANGED/u,
	);

	let connectCalls = 0;
	let bootstrapCalls = 0;
	assert.equal(await connectWindowsPersistentWithBootstrapV1(
		async () => {
			connectCalls += 1;
			if (connectCalls === 1) {
				throw new PersistentReadTransportErrorV1('PERSISTENT_DESCRIPTOR_MISSING', false);
			}
			return 'connected';
		},
		async () => { bootstrapCalls += 1; },
	), 'connected');
	assert.equal(connectCalls, 2);
	assert.equal(bootstrapCalls, 1);

	let cachedDescriptorAvailable = false;
	let cachedConnectCalls = 0;
	let cachedBootstrapCalls = 0;
	const connectWithCache = async (): Promise<string> => {
		cachedConnectCalls += 1;
		if (!cachedDescriptorAvailable) {
			throw new PersistentReadTransportErrorV1('PERSISTENT_DESCRIPTOR_MISSING', false);
		}
		return 'cached-connected';
	};
	const populateCache = async (): Promise<void> => {
		cachedBootstrapCalls += 1;
		cachedDescriptorAvailable = true;
	};
	assert.equal(
		await connectWindowsPersistentWithBootstrapV1(connectWithCache, populateCache),
		'cached-connected',
	);
	assert.equal(
		await connectWindowsPersistentWithBootstrapV1(connectWithCache, populateCache),
		'cached-connected',
	);
	assert.equal(cachedConnectCalls, 3);
	assert.equal(cachedBootstrapCalls, 1);

	let staleDescriptor = true;
	let refreshCalls = 0;
	assert.equal(await connectWindowsPersistentWithBootstrapV1(
		async () => {
			if (staleDescriptor) {
				throw new PersistentReadTransportErrorV1('PERSISTENT_DESCRIPTOR_INVALID', false);
			}
			return 'refreshed-connected';
		},
		async () => {
			refreshCalls += 1;
			staleDescriptor = false;
		},
	), 'refreshed-connected');
	assert.equal(refreshCalls, 1);

	let concurrentDescriptorAvailable = false;
	let releaseConcurrentBootstrap: (() => void) | undefined;
	const concurrentBootstrapGate = new Promise<void>(resolve => {
		releaseConcurrentBootstrap = resolve;
	});
	let concurrentBootstrapCalls = 0;
	let concurrentConnectCalls = 0;
	const concurrentConnections = Array.from({ length: 8 }, () =>
		connectWindowsPersistentWithBootstrapV1(
			async () => {
				concurrentConnectCalls += 1;
				if (!concurrentDescriptorAvailable) {
					throw new PersistentReadTransportErrorV1('PERSISTENT_DESCRIPTOR_MISSING', false);
				}
				return 'concurrent-connected';
			},
			async () => {
				concurrentBootstrapCalls += 1;
				await concurrentBootstrapGate;
				concurrentDescriptorAvailable = true;
			},
		));
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(concurrentBootstrapCalls, 8);
	releaseConcurrentBootstrap?.();
	assert.deepEqual(
		await Promise.all(concurrentConnections),
		Array.from({ length: 8 }, () => 'concurrent-connected'),
	);
	assert.equal(concurrentConnectCalls, 16);

	let postFrameBootstrapCalls = 0;
	await assert.rejects(
		connectWindowsPersistentWithBootstrapV1(
			async () => {
				throw new PersistentReadTransportErrorV1('PERSISTENT_CONNECT_FAILED', true);
			},
			async () => { postFrameBootstrapCalls += 1; },
		),
		/PERSISTENT_CONNECT_FAILED/u,
	);
	assert.equal(postFrameBootstrapCalls, 0);

	connectCalls = 0;
	bootstrapCalls = 0;
	await assert.rejects(
		connectWindowsPersistentWithBootstrapV1(
			async () => {
				connectCalls += 1;
				throw new PersistentReadTransportErrorV1('PERSISTENT_WRITE_FAILED', true);
			},
			async () => { bootstrapCalls += 1; },
		),
		/PERSISTENT_WRITE_FAILED/u,
	);
	assert.equal(connectCalls, 1);
	assert.equal(bootstrapCalls, 0);

	connectCalls = 0;
	bootstrapCalls = 0;
	await assert.rejects(
		connectWindowsPersistentWithBootstrapV1(
			async () => {
				connectCalls += 1;
				throw new PersistentReadTransportErrorV1('PERSISTENT_DESCRIPTOR_INSECURE', false);
			},
			async () => { bootstrapCalls += 1; },
		),
		/PERSISTENT_DESCRIPTOR_INSECURE/u,
	);
	assert.equal(connectCalls, 1);
	assert.equal(bootstrapCalls, 0);

	connectCalls = 0;
	bootstrapCalls = 0;
	await assert.rejects(
		connectWindowsPersistentWithBootstrapV1(
			async () => {
				connectCalls += 1;
				throw new PersistentReadTransportErrorV1('PERSISTENT_DESCRIPTOR_MISSING', false);
			},
			async () => { bootstrapCalls += 1; },
		),
		/PERSISTENT_DESCRIPTOR_MISSING/u,
	);
	assert.equal(connectCalls, 2);
	assert.equal(bootstrapCalls, 1);

	let seenArgs: string[] = [];
	const bootstrapPort = createWindowsPersistentBootstrapPortV1(
	{
		command: 'health',
		vaultPath: '/Vaults/Work',
		json: true,
		consistency: 'live-verified',
		readinessTimeoutMs: 30_000,
		obsidianBin: process.execPath,
	},
	'/Vaults/Work',
	{
		runProcess: async (_executable, args) => {
			seenArgs = [...args];
			return {
				exitCode: 0,
				signal: null,
				stdout: Buffer.from(JSON.stringify(valid)),
				stderr: Buffer.alloc(0),
				totalMs: 1,
				timedOut: false,
				overflow: false,
			};
		},
	},
	);
	const raw = await bootstrapPort(request);
	assert.equal(JSON.parse(raw.toString('utf8')).authSecret, valid.authSecret);
	assert.deepEqual(seenArgs, [
		'operon:transport-bootstrap',
		'vault=Work',
		'bootstrapVersion=1',
		`expectedVaultSha256=${vaultSha256}`,
		`clientNonce=${clientNonce}`,
	]);
	assert.equal(seenArgs.some(argument => argument.includes(valid.authSecret)), false);

	const aborted = new AbortController();
	aborted.abort();
	const abortedPort = createWindowsPersistentBootstrapPortV1(
		{
			command: 'health',
			vaultPath: '/Vaults/Work',
			json: true,
			consistency: 'live-verified',
			readinessTimeoutMs: 30_000,
			obsidianBin: process.execPath,
		},
		'/Vaults/Work',
		{
			signal: aborted.signal,
			runProcess: async () => { throw new Error('must-not-run'); },
		},
	);
	await assert.rejects(abortedPort(request), /CLI_ABORTED/u);
	console.log(JSON.stringify({
		kind: 'operon-cli-windows-bootstrap-acceptance-v1',
		status: 'passed',
		assertions: {
			strictEnvelopeAndNonce: 'passed',
			secureAtomicDescriptorContract: 'passed',
			cachedSecondUse: 'passed',
			restartAndStaleRefresh: 'passed',
			concurrentColdStart: 'passed',
			postFrameNoReplay: 'passed',
			mutationApplyNoReplay: 'passed',
			cancellationAndRedaction: 'passed',
		},
	}));
}
