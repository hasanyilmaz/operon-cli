export const OPERON_CLI_RELEASE_V1 = Object.freeze({
	package: Object.freeze({
		name: '@stratejya/operon-cli',
		version: '1.1.0',
	}),
	distTag: 'latest',
	registry: 'https://registry.npmjs.org/',
	tarball: Object.freeze({
		bytes: 218_843,
		sha256: '7e9c5de7feaaeb8423bebb41707f131ad12eb48e69b5879cf4204710eca7b17e',
		sha512: 'xZtzaLPNXbOYNgAzQT73BU+8HHG+tjqfgySE5L56+lAyjU2CzSg6FHwB2JYSToypRh0kh6fDtfWTnZvtOOghCA==',
	}),
	inventoryEntries: 41,
	executable: Object.freeze({
		bytes: 527_264,
		sha256: '64253cc966c1ae997ab07625efc053f5bf4e31eecdb9b720c55a447b7179ac6e',
		mode: 0o755,
	}),
	manifest: Object.freeze({
		bytes: 52_507,
		sha256: '7ff41835609ac34b0658751f264270925fdc93dada3bbfca67e3bbc0c181aca9',
		mode: 0o644,
	}),
	schemas: 'ec36c956b6ce8d0c25a0e692cf2a52ccbab01f7a2706ad1d7863fd3cbabfa663',
	declarations: 'd427b4e2f116ce856dd8114238209b5a3f6b3f5900060596357a71483a21e709',
	runtimeV1Digest: '79ba528ea0f8e249cb9583bc0d9b91bba6293d7b2531051fbecd25c39820c9ef',
});

export const OPERON_CLI_PUBLISH_NPM_V1 = Object.freeze({
	version: '11.19.0',
	tarball: 'https://registry.npmjs.org/npm/-/npm-11.19.0.tgz',
	integrity: 'sha512-SDd/hHg3KqHE5Ht2NHWxNYNtqCQ2pXAPLl6OtQhPyED5PHsRfrOtO199MZTIG2cQoQ1ZRI9t28shrD+2cr3AAw==',
});

export const OPERON_CLI_RELEASE_WORKFLOW_V1 = Object.freeze({
	repository: 'hasanyilmaz/operon-cli',
	hostedWorkflowPath: '.github/workflows/hosted-validation.yml',
	releaseWorkflow: 'npm-staged-release.yml',
	environment: 'npm-staging',
	tag: 'cli-v1.1.0',
	confirmation: 'STAGE @stratejya/operon-cli@1.1.0 TO latest',
});
