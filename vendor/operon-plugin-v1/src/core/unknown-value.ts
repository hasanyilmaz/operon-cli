export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isUnknownFunction(value: unknown): value is (...args: unknown[]) => unknown {
	return typeof value === 'function';
}

export function readString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}
