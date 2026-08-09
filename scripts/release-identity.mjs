export const OPERON_CLI_RELEASE_V1 = Object.freeze({
	package: Object.freeze({
		name: '@stratejya/operon-cli',
		version: '1.1.0',
	}),
	distTag: 'latest',
	registry: 'https://registry.npmjs.org/',
	tarball: Object.freeze({
		bytes: 237_750,
		sha256: 'e95338275ea0e7c921303c39c94362d49c6261d50354a2095b3e2b30ba51dd1d',
		sha512: '7CSYIpxQdX9Obb4x/2MQbt4sVe2TpQFSmTxYUg1AqBpjdnEgtirwctJtoeZLhEXgOQStVgCwIM5IQeHRCppg4g==',
	}),
	inventoryEntries: 48,
	executable: Object.freeze({
		bytes: 572_243,
		sha256: 'b2c62c213aa8a3d23995c7676b32eb184cd88e5092324821b9e5fcbb32e79e19',
		mode: 0o755,
	}),
	manifest: Object.freeze({
		bytes: 60_662,
		sha256: '2bbf7a6d49a612d6b9b9496ba2d6539a33bcc4f7eedc8c7f2421239905458a67',
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
	tag: 'cli-v1.1.0',
	confirmation: 'STAGE @stratejya/operon-cli@1.1.0 TO latest',
});
