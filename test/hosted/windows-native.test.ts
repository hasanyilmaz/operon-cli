import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { copyFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createWindowsBrokerClientV1, PersistentReadTransportV1 } from '../../src/persistent-read-client';
import { resolveObsidianExecutableV1, terminateProcessTreeV1 } from '../../src/process-platform';
import { createCanonicalVaultFenceV1 } from '../../src/protocol';
import {
	ensureSecureDirectoryV1,
	inspectCliStorageSecurityV1,
	repairCliStorageSecurityV1,
	writeSecureJsonAtomicV1,
} from '../../src/secure-storage';

declare global {
	var __operonWindowsHostedTestRun: Promise<void> | undefined;
}

globalThis.__operonWindowsHostedTestRun = run();

async function run(): Promise<void> {
	if (process.platform !== 'win32') throw new Error('OPERON_CLI_WINDOWS_HOST_REQUIRED');
	const root = await mkdtemp(path.join(tmpdir(), 'operon-windows-native-'));
	try {
		await testExecutableResolution(root);
		await testStorageDaclAndReparsePoints(root);
		await testProcessTreeTermination();
		await testNamedPipeRoundTrip(root);
		console.log(JSON.stringify({ status: 'passed', platform: 'win32', skipped: 0, assertions: 4 }));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

async function testExecutableResolution(root: string): Promise<void> {
	const bin = path.join(root, 'Ünicode Apps');
	await mkdir(bin);
	const com = path.join(bin, 'obsidian.com');
	const exe = path.join(bin, 'obsidian.exe');
	await copyFile(process.execPath, com);
	await copyFile(process.execPath, exe);
	assert.equal(resolveObsidianExecutableV1('obsidian', { env: { Path: `"${bin}"` } }), com);
	await rm(com);
	assert.equal(resolveObsidianExecutableV1('obsidian', { env: { PATH: bin } }), exe);
	assert.equal(resolveObsidianExecutableV1(`\\\\?\\${exe}`), `\\\\?\\${exe}`);
}

async function testStorageDaclAndReparsePoints(root: string): Promise<void> {
	const config = path.join(root, 'config');
	ensureSecureDirectoryV1(config, 'win32');
	writeSecureJsonAtomicV1(path.join(config, 'config-v1.json'), { ok: true }, 'win32');
	assert.deepEqual(inspectCliStorageSecurityV1(config, 'win32'), { backend: 'windows-dacl', secure: true });
	writeSecureJsonAtomicV1(path.join(config, 'config-v1.json'), { ok: 'replaced' }, 'win32');
	assert.deepEqual(JSON.parse(await readFile(path.join(config, 'config-v1.json'), 'utf8')), { ok: 'replaced' });
	assert.deepEqual(inspectCliStorageSecurityV1(config, 'win32'), { backend: 'windows-dacl', secure: true });
	const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
	assert.ok(systemRoot && path.win32.isAbsolute(systemRoot));
	const icacls = path.win32.join(systemRoot, 'System32', 'icacls.exe');
	const weakened = spawnSync(icacls, [config, '/inheritance:e'], { encoding: 'utf8', windowsHide: true, shell: false });
	assert.equal(weakened.status, 0, weakened.stderr);
	assert.equal(inspectCliStorageSecurityV1(config, 'win32').secure, false);
	assert.equal(repairCliStorageSecurityV1(config, 'win32').secure, true);

	const foreignDirectory = path.join(root, 'junction-target');
	await mkdir(foreignDirectory);
	const plans = path.join(config, 'plans');
	await symlink(foreignDirectory, plans, 'junction');
	assert.equal(inspectCliStorageSecurityV1(config, 'win32').failureReason, 'SECURITY_REPARSE_POINT');
	await rm(plans, { recursive: true, force: true });

	const foreignFile = path.join(root, 'foreign.json');
	await writeFile(foreignFile, '{}\n');
	const client = path.join(config, 'client-v1.json');
	await symlink(foreignFile, client, 'file');
	assert.equal(inspectCliStorageSecurityV1(config, 'win32').failureReason, 'SECURITY_REPARSE_POINT');
	await rm(client, { force: true });
	assert.equal(repairCliStorageSecurityV1(config, 'win32').secure, true);
}

async function testProcessTreeTermination(): Promise<void> {
	const childProgram = [
		"const {spawn}=require('node:child_process')",
		"const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'})",
		"console.log(JSON.stringify({child:process.pid,grandchild:child.pid}))",
		'setInterval(()=>{},1000)',
	].join(';');
	const child = spawn(process.execPath, ['-e', childProgram], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
	const pids = await new Promise<{ child: number; grandchild: number }>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('OPERON_CLI_WINDOWS_TREE_START_TIMEOUT')), 10_000);
		child.stdout.setEncoding('utf8');
		let document = '';
		child.stdout.on('data', chunk => {
			document += String(chunk);
			const newline = document.indexOf('\n');
			if (newline === -1) return;
			clearTimeout(timer);
			resolve(JSON.parse(document.slice(0, newline)) as { child: number; grandchild: number });
		});
		child.once('error', reject);
	});
	try {
		terminateProcessTreeV1(pids.child, 'win32');
		await waitForExit(pids.child);
		await waitForExit(pids.grandchild);
	} finally {
		for (const pid of [pids.child, pids.grandchild]) {
			try { process.kill(pid, 'SIGKILL'); } catch { /* already terminated */ }
		}
	}
}

