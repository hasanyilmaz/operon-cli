import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'operon-cli-parity-'));
const outfile = path.join(temporaryRoot, 'shared-parity.mjs');
try {
	await build({
		entryPoints: [path.join(projectRoot, 'vendor', 'operon-plugin-v1', 'parity', 'shared-parity.test.ts')],
		outfile,
		bundle: true,
		platform: 'node',
		format: 'esm',
		target: 'node22',
		logLevel: 'silent',
	});
	for (const timezone of ['UTC', 'Europe/Berlin', 'America/New_York']) {
		const result = spawnSync(process.execPath, [outfile], {
			cwd: projectRoot,
			encoding: 'utf8',
			env: { ...process.env, TZ: timezone },
		});
		if (result.status !== 0) {
			throw new Error(`OPERON_CLI_PARITY_FAILED:${timezone}\n${result.stdout}\n${result.stderr}`);
		}
		process.stdout.write(result.stdout);
	}
} finally {
	await rm(temporaryRoot, { recursive: true, force: true });
}
