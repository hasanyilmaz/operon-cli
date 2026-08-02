import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmExecPath = process.env.npm_execpath;
assert.ok(typeof npmExecPath === 'string' && path.isAbsolute(npmExecPath), 'OPERON_CLI_NPM_EXECPATH_REQUIRED');
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'operon-cli-package-test-'));
const packRoot = path.join(temporaryRoot, 'pack');
const installRoot = path.join(temporaryRoot, 'install');
try {
	await mkdir(packRoot, { recursive: true });
	await mkdir(installRoot, { recursive: true });
	const pack = runJson([
		'pack',
		'--json',
		'--ignore-scripts',
		'--pack-destination',
		packRoot,
	], projectRoot)[0];
	assert.equal(pack.name, '@stratejya/operon-cli');
	assert.equal(pack.version, '1.0.8');
	assert.equal(pack.files.length, 41);
	const paths = pack.files.map(file => file.path).sort();
	for (const forbidden of ['vendor/', 'src/', 'scripts/', 'test/', 'node_modules/']) {
		assert.equal(paths.some(file => file.startsWith(forbidden)), false, `Forbidden package path: ${forbidden}`);
	}
	assert.equal(paths.includes('package-lock.json'), false, 'package-lock.json must not be packed.');
	assert.equal(paths.some(file => file.includes('snapshot-manifest')), false, 'Snapshot manifest must not be packed.');
	for (const file of pack.files) {
		const expectedMode = file.path === 'dist/operon.mjs' ? 0o755 : 0o644;
		assert.equal(file.mode, expectedMode, `Unexpected package mode: ${file.path}`);
	}
	const tarball = path.join(packRoot, pack.filename);
	const packageDocument = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
	assert.equal(packageDocument.private, true);
	const configRoot = path.join(temporaryRoot, 'config');
	await mkdir(configRoot, { recursive: true });
	const sentinel = path.join(configRoot, 'sentinel.json');
	await writeFile(sentinel, '{"preserved":true}\n');
	const legacyTarball = process.env.OPERON_CLI_LEGACY_TARBALL;
	if (legacyTarball) {
		install(legacyTarball);
		assertVersion('1.0.7');
	}
	install(tarball);
	assertVersion('1.0.8');
	if (legacyTarball) {
		install(legacyTarball);
		assertVersion('1.0.7');
		install(tarball);
		assertVersion('1.0.8');
	}
	run(['uninstall', '--prefix', installRoot, '--ignore-scripts', '--no-audit', '--no-fund', '@stratejya/operon-cli'], installRoot);
	assert.equal(await readFile(sentinel, 'utf8'), '{"preserved":true}\n');
	console.log(JSON.stringify({ status: 'passed', entries: pack.files.length, tarballBytes: pack.size }));

	function install(specifier) {
		run(['install', '--prefix', installRoot, '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', specifier], installRoot);
	}
	function assertVersion(expected) {
		const binary = path.join(installRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'operon.cmd' : 'operon');
		const result = spawnSync(binary, ['version'], {
			encoding: 'utf8',
			env: { ...process.env, OPERON_CONFIG_HOME: configRoot, OPERON_CLI_UPDATE_CHECK: '0' },
		});
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout.trim(), `operon-cli ${expected}`);
	}
} finally {
	await rm(temporaryRoot, { recursive: true, force: true });
}

function runJson(args, cwd) {
	return JSON.parse(run(args, cwd));
}
function run(args, cwd) {
	const result = spawnSync(process.execPath, [npmExecPath, ...args], {
		cwd,
		encoding: 'utf8',
		env: {
			...process.env,
			npm_config_cache: path.join(temporaryRoot, 'npm-cache'),
			npm_config_fund: 'false',
			npm_config_audit: 'false',
			npm_config_update_notifier: 'false',
		},
	});
	if (result.status !== 0) throw new Error(`OPERON_CLI_PACKAGE_COMMAND_FAILED\n${result.stdout}\n${result.stderr}`);
	return result.stdout;
}