async function testNamedPipeRoundTrip(root: string): Promise<void> {
	const authSecret = randomBytes(32).toString('hex');
	const serverInstanceId = randomBytes(32).toString('hex');
	const endpoint = `\\\\.\\pipe\\operon-${serverInstanceId}`;
	const localAppData = path.join(root, 'Local App Data');
	const requestRoot = path.join(localAppData, 'Operon', 'runtime');
	const vault = path.join(root, 'pipe-vault');
	await mkdir(vault);
	const vaultFence = createCanonicalVaultFenceV1(vault);
	ensureSecureDirectoryV1(requestRoot, 'win32');
	writeSecureJsonAtomicV1(path.join(requestRoot, `persistent-read-${vaultFence.sha256}.json`), {
		protocolVersion: 1,
		serverInstanceId,
		vaultSha256: vaultFence.sha256,
		endpointKind: 'windows-named-pipe',
		endpoint,
		authSecret,
		expiresAt: Date.now() + 60_000,
		pluginVersion: 'test',
		apiVersion: 1,
	}, 'win32');
	const seenAuthNonces = new Set<string>();
	let responseNonce = 0;
	let connections = 0;
	let resolveReadOneClose: () => void = () => undefined;
	const readOneClosed = new Promise<void>(resolve => {
		resolveReadOneClose = resolve;
	});
	const server = createServer(socket => {
		connections += 1;
		let pending = Buffer.alloc(0);
		let closesAfterReadOne = false;
		socket.on('close', () => {
			if (closesAfterReadOne) resolveReadOneClose();
		});
		socket.on('data', chunk => {
			pending = Buffer.concat([pending, Buffer.from(chunk)]);
			while (pending.length >= 4) {
				const length = pending.readUInt32BE(0);
				if (pending.length < length + 4) return;
				const message = JSON.parse(pending.subarray(4, length + 4).toString('utf8')) as Record<string, unknown>;
				pending = pending.subarray(length + 4);
				assert.equal(authenticateFrame(message, authSecret).authMac, message.authMac, 'production client HMAC');
				assert.equal(typeof message.authNonce, 'string');
				assert.equal(seenAuthNonces.has(message.authNonce as string), false, 'auth nonce replay');
				seenAuthNonces.add(message.authNonce as string);
				let response: Record<string, unknown>;
				if (message.type === 'hello') response = {
					type: 'hello-ack', protocolVersion: 1, serverInstanceId,
					vaultSha256: vaultFence.sha256, connectionNonce: message.connectionNonce,
				};
				else if (message.type === 'request') response = {
					type: 'response', sequence: message.sequence, requestId: message.requestId,
					result: JSON.stringify({ ok: true, requestId: message.requestId }),
				};
				else if (message.type === 'stage') response = {
					type: 'broker-response', sequence: message.sequence, requestId: message.requestId,
					requestToken: 'T'.repeat(32), stagingReceipt: 'a'.repeat(64), state: 'staged',
				};
				else if (message.type === 'status') response = {
					type: 'broker-response', sequence: message.sequence, requestId: message.requestId, state: 'staged',
				};
				else if (message.type === 'cancel') response = {
					type: 'broker-response', sequence: message.sequence, requestId: message.requestId,
					cancelled: true, state: 'unknown',
				};
				else throw new Error(`OPERON_CLI_WINDOWS_PIPE_MESSAGE_UNEXPECTED:${String(message.type)}`);
				responseNonce += 1;
				const authenticated = authenticateFrame({
					...response,
					connectionNonce: message.connectionNonce,
					authNonce: responseNonce.toString(16).padStart(64, '0'),
				}, authSecret);
				const body = Buffer.from(JSON.stringify(authenticated));
				const frame = Buffer.alloc(4 + body.length);
				frame.writeUInt32BE(body.length, 0);
				body.copy(frame, 4);
				if (message.requestId === 'read-one') {
					closesAfterReadOne = true;
					socket.end(frame);
				} else socket.write(frame);
			}
		});
	});
	await new Promise<void>((resolve, reject) => server.listen(endpoint, resolve).once('error', reject));
	const previousLocalAppData = process.env.LOCALAPPDATA;
	process.env.LOCALAPPDATA = localAppData;
	const transport = new PersistentReadTransportV1(requestRoot);
	try {
		for (const requestId of ['read-one', 'read-two']) {
			const result = await transport.invoke({ requestId, command: 'health', requestToken: 'R'.repeat(32), vaultFence });
			assert.deepEqual(JSON.parse(result.result.toString('utf8')), { ok: true, requestId });
			if (requestId === 'read-one') {
				await withTimeout(readOneClosed, 'OPERON_CLI_WINDOWS_PIPE_CLOSE_TIMEOUT');
				await new Promise<void>(resolve => setImmediate(resolve));
			}
		}
		const broker = await createWindowsBrokerClientV1({ vaultSha256: vaultFence.sha256 });
		try {
			assert.deepEqual(await broker.stage({} as never), { requestToken: 'T'.repeat(32), stagingReceipt: 'a'.repeat(64) });
			assert.deepEqual(await broker.status('T'.repeat(32)), { state: 'staged' });
			assert.deepEqual(await broker.cancel('T'.repeat(32)), { cancelled: true, state: 'unknown' });
		} finally {
			broker.close();
		}
		assert.ok(connections >= 3, 'production transport reconnects and broker opens a connection');
	} finally {
		transport.close();
		if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
		else process.env.LOCALAPPDATA = previousLocalAppData;
		await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	}
}

async function withTimeout(promise: Promise<void>, code: string): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(() => reject(new Error(code)), 10_000);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

function authenticateFrame(value: Record<string, unknown>, secret: string): Record<string, unknown> {
	return {
		...value,
		authMac: createHmac('sha256', secret).update(stableJson(value)).digest('hex'),
	};
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	if (value !== null && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record).filter(key => key !== 'authMac').sort()
			.map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

async function waitForExit(pid: number): Promise<void> {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		try {
			process.kill(pid, 0);
		} catch {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	throw new Error(`OPERON_CLI_WINDOWS_PROCESS_SURVIVED:${pid}`);
}
