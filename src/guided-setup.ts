import { realpathSync } from 'node:fs';
import { basename, dirname, parse } from 'node:path';

import {
	type OperonCliConfigV1,
	listOperonConfigDirectoriesV1,
	resolveOperonInstallationV1,
	safeOperonManifestPathV1,
	samePlatformPathV1,
} from './config';
import type { InteractiveTerminalPortV1 } from './terminal-port';
import { sanitizeTerminalTextV1 } from './terminal-text';

const VAULT_DISCOVERY_DEPTH_LIMIT = 32;

export interface GuidedSetupSelectionV1 {
	vaultPath: string;
	name: string;
	configDir: string;
	makeDefault: boolean;
	verifyLive: boolean;
}

export type GuidedSetupResultV1 =
	| { status: 'cancelled'; message: string }
	| { status: 'ready'; selection: GuidedSetupSelectionV1 };

export async function runGuidedSetupWizardV1(options: {
	port: InteractiveTerminalPortV1;
	config: OperonCliConfigV1;
	cwd: string;
	configDir?: string;
}): Promise<GuidedSetupResultV1> {
	const { port, config } = options;
	port.write('Set up Operon CLI\n\n');
	let vaultPath = discoverOperonVaultFromCwdV1(options.cwd, options);
	if (vaultPath) {
		port.write(`Found an Operon vault in the current workspace: ${sanitizePathLabel(vaultPath)}\n`);
		const useDiscovered = await askYesNo(port, 'Use this vault?', true);
		if (useDiscovered === null) return cancelled();
		if (!useDiscovered) vaultPath = null;
	}
	while (!vaultPath) {
		const answer = await port.ask('Exact Obsidian vault path, or q to cancel: ');
		if (isCancelled(answer)) return cancelled();
		try {
			const canonical = realpathSync(answer!.trim());
			if (isOperonVaultCandidate(canonical, options)) {
				vaultPath = canonical;
				continue;
			}
		} catch {
			// Prompt again if the path cannot be inspected.
		}
		port.write('Enter an accessible Obsidian vault path with an Operon installation.\n');
	}

	const existing = config.profiles.find(profile => samePlatformPathV1(profile.canonicalPath, vaultPath));
	const configDir = options.configDir ?? await chooseConfigDirectory(port, vaultPath, existing?.configDir);
	if (configDir === null) return cancelled();
	const derived = existing?.name ?? deriveProfileAliasV1(basename(vaultPath));
	let name = derived;
	if (!existing && config.profiles.length > 0) {
		while (true) {
			const answer = await port.ask(`Profile alias [${derived}]: `);
			if (isCancelled(answer)) return cancelled();
			const candidate = answer!.trim() || derived;
			if (
				/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(candidate)
				&& !config.profiles.some(profile => (
					profile.name === candidate && profile.canonicalPath !== vaultPath
				))
			) {
				name = candidate;
				break;
			}
			port.write('Choose a unique alias using letters, numbers, dots, underscores, or hyphens.\n');
		}
	}
	const verifyLive = await askYesNo(port, 'Verify live Runtime now?', true);
	if (verifyLive === null) return cancelled();
	return {
		status: 'ready',
		selection: {
			vaultPath,
			name,
			configDir,
			makeDefault: config.profiles.length === 0,
			verifyLive,
		},
	};
}

export function discoverOperonVaultFromCwdV1(
	cwd: string,
	options: { config?: OperonCliConfigV1; configDir?: string } = {},
): string | null {
	let current: string;
	try {
		current = realpathSync(cwd);
	} catch {
		return null;
	}
	for (let depth = 0; depth < VAULT_DISCOVERY_DEPTH_LIMIT; depth += 1) {
		try {
			if (isOperonVaultCandidate(current, options)) return current;
		} catch {
			// Continue upward if this directory cannot be inspected.
		}
		const parent = dirname(current);
		if (parent === current || current === parse(current).root) break;
		current = parent;
	}
	return null;
}

function isOperonVaultCandidate(
	path: string,
	options: { config?: OperonCliConfigV1; configDir?: string },
): boolean {
	return options.config?.profiles.some(profile => samePlatformPathV1(profile.canonicalPath, path)) === true
		|| (options.configDir !== undefined && safeOperonManifestPathV1(path, options.configDir) !== undefined)
		|| listOperonConfigDirectoriesV1(path).length > 0;
}

async function chooseConfigDirectory(
	port: InteractiveTerminalPortV1,
	vaultPath: string,
	savedConfigDir?: string,
): Promise<string | null> {
	let savedError: unknown;
	if (savedConfigDir !== undefined) {
		try {
			return resolveOperonInstallationV1(vaultPath, savedConfigDir).configDir;
		} catch (error) {
			savedError = error;
			port.write(`Saved Obsidian config folder "${sanitizeTerminalTextV1(savedConfigDir)}" is unavailable.\n`);
		}
	}
	const candidates = listOperonConfigDirectoriesV1(vaultPath).filter(name => name !== savedConfigDir);
	if (candidates.length === 0) throw savedError ?? new Error('OPERON_PLUGIN_NOT_FOUND');
	if (candidates.length === 1 && savedConfigDir === undefined) return candidates[0];
	port.write([
		'Obsidian config folders with an Operon manifest:',
		...candidates.map((name, index) => `  ${index + 1}. ${sanitizeTerminalTextV1(name)}`),
	].join('\n') + '\n');
	while (true) {
		const answer = await port.ask('Choose the folder used by Obsidian on this device, or q to cancel: ');
		if (isCancelled(answer)) return null;
		const selected = candidates.find((_, index) => answer!.trim() === String(index + 1));
		if (selected !== undefined) return selected;
		port.write('Enter a listed folder number or q.\n');
	}
}

export function deriveProfileAliasV1(value: string): string {
	const normalized = value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '')
		.slice(0, 64)
		.replace(/-+$/gu, '');
	return normalized || 'vault';
}

export function completionHintForShellV1(shell?: string): string | undefined {
	const name = shell ? basename(shell) : '';
	if (name === 'zsh' || name === 'bash' || name === 'fish') {
		return `Optional completion: operon completion ${name}`;
	}
	return undefined;
}

function sanitizePathLabel(value: string): string {
	return sanitizeTerminalTextV1(value).slice(0, 240);
}

async function askYesNo(
	port: InteractiveTerminalPortV1,
	prompt: string,
	defaultValue: boolean,
): Promise<boolean | null> {
	while (true) {
		const answer = await port.ask(`${prompt} ${defaultValue ? '[Y/n]' : '[y/N]'} `);
		if (answer === null || answer.trim().toLowerCase() === 'q') return null;
		const value = answer.trim().toLowerCase();
		if (!value) return defaultValue;
		if (value === 'y' || value === 'yes') return true;
		if (value === 'n' || value === 'no') return false;
		port.write('Enter y, n, or q.\n');
	}
}

function isCancelled(answer: string | null): boolean {
	return answer === null || answer.trim().toLowerCase() === 'q';
}

function cancelled(): GuidedSetupResultV1 {
	return { status: 'cancelled', message: 'Operon setup cancelled.' };
}
