import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, cp, lstat, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path, { delimiter, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChildEnvironmentWithPathV1 } from './child-process-environment.mjs';
import { assertOperonPackageInventoryV1, inspectPackageTarballV1 } from './package-archive.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NPM_VERSION = '11.12.1';
const NPM_TARBALL = 'https://registry.npmjs.org/npm/-/npm-11.12.1.tgz';
const NPM_INTEGRITY = 'sha512-zcoUuF1kezGSAo0CqtvoLXX3mkRqzuqYdL6Y5tdo8g69NVV3CkjQ6ZBhBgB4d7vGkPcV6TcvLi3GRKPDFX+xTA==';
const LEGACY = Object.freeze({
	name: '@stratejya/operon-cli',
	version: '1.0.7',
	latest: '1.0.7',
	tarball: 'https://registry.npmjs.org/@stratejya/operon-cli/-/operon-cli-1.0.7.tgz',
	integrity: 'sha512-VaGaIBw17hFThpbgvHKm6vGu52tKNsHlQwhGLSOElVZBwIMRwE+aUkzITcgZHBhU9yGronJfJaGXXSFhCPjYHw==',
	bytes: 213_485,
	sha256: 'f03c360ec83663d730d76a5e53e27e4544c82f6c6f1ecfbbc0fba1538cd980a8',
});

const [command, ...args] = process.argv.slice(2);
switch (command) {
	case 'workflow-check': await workflowCheck(args[0]); break;
	case 'install-script-check': await installScriptCheck(); break;
	case 'acquire-npm': await acquireNpm(required(args[0])); break;
	case 'run-npm': runNpm(required(args[0]), args.slice(1)); break;
	case 'acquire-legacy': await acquireLegacy(required(args[0]), required(args[1])); break;
	case 'create-candidate': await createCandidate(required(args[0]), required(args[1]), requiredText(args[2])); break;
	case 'compare-candidates': await compareCandidates(required(args[0]), required(args[1])); break;
	case 'consumer-toolchain': consumerToolchain(requiredText(args[0]), requiredText(args[1])); break;
	default: throw new Error(`OPERON_CLI_HOSTED_COMMAND_INVALID:${command ?? ''}`);
}

