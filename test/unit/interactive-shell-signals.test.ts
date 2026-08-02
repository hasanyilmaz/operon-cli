import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import {
	createProcessInteractiveShellSessionV1,
	type InteractiveShellSessionV1,
	type InteractiveShellSignalSourceV1,
} from '../../src/interactive-shell';

class FakeSignalSourceV1 implements InteractiveShellSignalSourceV1 {
	private readonly listeners = new Map<NodeJS.Signals, Set<() => void>>();

	once(signal: NodeJS.Signals, listener: () => void): void {
		const listeners = this.listeners.get(signal) ?? new Set<() => void>();
		listeners.add(listener);
		this.listeners.set(signal, listeners);
	}

	removeListener(signal: NodeJS.Signals, listener: () => void): void {
		this.listeners.get(signal)?.delete(listener);
	}

	emit(signal: NodeJS.Signals): void {
		const listeners = [...(this.listeners.get(signal) ?? [])];
		this.listeners.delete(signal);
		for (const listener of listeners) listener();
	}

	listenerCount(signal: NodeJS.Signals): number {
		return this.listeners.get(signal)?.size ?? 0;
	}
}

class TestTtyInputV1 extends PassThrough {
	readonly isTTY = true;
	isRaw = false;

	setRawMode(mode: boolean): this {
		this.isRaw = mode;
		return this;
	}
}

class TestTtyOutputV1 extends PassThrough {
	readonly isTTY = true;
	readonly columns = 120;
	readonly rows = 40;
}

function createHarnessV1(platform: NodeJS.Platform): {
	input: TestTtyInputV1;
	session: InteractiveShellSessionV1;
	signals: FakeSignalSourceV1;
} {
	const input = new TestTtyInputV1();
	const stdout = new TestTtyOutputV1();
	const stderr = new PassThrough();
	const signals = new FakeSignalSourceV1();
	const session = createProcessInteractiveShellSessionV1({
		cwd: process.cwd(),
		input,
		stdout,
		stderr,
		platform,
		signalSource: signals,
	});
	assert(session);
	return { input, session, signals };
}

test('SIGTERM strongly closes the shell, aborts the active command, and cleans listeners', async () => {
	const { session, signals } = createHarnessV1('linux');
	assert.equal(signals.listenerCount('SIGTERM'), 1);
	assert.equal(signals.listenerCount('SIGBREAK'), 0);
	const controller = new AbortController();
	session.setActiveCommand(controller);
	const pendingRead = session.readCommand('operon> ');

	signals.emit('SIGTERM');

	assert.deepEqual(await pendingRead, { kind: 'eof' });
	assert.equal(session.closed, true);
	assert.equal(controller.signal.aborted, true);
	assert.equal(signals.listenerCount('SIGTERM'), 0);
	session.close();
	assert.equal(signals.listenerCount('SIGTERM'), 0);
});

test('win32 SIGBREAK uses the same strong-close lifecycle as SIGTERM', async () => {
	const { session, signals } = createHarnessV1('win32');
	assert.equal(signals.listenerCount('SIGTERM'), 1);
	assert.equal(signals.listenerCount('SIGBREAK'), 1);
	const controller = new AbortController();
	session.setActiveCommand(controller);
	const pendingRead = session.readCommand('operon> ');

	signals.emit('SIGBREAK');

	assert.deepEqual(await pendingRead, { kind: 'eof' });
	assert.equal(session.closed, true);
	assert.equal(controller.signal.aborted, true);
	assert.equal(signals.listenerCount('SIGTERM'), 0);
	assert.equal(signals.listenerCount('SIGBREAK'), 0);
});
test('SIGINT interrupts input or aborts a command without closing the shell', async () => {
	const { input, session, signals } = createHarnessV1('win32');
	assert.equal(signals.listenerCount('SIGINT'), 0);
	const pendingRead = session.readCommand('operon> ');

	input.write('\u0003');

	assert.deepEqual(await pendingRead, { kind: 'interrupt' });
	assert.equal(session.closed, false);
	const controller = new AbortController();
	session.setActiveCommand(controller);
	input.write('\u0003');
	await new Promise<void>(resolve => setImmediate(resolve));
	assert.equal(controller.signal.aborted, true);
	assert.equal(session.closed, false);

	const eof = session.readCommand('operon> ');
	input.end();
	assert.deepEqual(await eof, { kind: 'eof' });
	assert.equal(session.closed, true);
	assert.equal(signals.listenerCount('SIGTERM'), 0);
	assert.equal(signals.listenerCount('SIGBREAK'), 0);
});
