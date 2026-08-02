import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstat, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChildEnvironmentWithPathV1 } from './child-process-environment.mjs';
import {
	assertWindowsCommandPathSafeV1,
	resolveTrustedWindowsCommandProcessorV1,
} from './windows-command.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmExecPath = process.env.npm_execpath;
assert.ok(typeof npmExecPath === 'string' && path.isAbsolute(npmExecPath), 'OPERON_CLI_NPM_EXECPATH_REQUIRED');
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'operon-cli-package-test-'));
const packRoot = path.join(temporaryRoot, 'pack');
const installRoot = path.join(temporaryRoot, 'operon global prefix Ünicode');
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
	const sentinel = path.join(installRoot, 'unowned-sentinel.json');
	await writeFile(sentinel, '{"preserved":true}\n');
	const legacyTarball = process.env.OPERON_CLI_LEGACY_TARBALL;
	if (legacyTarball) {
		install(legacyTarball);
		await assertVersion('1.0.7');
	}
	install(tarball);
	await assertVersion('1.0.8');
	if (legacyTarball) {
		install(legacyTarball);
		await assertVersion('1.0.7');
		install(tarball);
		await assertVersion('1.0.8');
	}
	run(['uninstall', '--global', '--prefix', installRoot, '--ignore-scripts', '--no-audit', '--no-fund', '@stratejya/operon-cli'], installRoot);
	await assertUninstalled();
	assert.equal(await readFile(sentinel, 'utf8'), '{"preserved":true}\n');
	console.log(JSON.stringify({ status: 'passed', entries: pack.files.length, tarballBytes: pack.size }));

	function install(specifier) {
		run(['install', '--global', '--prefix', installRoot, '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', specifier], installRoot);
	}
	async function assertVersion(expected) {
		const packageRoot = globalPackageRoot();
		const packageStat = await lstat(packageRoot);
		assert.equal(packageStat.isDirectory(), true, 'Global package root must be a directory.');
		assert.equal(packageStat.isSymbolicLink(), false, 'Global package root must not be a symlink.');
		const installedEntry = path.join(packageRoot, 'dist', 'operon.mjs');
		const directResult = spawnSync(process.execPath, [installedEntry, 'version'], {
			encoding: 'utf8',
			env: packageEnvironment(),
		});
		assertCommandVersion(directResult, expected, 'installed payload');
		if (process.platform === 'win32') {
			await assertWindowsShims(expected);
			return;
		}
		const result = spawnSync(path.join(globalBinRoot(), 'operon'), ['version'], {
			encoding: 'utf8',
			env: packageEnvironment(),
		});
		assertCommandVersion(result, expected, 'global executable');
	}
	async function assertWindowsShims(expected) {
		const binRoot = globalBinRoot();
		const shellShim = path.join(binRoot, 'operon');
		const cmdShim = `${shellShim}.cmd`;
		const powershellShim = `${shellShim}.ps1`;
		for (const shim of [shellShim, cmdShim, powershellShim]) {
			const stat = await lstat(shim);
			assert.equal(stat.isFile(), true, `Windows shim must be a regular file: ${shim}`);
			assert.equal(stat.isSymbolicLink(), false, `Windows shim must not be a symlink: ${shim}`);
		}
		const [shellDocument, cmdDocument, powershellDocument] = await Promise.all([
			readFile(shellShim, 'utf8'),
			readFile(cmdShim, 'utf8'),
			readFile(powershellShim, 'utf8'),
		]);
		assert.match(shellDocument, /dist\/operon\.mjs/u);
		assert.match(shellDocument, /"\$@"/u);
		assert.match(cmdDocument, /dist\\operon\.mjs/iu);
		assert.match(cmdDocument, /%\*/u);
		assert.match(powershellDocument, /dist\/operon\.mjs/iu);
		assert.match(powershellDocument, /\$args/u);
		for (const document of [shellDocument, cmdDocument, powershellDocument]) {
			assert.equal(document.includes(projectRoot), false, 'Windows shim must not embed the project root.');
			assert.equal(document.includes(temporaryRoot), false, 'Windows shim must not embed its temporary prefix.');
		}
		const cmdExecutable = resolveTrustedWindowsCommandProcessorV1();
		assertWindowsCommandPathSafeV1(cmdShim);
		const directResult = spawnSync(cmdExecutable, ['/d', '/s', '/c', `"${cmdShim}" version`], {
			encoding: 'utf8',
			env: packageEnvironment(),
			windowsHide: true,
			shell: false,
		});
		assertCommandVersion(directResult, expected, 'operon.cmd');
		const pathResult = spawnSync(cmdExecutable, ['/d', '/s', '/c', 'operon version'], {
			encoding: 'utf8',
			env: packageEnvironment(),
			windowsHide: true,
			shell: false,
		});
		assertCommandVersion(pathResult, expected, 'PATH-resolved operon');
	}
	async function assertUninstalled() {
		await assertPathMissing(globalPackageRoot());
		if (process.platform === 'win32') {
			const shellShim = path.join(globalBinRoot(), 'operon');
			for (const shim of [shellShim, `${shellShim}.cmd`, `${shellShim}.ps1`]) {
				await assertPathMissing(shim);
			}
		} else {
			await assertPathMissing(path.join(globalBinRoot(), 'operon'));
		}
	}
	function globalPackageRoot() {
		return process.platform === 'win32'
			? path.join(installRoot, 'node_modules', '@stratejya', 'operon-cli')
			: path.join(installRoot, 'lib', 'node_modules', '@stratejya', 'operon-cli');
	}
	function globalBinRoot() {
		return process.platform === 'win32' ? installRoot : path.join(installRoot, 'bin');
	}
	function packageEnvironment() {
		const inheritedPath = Object.entries(process.env)
			.find(([key]) => key.toLocaleLowerCase('en-US') === 'path')?.[1] ?? '';
		return createChildEnvironmentWithPathV1({
			...process.env,
			OPERON_CONFIG_HOME: configRoot,
			OPERON_CLI_UPDATE_CHECK: '0',
		}, `${globalBinRoot()}${path.delimiter}${inheritedPath}`);
	}
} finally {
	await rm(temporaryRoot, { recursive: true, force: true });
}

function runJson(args, cwd) {
	return JSON.parse(run(args, cwd));
}
function run(args, cwd) {
	const inheritedPath = Object.entries(process.env)
		.find(([key]) => key.toLocaleLowerCase('en-US') === 'path')?.[1] ?? '';
	const result = spawnSync(process.execPath, [npmExecPath, ...args], {
		cwd,
		encoding: 'utf8',
		env: createChildEnvironmentWithPathV1({
			...process.env,
			npm_config_cache: path.join(temporaryRoot, 'npm-cache'),
			npm_config_fund: 'false',
			npm_config_audit: 'false',
			npm_config_update_notifier: 'false',
		}, inheritedPath),
	});
	if (result.status !== 0) throw new Error(`OPERON_CLI_PACKAGE_COMMAND_FAILED\n${result.stdout}\n${result.stderr}`);
	return result.stdout;
}

function assertCommandVersion(result, expected, surface) {
	assert.equal(result.status, 0, `${surface}: ${result.error?.message ?? result.stderr}`);
	assert.equal(result.stdout.trim(), `operon-cli ${expected}`, surface);
}

async function assertPathMissing(target) {
	try {
		await lstat(target);
		assert.fail(`Path must be removed: ${target}`);
	} catch (error) {
		if (error instanceof assert.AssertionError) throw error;
		assert.equal(error?.code, 'ENOENT', `Unexpected path check failure: ${target}`);
	}
}
