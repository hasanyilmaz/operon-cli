import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const WINDOWS_SYMLINK_CAPABILITY_ERRORS = new Set(['EACCES', 'ENOSYS', 'EPERM']);

type SymlinkKind = 'dir' | 'file';

const unavailableReasonByKind = new Map<SymlinkKind, string | undefined>();

export function symlinkCapabilityUnavailableReasonV1(kind: SymlinkKind): string | undefined {
	if (!unavailableReasonByKind.has(kind)) {
		unavailableReasonByKind.set(kind, probeWindowsSymlinkCapability(kind));
	}
	return unavailableReasonByKind.get(kind);
}

function probeWindowsSymlinkCapability(kind: SymlinkKind): string | undefined {
	if (process.platform !== 'win32') return undefined;
	const root = mkdtempSync(path.join(tmpdir(), `operon-symlink-${kind}-`));
	const target = path.join(root, 'target');
	const link = path.join(root, 'link');
	try {
		if (kind === 'dir') mkdirSync(target);
		else writeFileSync(target, 'fixture');
		try {
			symlinkSync(target, link, kind);
			return undefined;
		} catch (error) {
			if (isWindowsSymlinkCapabilityError(error)) {
				return `Windows ${kind} symlink capability is unavailable (${error.code}).`;
			}
			throw error;
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

function isWindowsSymlinkCapabilityError(error: unknown): boolean {
	return error instanceof Error
		&& 'code' in error
		&& typeof error.code === 'string'
		&& WINDOWS_SYMLINK_CAPABILITY_ERRORS.has(error.code);
}
