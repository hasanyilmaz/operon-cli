export const OPERON_CLI_RELEASE_V1 = Object.freeze({
	package: Object.freeze({
		name: '@stratejya/operon-cli',
		version: '1.1.0',
	}),
	distTag: 'latest',
	registry: 'https://registry.npmjs.org/',
	tarball: Object.freeze({
		bytes: 218_845,
		sha256: 'f3ac7e1d6411c1d7068d101d5394ffb2b022174c8e65210b3791bee844f908fa',
		sha512: 'SBx5uGqpXaQMo4n979J7RuNenjv06L8660Qs1E353GwfUcAA8Kz7hOhIsw7yrg9mfLGtd9Bzbx5sTZrCiGTPuA==',
	}),
	inventoryEntries: 41,
	executable: Object.freeze({
		bytes: 527_264,
		sha256: 'a942782d7a6af635be1b51d07b60ce2beca90e2179c80c5f62bfbfc9235b6b64',
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
