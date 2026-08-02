import { execFileSync } from 'node:child_process';

if (process.version !== 'v24.18.0') {
	throw new Error(`OPERON_CLI_RELEASE_NODE_VERSION_MISMATCH:${process.version}`);
}
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmVersion = execFileSync(npmExecutable, ['--version'], {
	encoding: 'utf8',
	stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
if (npmVersion !== '11.12.1') {
	throw new Error(`OPERON_CLI_RELEASE_NPM_VERSION_MISMATCH:${npmVersion}`);
}
for (const variable of ['OPERON_CLI_FRAME_TIMING_BUILD', 'OPERON_CLI_PERSISTENT_READ_BUILD']) {
	if (process.env[variable] !== undefined) {
		throw new Error(`OPERON_CLI_RELEASE_BUILD_OVERRIDE_FORBIDDEN:${variable}`);
	}
}
