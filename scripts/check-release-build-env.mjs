import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import path from 'node:path';

if (process.version !== 'v24.18.0') {
	throw new Error(`OPERON_CLI_RELEASE_NODE_VERSION_MISMATCH:${process.version}`);
}
const npmExecPath = process.env.npm_execpath;
if (
	typeof npmExecPath !== 'string'
	|| npmExecPath.includes('\0')
	|| !path.isAbsolute(npmExecPath)
) throw new Error('OPERON_CLI_RELEASE_NPM_EXECPATH_INVALID');
try {
	const stat = lstatSync(npmExecPath);
	if (!stat.isFile() || stat.isSymbolicLink()) {
		throw new Error('OPERON_CLI_RELEASE_NPM_EXECPATH_INVALID');
	}
} catch (error) {
	if (error instanceof Error && error.message === 'OPERON_CLI_RELEASE_NPM_EXECPATH_INVALID') {
		throw error;
	}
	throw new Error('OPERON_CLI_RELEASE_NPM_EXECPATH_INVALID', { cause: error });
}
let npmVersion;
try {
	npmVersion = execFileSync(process.execPath, [npmExecPath, '--version'], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
} catch {
	throw new Error('OPERON_CLI_RELEASE_NPM_EXEC_FAILED');
}
if (npmVersion !== '11.12.1') {
	throw new Error(`OPERON_CLI_RELEASE_NPM_VERSION_MISMATCH:${npmVersion}`);
}
for (const variable of ['OPERON_CLI_FRAME_TIMING_BUILD', 'OPERON_CLI_PERSISTENT_READ_BUILD']) {
	if (process.env[variable] !== undefined) {
		throw new Error(`OPERON_CLI_RELEASE_BUILD_OVERRIDE_FORBIDDEN:${variable}`);
	}
}
