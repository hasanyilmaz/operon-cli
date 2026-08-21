import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstat, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChildEnvironmentWithPathV1 } from './child-process-environment.mjs';
import {
	EXPECTED_PACKAGE_PATHS_V1,
	assertOperonPackageInventoryV1,
	inspectPackageTarballV1,
	normalizeOperonPackageTarballV1,
} from './package-archive.mjs';
import {
	resolveTrustedWindowsCommandProcessorV1,
	windowsShimVersionInvocationV1,
} from './windows-command.mjs';
import { OPERON_CLI_MAIN_CANDIDATE_V1 } from './main-candidate-identity.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmExecPath = process.env.npm_execpath;
assert.ok(typeof npmExecPath === 'string' && path.isAbsolute(npmExecPath), 'OPERON_CLI_NPM_EXECPATH_REQUIRED');
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'operon-cli-package-test-'));
const packRoot = path.join(temporaryRoot, 'pack');
const installRoot = path.join(temporaryRoot, 'operon global prefix Ünicode');
try {
	await mkdir(packRoot, { recursive: true });
	await mkdir(installRoot, { recursive: true });
	const externalCandidate = process.env.OPERON_CLI_CANDIDATE_TARBALL;
	const { pack, tarball } = externalCandidate
		? await inspectExternalCandidate(externalCandidate)
		: await createLocalCandidate();
	assert.equal(pack.name, '@stratejya/operon-cli');
	assert.equal(pack.version, '1.2.0');
	assert.equal(pack.files.length, EXPECTED_PACKAGE_PATHS_V1.length);
	assertOperonPackageInventoryV1(pack.files.map(file => ({ ...file, path: `package/${file.path}` })));
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
	const packageDocument = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
	assert.equal('private' in packageDocument, false);
	assert.deepEqual(packageDocument.publishConfig, {
		access: 'public',
		registry: 'https://registry.npmjs.org/',
		provenance: true,
	});
	const configRoot = path.join(temporaryRoot, 'config');
	await mkdir(configRoot, { recursive: true });
	const sentinel = path.join(installRoot, 'unowned-sentinel.json');
	const configSentinel = path.join(configRoot, 'user-config-sentinel.json');
	await writeFile(sentinel, '{"preserved":true}\n');
	await writeFile(configSentinel, '{"preserved":true}\n');
	const legacyTarball = process.env.OPERON_CLI_LEGACY_TARBALL;
	if (externalCandidate) assert.ok(legacyTarball, 'OPERON_CLI_LEGACY_TARBALL_REQUIRED');
	if (legacyTarball) {
		await assertRegularArtifact(legacyTarball, 'OPERON_CLI_LEGACY_TARBALL_INVALID');
		if (externalCandidate) {
			const legacyArchive = await inspectPackageTarballV1(legacyTarball);
			assert.equal(legacyArchive.bytes, 213_485, 'OPERON_CLI_LEGACY_BYTES_MISMATCH');
			assert.equal(legacyArchive.sha256, 'f03c360ec83663d730d76a5e53e27e4544c82f6c6f1ecfbbc0fba1538cd980a8', 'OPERON_CLI_LEGACY_HASH_MISMATCH');
		}
	}
	if (legacyTarball) {
		install(legacyTarball);
		await assertVersion('1.0.7');
	}
	install(tarball);
	await assertVersion('1.2.0');
	if (legacyTarball) {
		install(legacyTarball);
		await assertVersion('1.0.7');
		install(tarball);
		await assertVersion('1.2.0');
	}
	run(['uninstall', '--global', '--prefix', installRoot, '--ignore-scripts', '--no-audit', '--no-fund', '@stratejya/operon-cli'], installRoot);
	await assertUninstalled();
	assert.equal(await readFile(sentinel, 'utf8'), '{"preserved":true}\n');
	assert.equal(await readFile(configSentinel, 'utf8'), '{"preserved":true}\n');
	console.log(JSON.stringify({ status: 'passed', entries: pack.files.length, tarballBytes: pack.size }));

	async function createLocalCandidate() {
		const pack = runJson([
			'pack',
			'--json',
			'--ignore-scripts',
			'--pack-destination',
			packRoot,
		], projectRoot)[0];
		const tarball = path.join(packRoot, pack.filename);
		const archive = await normalizeOperonPackageTarballV1(tarball);
		assert.equal(archive.bytes, OPERON_CLI_MAIN_CANDIDATE_V1.tarball.bytes, 'OPERON_CLI_CANDIDATE_BYTES_MISMATCH');
		assert.equal(archive.sha256, OPERON_CLI_MAIN_CANDIDATE_V1.tarball.sha256, 'OPERON_CLI_CANDIDATE_HASH_MISMATCH');
		pack.size = archive.bytes;
		pack.files = archive.entries.map(entry => ({
			path: entry.path.replace(/^package\//u, ''),
			mode: entry.mode,
			size: entry.size,
		}));
		return { pack, tarball };
	}
	async function inspectExternalCandidate(candidate) {
		assert.ok(path.isAbsolute(candidate), 'OPERON_CLI_CANDIDATE_TARBALL_INVALID');
		await assertRegularArtifact(candidate, 'OPERON_CLI_CANDIDATE_TARBALL_INVALID');
		const archive = await inspectPackageTarballV1(candidate);
		const manifestPath = process.env.OPERON_CLI_CANDIDATE_MANIFEST;
		assert.ok(manifestPath && path.isAbsolute(manifestPath), 'OPERON_CLI_CANDIDATE_MANIFEST_REQUIRED');
		await assertRegularArtifact(manifestPath, 'OPERON_CLI_CANDIDATE_MANIFEST_INVALID');
		const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
		assert.equal(manifest?.canonical?.tarball?.sha256, archive.sha256, 'OPERON_CLI_CANDIDATE_HASH_MISMATCH');
		assert.equal(manifest?.canonical?.tarball?.bytes, archive.bytes, 'OPERON_CLI_CANDIDATE_BYTES_MISMATCH');
		const packageEntry = archive.entries.find(entry => entry.path === 'package/package.json');
		assert.ok(packageEntry, 'OPERON_CLI_CANDIDATE_PACKAGE_JSON_MISSING');
		const packagedDocument = JSON.parse(packageEntry.content.toString('utf8'));
		assert.equal(packagedDocument.name, '@stratejya/operon-cli');
		assert.equal(packagedDocument.version, '1.2.0');
		assert.equal('private' in packagedDocument, false);
		assert.deepEqual(packagedDocument.publishConfig, {
			access: 'public',
			registry: 'https://registry.npmjs.org/',
			provenance: true,
		});
		const files = archive.entries.map(entry => ({
			path: entry.path.replace(/^package\//u, ''),
			mode: entry.mode,
			size: entry.size,
		}));
		return {
			tarball: candidate,
			pack: {
				name: packagedDocument.name,
				version: packagedDocument.version,
				filename: path.basename(candidate),
				files,
				size: archive.bytes,
			},
		};
	}

	function install(specifier) {
		run(['install', '--global', '--prefix', installRoot, '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', specifier], installRoot);
	}
	async function assertVersion(expected) {
		assert.equal(await readFile(sentinel, 'utf8'), '{"preserved":true}\n');
		assert.equal(await readFile(configSentinel, 'utf8'), '{"preserved":true}\n');
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
		const directInvocation = windowsShimVersionInvocationV1(cmdShim);
		const directResult = spawnSync(cmdExecutable, directInvocation.args, {
			encoding: 'utf8',
			env: packageEnvironment(),
			cwd: directInvocation.cwd,
			windowsHide: directInvocation.windowsHide,
			shell: directInvocation.shell,
		});
		assertCommandVersion(directResult, expected, 'operon.cmd');
		const pathInvocation = windowsShimVersionInvocationV1(cmdShim, {
			resolveFromPath: true,
			cwd: configRoot,
		});
		const pathResult = spawnSync(cmdExecutable, pathInvocation.args, {
			encoding: 'utf8',
			env: packageEnvironment(),
			cwd: pathInvocation.cwd,
			windowsHide: pathInvocation.windowsHide,
			shell: pathInvocation.shell,
		});
		assertCommandVersion(pathResult, expected, 'PATH-resolved operon');
		const systemRoot = Object.entries(process.env)
			.find(([key]) => key.toLocaleLowerCase('en-US') === 'systemroot')?.[1];
		assert.ok(systemRoot && path.win32.isAbsolute(systemRoot), 'OPERON_CLI_WINDOWS_SYSTEM_ROOT_REQUIRED');
		const windowsPowerShell = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
		assertCommandVersion(spawnSync(windowsPowerShell, [
			'-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', powershellShim, 'version',
		], { encoding: 'utf8', env: packageEnvironment(), windowsHide: true, shell: false }), expected, 'operon.ps1 via Windows PowerShell');
		const pwsh = path.win32.join(process.env.ProgramFiles ?? '', 'PowerShell', '7', 'pwsh.exe');
		assertCommandVersion(spawnSync(pwsh, [
			'-NoLogo', '-NoProfile', '-NonInteractive', '-File', powershellShim, 'version',
		], { encoding: 'utf8', env: packageEnvironment(), windowsHide: true, shell: false }), expected, 'operon.ps1 via PowerShell 7');
		const gitBash = path.win32.join(process.env.ProgramFiles ?? '', 'Git', 'bin', 'bash.exe');
		assertCommandVersion(spawnSync(gitBash, [shellShim, 'version'], {
			encoding: 'utf8', env: packageEnvironment(), windowsHide: true, shell: false,
		}), expected, 'operon via Git Bash');
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

async function assertRegularArtifact(target, failureCode) {
	assert.ok(path.isAbsolute(target), failureCode);
	const stat = await lstat(target);
	assert.equal(stat.isFile(), true, failureCode);
	assert.equal(stat.isSymbolicLink(), false, failureCode);
}
