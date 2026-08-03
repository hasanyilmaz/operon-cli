import {
	closeSync,
	lstatSync,
	mkdirSync,
	openSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

// Guided-command tests exercise orchestration, not the separately covered DACL
// backend. Keep their temporary plan store atomic without spawning PowerShell.
export type CliStorageSecurityBackendV1 = 'posix-mode' | 'windows-dacl';

export interface CliStorageSecurityStatusV1 {
	backend: CliStorageSecurityBackendV1;
	secure: boolean;
	failureReason?: string;
}

export function ensureSecureDirectoryV1(path: string): void {
	mkdirSync(path, { recursive: true, mode: 0o700 });
	assertPathKind(path, 'directory');
}

export function assertSecureFileV1(path: string): void {
	assertPathKind(path, 'file');
}

export function secureCreatedFileV1(path: string): void {
	assertSecureFileV1(path);
}

export function writeSecureJsonAtomicV1(path: string, value: unknown): void {
	ensureSecureDirectoryV1(dirname(path));
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
	let descriptor: number | null = null;
	try {
		descriptor = openSync(temporary, 'wx', 0o600);
		writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
		closeSync(descriptor);
		descriptor = null;
		renameSync(temporary, path);
		assertSecureFileV1(path);
	} finally {
		if (descriptor !== null) closeSync(descriptor);
		try {
			unlinkSync(temporary);
		} catch {
			// The atomic rename normally consumes the temporary file.
		}
	}
}

export function inspectCliStorageSecurityV1(): CliStorageSecurityStatusV1 {
	return { backend: 'posix-mode', secure: true };
}

export function repairCliStorageSecurityV1(): CliStorageSecurityStatusV1 {
	return { backend: 'posix-mode', secure: true };
}

function assertPathKind(path: string, kind: 'file' | 'directory'): void {
	const stat = lstatSync(path);
	if (
		stat.isSymbolicLink()
		|| (kind === 'file' ? !stat.isFile() : !stat.isDirectory())
	) throw new Error(kind === 'file' ? 'SECURE_FILE_INVALID' : 'SECURE_DIRECTORY_INVALID');
}
