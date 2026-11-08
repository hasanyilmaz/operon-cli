import { CANONICAL_KEY_MAP, LEGACY_CANONICAL_KEY_ALIASES } from '../types/keys';
import type { KeyMapping } from '../types/settings';

export type InlinePropertyType = KeyMapping['type'];
export type InlinePropertyEncoding = 'legacy' | 'vault-v1';
export interface InlinePropertyDefinition {
 sourceName: string;
 type: InlinePropertyType;
 encoding: InlinePropertyEncoding;
}
export interface InlinePropertyDefinitions {
 version: 1;
 entries: InlinePropertyDefinition[];
}

/** Backup import/reset must retain the meaning of names already present in notes. */
export function mergeImportedInlinePropertyDefinitions(
 previous: readonly KeyMapping[], next: readonly KeyMapping[], stored: InlinePropertyDefinitions | undefined,
 imported: InlinePropertyDefinitions | undefined, importedMappings: readonly KeyMapping[],
): InlinePropertyDefinitions | undefined {
 let definitions = reconcileInlinePropertyDefinitions(previous, previous.filter(mapping => mapping.isSystem !== false), stored);
 for (const entry of imported?.entries ?? []) definitions = retainInlinePropertyDefinition(definitions, entry);
 for (const mapping of importedMappings) {
  for (const sourceName of aliases(mapping)) {
   const declared = imported?.entries.find(entry => identity(entry.sourceName) === identity(sourceName));
   const existing = definitions?.entries.find(entry => identity(entry.sourceName) === identity(sourceName));
   definitions = retainInlinePropertyDefinition(definitions, declared ?? existing ?? { sourceName, type: mapping.type, encoding: 'legacy' });
  }
 }
 return reconcileInlinePropertyDefinitions(previous, next, definitions);
}

const TYPES = new Set(['text', 'list', 'number', 'checkbox', 'date', 'datetime']);
const identity = (name: string): string => name.trim().toLowerCase();
const aliases = (mapping: KeyMapping): string[] => [...new Set([mapping.canonicalKey, mapping.visiblePropertyName].filter(Boolean))];
export function isSystemPropertyName(name: string): boolean {
 return CANONICAL_KEY_MAP.has(name) || Object.values(LEGACY_CANONICAL_KEY_ALIASES).some(names => names?.includes(name));
}
export function validateInlinePropertyDefinitions(value: unknown): asserts value is InlinePropertyDefinitions {
 if (!value || typeof value !== 'object') throw new Error('Invalid inline property definitions');
 const registry = value as Partial<InlinePropertyDefinitions>;
 if (registry.version !== 1 || !Array.isArray(registry.entries)) throw new Error('Unsupported inline property definitions');
 const seen = new Map<string, InlinePropertyDefinition>();
 for (const entry of registry.entries) {
  if (!entry || typeof entry.sourceName !== 'string' || !entry.sourceName.trim()
   || /[\r\n]|::|[{}]/u.test(entry.sourceName) || !TYPES.has(entry.type)
   || (entry.encoding !== 'legacy' && entry.encoding !== 'vault-v1')) throw new Error('Invalid inline property definition');
  const previous = seen.get(identity(entry.sourceName));
  if (previous && (previous.type !== entry.type || previous.encoding !== entry.encoding)) throw new Error('Conflicting inline property definitions');
  seen.set(identity(entry.sourceName), entry);
 }
}
export function cloneInlinePropertyDefinitions(value: InlinePropertyDefinitions | undefined): InlinePropertyDefinitions | undefined {
 if (value === undefined) return undefined;
 validateInlinePropertyDefinitions(value);
 return { version: 1, entries: value.entries.map(entry => ({ ...entry })) };
}
export function resolveInlinePropertyDefinition(
 name: string, type: InlinePropertyType, mappings: readonly KeyMapping[],
 definitions?: InlinePropertyDefinitions,
): InlinePropertyDefinition {
 if (definitions) validateInlinePropertyDefinitions(definitions);
 const matches = mappings.filter(mapping => aliases(mapping).some(alias => identity(alias) === identity(name)));
 if (matches.length > 1) throw new Error('Ambiguous property mapping');
 const mapping = matches[0];
 if (isSystemPropertyName(mapping?.canonicalKey ?? name) && mapping?.isSystem !== false) {
  return { sourceName: name, type, encoding: 'legacy' };
 }
 const stored = definitions?.entries.find(entry => identity(entry.sourceName) === identity(name));
 if (stored && stored.type !== type || mapping && mapping.type !== type) throw new Error('Property type mismatch');
 if (stored) return { ...stored, sourceName: name };
 return { sourceName: name, type, encoding: mapping ? 'legacy' : 'vault-v1' };
}
export function retainInlinePropertyDefinition(
 definitions: InlinePropertyDefinitions | undefined, definition: InlinePropertyDefinition,
): InlinePropertyDefinitions {
 const next = cloneInlinePropertyDefinitions(definitions) ?? { version: 1, entries: [] };
 const existing = next.entries.find(entry => identity(entry.sourceName) === identity(definition.sourceName));
 if (existing && (existing.type !== definition.type || existing.encoding !== definition.encoding)) throw new Error('Property interpretation conflict');
 if (!next.entries.some(entry => entry.sourceName === definition.sourceName)) next.entries.push({ ...definition });
 validateInlinePropertyDefinitions(next);
 return next;
}
/** Run during an explicit settings transaction, never while loading or rendering. */
export function reconcileInlinePropertyDefinitions(
 previous: readonly KeyMapping[], next: readonly KeyMapping[], stored?: InlinePropertyDefinitions,
): InlinePropertyDefinitions | undefined {
 let definitions = cloneInlinePropertyDefinitions(stored);
 const oldCustom = previous.filter(mapping => mapping.isSystem === false);
 const newCustom = next.filter(mapping => mapping.isSystem === false);
 const comparable = (mapping: KeyMapping): string => JSON.stringify([mapping.canonicalKey, mapping.visiblePropertyName, mapping.type]);
 if (JSON.stringify(oldCustom.map(comparable)) === JSON.stringify(newCustom.map(comparable))) return definitions;
 for (const mapping of oldCustom) {
  const definition = resolveInlinePropertyDefinition(mapping.visiblePropertyName || mapping.canonicalKey, mapping.type, previous, definitions);
  for (const name of aliases(mapping)) definitions = retainInlinePropertyDefinition(definitions, { ...definition, sourceName: name });
 }
 for (const mapping of newCustom) {
  const old = oldCustom.find(item => identity(item.canonicalKey) === identity(mapping.canonicalKey));
  const definition = old
   ? resolveInlinePropertyDefinition(old.visiblePropertyName || old.canonicalKey, old.type, previous, definitions)
   : resolveInlinePropertyDefinition(mapping.visiblePropertyName || mapping.canonicalKey, mapping.type, [], definitions);
  if (definition.type !== mapping.type) throw new Error('Changing property type requires compatible source values');
  for (const name of aliases(mapping)) {
   if (isSystemPropertyName(name)) throw new Error('Reserved property alias');
   if (next.some(other => other !== mapping && aliases(other).some(alias => identity(alias) === identity(name)))) throw new Error('Property alias collision');
   definitions = retainInlinePropertyDefinition(definitions, { ...definition, sourceName: name });
  }
 }
 return definitions;
}
