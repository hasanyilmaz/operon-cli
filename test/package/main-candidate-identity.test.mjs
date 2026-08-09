import assert from 'node:assert/strict';
import test from 'node:test';

import { OPERON_CLI_MAIN_CANDIDATE_V1 } from '../../scripts/main-candidate-identity.mjs';
import { OPERON_CLI_RELEASE_V1 } from '../../scripts/release-identity.mjs';

test('main candidate identity is exact, non-release, and independently anchored', () => {
	assert.equal(OPERON_CLI_MAIN_CANDIDATE_V1.kind, 'operon-cli-main-candidate-v1');
	assert.equal(OPERON_CLI_MAIN_CANDIDATE_V1.release, false);
	assert.deepEqual(OPERON_CLI_MAIN_CANDIDATE_V1.package, OPERON_CLI_RELEASE_V1.package);
	assert.notEqual(
		OPERON_CLI_MAIN_CANDIDATE_V1.tarball.sha256,
		OPERON_CLI_RELEASE_V1.tarball.sha256,
	);
	assert.equal(OPERON_CLI_MAIN_CANDIDATE_V1.inventoryEntries, 48);
	assert.match(OPERON_CLI_MAIN_CANDIDATE_V1.pluginCandidateSha, /^[a-f0-9]{40}$/u);
	assert.match(OPERON_CLI_MAIN_CANDIDATE_V1.contractDigest, /^[a-f0-9]{64}$/u);
	assert.match(OPERON_CLI_MAIN_CANDIDATE_V1.tarball.sha256, /^[a-f0-9]{64}$/u);
});
