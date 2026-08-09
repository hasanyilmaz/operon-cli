export const OPERON_CLI_RELEASE_V1 = Object.freeze({
	package: Object.freeze({
		name: '@stratejya/operon-cli',
		version: '1.1.1',
	}),
	distTag: 'latest',
	registry: 'https://registry.npmjs.org/',
	tarball: Object.freeze({
		bytes: 238_035,
		sha256: 'e274be85386bb53e9656f2627d5264efded25ce689ad0ecaa60e585aa2511ad9',
		sha512: 'u90oMELXjnuK7bSCDdu9E70p6jyKxlZGfkYRLaFDw7ui1GnlwlTL/9fHu9aDUrY5V8CMfqmC46yA2+BUqJqBPQ==',
	}),
	inventoryEntries: 48,
	executable: Object.freeze({
		bytes: 573_270,
		sha256: 'd53e516f38529e192c9b7cd91c7b899440c951a927275eaff82cacdc3213293e',
		mode: 0o755,
	}),
	manifest: Object.freeze({
		bytes: 60_662,
		sha256: '9a71a319440085c9c79c8dea071c72c7b337635244c5acf2a7666267bc63ba7a',
		mode: 0o644,
	}),
	schemas: 'dc58777402989717d8b5c03cf1eb5d79da8297bfc751c87f9de506f69d6aaf9f',
	declarations: '074b16ccef6a029b78b236daae215e799931f0b5251862ddfcc174b63a4def90',
	runtimeV1Digest: 'daaa7cce4b8ada5fd6d0a90a6676be887e854998f1d2ea4f23d7228be795a7ee',
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
	tag: 'cli-v1.1.1',
	confirmation: 'STAGE @stratejya/operon-cli@1.1.1 TO latest',
});
