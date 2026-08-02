import { builtinModules } from 'node:module';
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { assertOperonCliPackageDocumentV1 } from './package-identity.mjs';
import { classifyOperonCliExecutableSize } from './size-policy.mjs';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(projectRoot, 'dist');
if (process.env.OPERON_CLI_FRAME_TIMING_BUILD !== undefined) {
	throw new Error('OPERON_CLI_FRAME_TIMING_BUILD_FORBIDDEN');
}
if (process.env.OPERON_CLI_PERSISTENT_READ_BUILD !== undefined) {
	throw new Error('OPERON_CLI_PERSISTENT_READ_BUILD_FORBIDDEN');
}
await rm(distRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });
const packageDocument = assertOperonCliPackageDocumentV1(JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8')));
const frameTimingBuild = false;
const persistentReadBuild = true;
const stripFrameTimingPlugin = {
	name: 'strip-frame-timing',
	setup(context) {
		context.onResolve({ filter: /^\.\/session-frame-timing$/ }, () => ({
			path: 'session-frame-timing-disabled',
			namespace: 'operon-timing-build-gate',
		}));
		context.onLoad({ filter: /.*/, namespace: 'operon-timing-build-gate' }, () => ({
			contents: 'const state=Object.freeze({submit:()=>0,begin:()=>[0,0],complete:()=>{},flush:()=>Promise.resolve()}); export function createSessionFrameClockV1(){return state}',
			loader: 'js',
		}));
	},
};
const outfile = path.join(distRoot, 'operon.mjs');
const result = await build({
	entryPoints: [path.join(projectRoot, 'src', 'main.ts')],
	outdir: distRoot,
	entryNames: 'operon',
	chunkNames: 'chunks/chunk-[hash]',
	outExtension: { '.js': '.mjs' },
	bundle: true,
	splitting: true,
	platform: 'node',
	format: 'esm',
	target: 'node22',
	charset: 'utf8',
	minify: true,
	sourcemap: false,
	metafile: true,
	banner: { js: '#!/usr/bin/env node' },
	define: {
		__OPERON_CLI_PACKAGE_NAME__: JSON.stringify(packageDocument.name),
		__OPERON_CLI_VERSION__: JSON.stringify(packageDocument.version),
		__OPERON_CLI_FRAME_TIMING__: frameTimingBuild ? 'true' : 'false',
		__OPERON_CLI_PERSISTENT_READ__: persistentReadBuild ? 'true' : 'false',
	},
	plugins: [
		stripFrameTimingPlugin,
	],
	external: [...builtinModules, ...builtinModules.map(name => `node:${name}`)],
	logLevel: 'silent',
});
for (const input of Object.keys(result.metafile.inputs)) {
	if (input.startsWith('operon-') && input.includes(':')) continue;
	const absolute = path.resolve(projectRoot, input);
	if (absolute !== projectRoot && !absolute.startsWith(`${projectRoot}${path.sep}`)) {
		throw new Error(`OPERON_CLI_BUILD_INPUT_OUTSIDE_REPOSITORY:${input}`);
	}
}
const allowedExternal = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)]);
for (const output of Object.values(result.metafile.outputs)) {
	for (const imported of output.imports ?? []) {
		if (imported.external && !allowedExternal.has(imported.path)) {
			throw new Error(`OPERON_CLI_BUILD_EXTERNAL_FORBIDDEN:${imported.path}`);
		}
	}
}
if (process.env.OPERON_CLI_ESBUILD_METAFILE) {
	await writeFile(path.join(distRoot, 'metafile.json'), JSON.stringify(result.metafile));
}
const forbiddenInput = Object.keys(result.metafile.inputs).find(input => /(?:^|\/)node_modules\/(?:electron|obsidian)(?:\/|$)/u.test(input));
if (forbiddenInput) throw new Error(`OPERON_CLI_FORBIDDEN_RUNTIME_INPUT:${forbiddenInput}`);
const output = await readFile(outfile, 'utf8');
if (/(?:from|import)\s*["'](?:electron|obsidian)["']|\b(?:document|window)\s*\.|\bHTMLElement\b/u.test(output)) {
	throw new Error('OPERON_CLI_FORBIDDEN_BROWSER_OR_OBSIDIAN_RUNTIME');
}
for (const marker of ['OPERON_CLI_STAGE51_TIMING_FD', 'frameTiming', 'timeOriginMs', 'submittedEpochMs', 'serviceStartEpochMs', 'serviceEndEpochMs', 'clockOffsetMs']) {
	if (!frameTimingBuild && output.includes(marker)) throw new Error(`OPERON_CLI_DISABLED_FRAME_TIMING_LEAK:${marker}`);
}
await chmod(outfile, 0o755);
const executable = await stat(outfile);
if (classifyOperonCliExecutableSize(executable.size) === 'fail') {
	throw new Error(`OPERON_CLI_EXECUTABLE_TOO_LARGE:${executable.size}`);
}
console.log(JSON.stringify({
	status: 'passed',
	bytes: executable.size,
	persistentRead: persistentReadBuild,
	frameTiming: frameTimingBuild,
	inputs: Object.keys(result.metafile.inputs).length,
}));