async function workflowCheck(workflowPath = path.join(projectRoot, '.github', 'workflows', 'hosted-validation.yml')) {
	const document = await readFile(workflowPath, 'utf8');
	assert.equal(document.match(/^\s*permissions\s*:/gmu)?.length, 1, 'OPERON_CLI_WORKFLOW_PERMISSION_BLOCK_MISMATCH');
	for (const requiredText of [
		'permissions:\n  contents: read',
		'pull_request:',
		'workflow_dispatch:',
		'persist-credentials: false',
		'fail-fast: false',
		'max-parallel: 3',
		'ubuntu-24.04',
		'macos-14',
		'windows-2022',
		'windows-2025',
		'hosted-validation-gate:',
		'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
		'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
		'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
		'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
	]) assert.ok(document.includes(requiredText), `OPERON_CLI_WORKFLOW_REQUIRED_TEXT_MISSING:${requiredText}`);
	for (const forbidden of [
		'pull_request_target', 'id-token:', 'packages: write', 'contents: write',
		'npm publish', 'npm dist-tag', 'provenance', 'NODE_AUTH_TOKEN:', 'NPM_TOKEN:',
		'actions/cache@', 'schedule:', 'release:', 'write-all', 'read-all', 'secrets.',
	]) assert.equal(document.includes(forbidden), false, `OPERON_CLI_WORKFLOW_FORBIDDEN_TEXT:${forbidden}`);
	assert.doesNotMatch(document, /^\s+[A-Za-z-]+:\s+write\s*$/gmu, 'OPERON_CLI_WORKFLOW_WRITE_PERMISSION_FORBIDDEN');
	const allowedActions = new Set([
		'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
		'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
		'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
		'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
	]);
	for (const match of document.matchAll(/uses:\s+([^\s#]+)/gu)) {
		assert.match(match[1] ?? '', /^[^@\s]+@[0-9a-f]{40}$/u, 'OPERON_CLI_WORKFLOW_ACTION_NOT_PINNED');
		assert.equal(allowedActions.has(match[1] ?? ''), true, `OPERON_CLI_WORKFLOW_ACTION_NOT_ALLOWED:${match[1] ?? ''}`);
	}
	console.log(JSON.stringify({ status: 'passed', workflow: path.basename(workflowPath) }));
}

async function installScriptCheck() {
	const lock = JSON.parse(await readFile(path.join(projectRoot, 'package-lock.json'), 'utf8'));
	const actual = Object.entries(lock.packages ?? {})
		.filter(([, value]) => value?.hasInstallScript === true)
		.map(([packagePath]) => packagePath)
		.sort();
	assert.deepEqual(actual, ['node_modules/esbuild'], 'OPERON_CLI_INSTALL_SCRIPT_INVENTORY_MISMATCH');
	console.log(JSON.stringify({ status: 'passed', installScripts: actual }));
}

async function acquireNpm(root) {
	await mkdir(root, { recursive: true });
	const metadata = runBootstrapNpmJson(['view', `npm@${NPM_VERSION}`, 'version', 'dist.tarball', 'dist.integrity', '--json', '--registry=https://registry.npmjs.org/']);
	assert.equal(metadata.version, NPM_VERSION, 'OPERON_CLI_HOSTED_NPM_VERSION_MISMATCH');
	assert.equal(metadata['dist.tarball'], NPM_TARBALL, 'OPERON_CLI_HOSTED_NPM_TARBALL_MISMATCH');
	assert.equal(metadata['dist.integrity'], NPM_INTEGRITY, 'OPERON_CLI_HOSTED_NPM_INTEGRITY_MISMATCH');
	const packed = runBootstrapNpmJson(['pack', `npm@${NPM_VERSION}`, '--json', '--ignore-scripts', '--pack-destination', root, '--registry=https://registry.npmjs.org/'])[0];
	const tarball = path.join(root, packed.filename);
	const archive = await inspectPackageTarballV1(tarball);
	assert.equal(`sha512-${archive.sha512}`, NPM_INTEGRITY, 'OPERON_CLI_HOSTED_NPM_BYTES_MISMATCH');
	run('tar', ['-xzf', tarball, '-C', root]);
	const cli = npmCli(root);
	const stat = await lstat(cli);
	assert.equal(stat.isFile(), true, 'OPERON_CLI_HOSTED_NPM_CLI_INVALID');
	assert.equal(stat.isSymbolicLink(), false, 'OPERON_CLI_HOSTED_NPM_CLI_INVALID');
	assert.equal(run(process.execPath, [cli, '--version'], { capture: true }).trim(), NPM_VERSION);
	await createNpmWrappers(root, cli);
	console.log(JSON.stringify({ status: 'passed', version: NPM_VERSION }));
}

async function createNpmWrappers(root, cli) {
	const bin = path.join(root, 'toolchain-bin');
	await mkdir(bin, { recursive: true });
	const shellWrapper = path.join(bin, 'npm');
	await writeFile(shellWrapper, `#!/bin/sh\nexec "${process.execPath}" "${cli}" "$@"\n`);
	await chmod(shellWrapper, 0o755);
	await writeFile(path.join(bin, 'npm.cmd'), `@ECHO OFF\r\n"${process.execPath}" "${cli}" %*\r\n`);
	await writeFile(path.join(bin, 'npm.ps1'), `& '${process.execPath.replaceAll("'", "''")}' '${cli.replaceAll("'", "''")}' @args\nexit $LASTEXITCODE\n`);
}

async function acquireLegacy(npmRoot, outputRoot) {
	await mkdir(outputRoot, { recursive: true });
	const metadata = runNpmJson(npmRoot, ['view', `${LEGACY.name}@${LEGACY.version}`, 'version', 'dist.tarball', 'dist.integrity', '--json', '--registry=https://registry.npmjs.org/']);
	const tags = runNpmJson(npmRoot, ['view', LEGACY.name, 'dist-tags', '--json', '--registry=https://registry.npmjs.org/']);
	assert.equal(metadata.version, LEGACY.version, 'OPERON_CLI_LEGACY_VERSION_MISMATCH');
	assert.equal(metadata['dist.tarball'], LEGACY.tarball, 'OPERON_CLI_LEGACY_TARBALL_MISMATCH');
	assert.equal(metadata['dist.integrity'], LEGACY.integrity, 'OPERON_CLI_LEGACY_INTEGRITY_MISMATCH');
	assert.equal(tags.latest, LEGACY.latest, 'OPERON_CLI_LEGACY_LATEST_MISMATCH');
	const packed = runNpmJson(npmRoot, ['pack', `${LEGACY.name}@${LEGACY.version}`, '--json', '--ignore-scripts', '--pack-destination', outputRoot, '--registry=https://registry.npmjs.org/'])[0];
	const source = path.join(outputRoot, packed.filename);
	const archive = await inspectPackageTarballV1(source);
	assert.equal(archive.bytes, LEGACY.bytes, 'OPERON_CLI_LEGACY_BYTES_MISMATCH');
	assert.equal(archive.sha256, LEGACY.sha256, 'OPERON_CLI_LEGACY_SHA256_MISMATCH');
	assert.equal(`sha512-${archive.sha512}`, LEGACY.integrity, 'OPERON_CLI_LEGACY_SHA512_MISMATCH');
	const destination = path.join(outputRoot, 'operon-cli-1.0.7.tgz');
	if (source !== destination) await rename(source, destination);
	await writeFile(path.join(outputRoot, 'legacy-manifest.json'), `${JSON.stringify(LEGACY, null, 2)}\n`);
	console.log(JSON.stringify({ status: 'passed', version: LEGACY.version, bytes: archive.bytes, sha256: archive.sha256 }));
}

async function createCandidate(npmRoot, outputRoot, runnerId) {
	await mkdir(outputRoot, { recursive: true });
	const packed = runNpmJson(npmRoot, ['pack', '--json', '--ignore-scripts', '--pack-destination', outputRoot], projectRoot)[0];
	assert.equal(packed.name, '@stratejya/operon-cli');
	assert.equal(packed.version, '1.0.8');
	const source = path.join(outputRoot, packed.filename);
	const destination = path.join(outputRoot, 'operon-cli-1.0.8.tgz');
	if (source !== destination) await rename(source, destination);
	const archive = await inspectPackageTarballV1(destination);
	assertOperonPackageInventoryV1(archive.entries);
	assertNoPrivateMarkers(archive.entries);
	const canonical = {
		package: { name: packed.name, version: packed.version },
		tarball: { bytes: archive.bytes, sha256: archive.sha256, sha512: archive.sha512 },
		inventory: archive.entries.map(({ path, mode, size, sha256 }) => ({ path, mode, size, sha256 })),
		executable: identity(archive.entries, 'package/dist/operon.mjs'),
		manifest: identity(archive.entries, 'package/cli-manifest-v1.json'),
		schemas: aggregate(archive.entries.filter(entry => entry.path.startsWith('package/schemas/v1/'))),
		declarations: aggregate(archive.entries.filter(entry => entry.path.startsWith('package/types/'))),
	};
	const evidence = { runnerId, node: process.version, npm: NPM_VERSION, githubSha: process.env.GITHUB_SHA ?? 'local' };
	await writeFile(path.join(outputRoot, 'artifact-manifest.json'), `${JSON.stringify({ canonical, evidence }, null, 2)}\n`);
	console.log(JSON.stringify({ status: 'passed', runnerId, bytes: archive.bytes, sha256: archive.sha256 }));
}

async function compareCandidates(inputRoot, outputRoot) {
	const manifests = [];
	for (const directory of await readdir(inputRoot, { withFileTypes: true })) {
		if (!directory.isDirectory()) continue;
		const root = path.join(inputRoot, directory.name);
		try {
			const manifest = JSON.parse(await readFile(path.join(root, 'artifact-manifest.json'), 'utf8'));
			const tarballPath = path.join(root, 'operon-cli-1.0.8.tgz');
			const tarball = await readFile(tarballPath);
			const archive = await inspectPackageTarballV1(tarballPath);
			assert.equal(archive.bytes, manifest?.canonical?.tarball?.bytes, `OPERON_CLI_CANONICAL_BYTES_MISMATCH:${directory.name}`);
			assert.equal(archive.sha256, manifest?.canonical?.tarball?.sha256, `OPERON_CLI_CANONICAL_SHA256_MISMATCH:${directory.name}`);
			assert.equal(archive.sha512, manifest?.canonical?.tarball?.sha512, `OPERON_CLI_CANONICAL_SHA512_MISMATCH:${directory.name}`);
			assertOperonPackageInventoryV1(archive.entries);
			assertNoPrivateMarkers(archive.entries);
			assert.deepEqual(
				archive.entries.map(({ path, mode, size, sha256 }) => ({ path, mode, size, sha256 })),
				manifest?.canonical?.inventory,
				`OPERON_CLI_CANONICAL_INVENTORY_MISMATCH:${directory.name}`,
			);
			manifests.push({ name: directory.name, root, manifest, tarball });
		} catch (error) {
			if (error?.code !== 'ENOENT') throw error;
		}
	}
	assert.equal(manifests.length, 4, 'OPERON_CLI_CANONICAL_ARTIFACT_COUNT_MISMATCH');
	manifests.sort((left, right) => left.name.localeCompare(right.name, 'en'));
	const baseline = JSON.stringify(manifests[0].manifest.canonical);
	for (const item of manifests.slice(1)) {
		assert.equal(JSON.stringify(item.manifest.canonical), baseline, `OPERON_CLI_CANONICAL_ARTIFACT_MISMATCH:${item.name}`);
		assert.equal(item.tarball.equals(manifests[0].tarball), true, `OPERON_CLI_CANONICAL_TARBALL_MISMATCH:${item.name}`);
	}
	const ubuntu = manifests.find(item => item.name.includes('ubuntu'));
	assert.ok(ubuntu, 'OPERON_CLI_CANONICAL_UBUNTU_ARTIFACT_MISSING');
	await mkdir(outputRoot, { recursive: true });
	await cp(path.join(ubuntu.root, 'operon-cli-1.0.8.tgz'), path.join(outputRoot, 'operon-cli-1.0.8.tgz'));
	await cp(path.join(ubuntu.root, 'artifact-manifest.json'), path.join(outputRoot, 'artifact-manifest.json'));
	await writeFile(path.join(outputRoot, 'determinism-report.json'), `${JSON.stringify({ status: 'passed', candidates: manifests.map(item => item.manifest.evidence), canonical: ubuntu.manifest.canonical }, null, 2)}\n`);
	console.log(JSON.stringify({ status: 'passed', candidates: manifests.length }));
}

function consumerToolchain(nodeVersion, npmVersion) {
	assert.equal(process.version, `v${nodeVersion}`, 'OPERON_CLI_CONSUMER_NODE_VERSION_MISMATCH');
	assert.equal(runBootstrapNpm(['--version']).trim(), npmVersion, 'OPERON_CLI_CONSUMER_NPM_VERSION_MISMATCH');
	console.log(JSON.stringify({ status: 'passed', node: nodeVersion, npm: npmVersion }));
}

function assertNoPrivateMarkers(entries) {
	const markers = [projectRoot, process.env.HOME, process.env.RUNNER_TEMP].filter(Boolean);
	for (const entry of entries) {
		const text = entry.content.toString('utf8');
		for (const marker of markers) assert.equal(text.includes(marker), false, `OPERON_CLI_PRIVATE_PATH_LEAK:${entry.path}`);
	}
}

function identity(entries, target) {
	const entry = entries.find(candidate => candidate.path === target);
	assert.ok(entry, `OPERON_CLI_PACKAGE_ENTRY_MISSING:${target}`);
	return { bytes: entry.size, sha256: entry.sha256, mode: entry.mode };
}

function aggregate(entries) {
	return createHash('sha256').update(JSON.stringify(entries.map(({ path, mode, size, sha256 }) => ({ path, mode, size, sha256 })))).digest('hex');
}

function npmCli(root) {
	return path.join(root, 'package', 'bin', 'npm-cli.js');
}

function runNpm(root, npmArgs) {
	run(process.execPath, [npmCli(root), ...npmArgs], {
		stdio: 'inherit',
		pathPrefix: [path.join(root, 'toolchain-bin')],
	});
}

function runNpmJson(root, npmArgs, cwd = projectRoot) {
	return JSON.parse(run(process.execPath, [npmCli(root), ...npmArgs], {
		capture: true,
		cwd,
		pathPrefix: [path.join(root, 'toolchain-bin')],
	}));
}

function runBootstrapNpmJson(npmArgs) {
	return JSON.parse(runBootstrapNpm(npmArgs));
}

function runBootstrapNpm(npmArgs) {
	return run(process.platform === 'win32' ? 'npm.cmd' : 'npm', npmArgs, { capture: true });
}

function run(executable, commandArgs, options = {}) {
	const inheritedPath = Object.entries(process.env)
		.find(([key]) => key.toLocaleLowerCase('en-US') === 'path')?.[1] ?? '';
	const pathPrefix = [...(options.pathPrefix ?? []), dirname(process.execPath)].join(delimiter);
	const result = spawnSync(executable, commandArgs, {
		cwd: options.cwd ?? projectRoot,
		encoding: 'utf8',
		stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : (options.stdio ?? ['ignore', 'pipe', 'pipe']),
		shell: false,
		env: createChildEnvironmentWithPathV1(process.env, `${pathPrefix}${delimiter}${inheritedPath}`),
	});
	if (result.error || result.status !== 0) throw new Error(`OPERON_CLI_HOSTED_COMMAND_FAILED:${executable}:${result.status}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`, { cause: result.error });
	return result.stdout ?? '';
}

function required(value) {
	if (!value) throw new Error('OPERON_CLI_HOSTED_ARGUMENT_REQUIRED');
	return path.resolve(value);
}

function requiredText(value) {
	if (!value) throw new Error('OPERON_CLI_HOSTED_ARGUMENT_REQUIRED');
	return value;
}
