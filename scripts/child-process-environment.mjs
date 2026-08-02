export function createChildEnvironmentWithPathV1(
	environment,
	pathValue,
	platform = process.platform,
) {
	if (typeof pathValue !== 'string' || pathValue.includes('\0')) {
		throw new Error('OPERON_CLI_CHILD_PATH_INVALID');
	}
	const result = {};
	for (const [key, value] of Object.entries(environment)) {
		if (platform === 'win32' && key.toLocaleLowerCase('en-US') === 'path') continue;
		if (platform !== 'win32' && key === 'PATH') continue;
		result[key] = value;
	}
	result.PATH = pathValue;
	return result;
}
