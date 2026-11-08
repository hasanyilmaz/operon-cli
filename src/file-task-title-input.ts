import {
	utf8ByteLengthV1,
	type CreateTaskItemV1,
} from '../vendor/operon-plugin-v1/src/agent-runtime/contracts/v1';
import type { FileTaskTitleCreateSpecV1 } from '../vendor/operon-plugin-v1/src/agent-runtime/extensions/file-task-titles-v1/contracts';

export const FILE_TASK_TITLE_BYTE_CAP_V1 = 8192;

export function isFileTaskTitleTextV1(value: unknown): value is string {
	return typeof value === 'string'
		&& value.trim().length > 0
		&& utf8ByteLengthV1(value) <= FILE_TASK_TITLE_BYTE_CAP_V1;
}

export function fileTaskTitleCreateSpecV1(item: CreateTaskItemV1): FileTaskTitleCreateSpecV1 {
	const { description, target, ...fields } = item;
	if (target.representation !== 'file') throw new Error('DIRECT_FILE_TASK_REQUIRED');
	if (!isFileTaskTitleTextV1(description)) throw new Error('FILE_TASK_TITLE_INVALID');
	return { operation: 'create-file', item: { ...fields, target, displayTitle: description } };
}
