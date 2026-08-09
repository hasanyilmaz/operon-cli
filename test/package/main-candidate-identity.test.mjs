import assert from 'node:assert/strict';
import test from 'node:test';

import { OPERON_CLI_MAIN_CANDIDATE_V1 } from '../../scripts/main-candidate-identity.mjs';
import { OPERON_CLI_RELEASE_V1 } from '../../scripts/release-identity.mjs';

test('main candidate identity remains non-release when adopted by the release freeze', () => {
	assert.equal(OPERON_CLI_MAIN_CANDIDATE_V1.kind, 'operon-cli-main-candidate-v1');
	assert.equal(OPERON_CLI_MAIN_CANDIDATE_V1.release, false);
	assert.deepEqual(OPERON_CLI_MAIN_CANDIDATE_V1.package, OPERON_CLI_RELEASE_V1.package);
	assert.deepEqual(OPERON_CLI_MAIN_CANDIDATE_V1.tarball, OPERON_CLI_RELEASE_V1.tarball);
	assert.equal(OPERON_CLI_MAIN_CANDIDATE_V1.inventoryEntries, OPERON_CLI_RELEASE_V1.inventoryEntries);
	assert.deepEqual(OPERON_CLI_MAIN_CANDIDATE_V1.executable, OPERON_CLI_RELEASE_V1.executable);
	assert.deepEqual(OPERON_CLI_MAIN_CANDIDATE_V1.manifest, OPERON_CLI_RELEASE_V1.manifest);
	assert.equal(OPERON_CLI_MAIN_CANDIDATE_V1.schemas, OPERON_CLI_RELEASE_V1.schemas);
	assert.equal(OPERON_CLI_MAIN_CANDIDATE_V1.declarations, OPERON_CLI_RELEASE_V1.declarations);
	assert.equal(OPERON_CLI_MAIN_CANDIDATE_V1.contractDigest, OPERON_CLI_RELEASE_V1.runtimeV1Digest);
	assert.equal(OPERON_CLI_MAIN_CANDIDATE_V1.inventoryEntries, 48);
	assert.match(OPERON_CLI_MAIN_CANDIDATE_V1.pluginCandidateSha, /^[a-f0-9]{40}$/u);
	assert.match(OPERON_CLI_MAIN_CANDIDATE_V1.contractDigest, /^[a-f0-9]{64}$/u);
	assert.match(OPERON_CLI_MAIN_CANDIDATE_V1.tarball.sha256, /^[a-f0-9]{64}$/u);
});
