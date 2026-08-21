export const OPERON_CLI_RELEASE_V1 = Object.freeze({
	package: Object.freeze({
		name: '@stratejya/operon-cli',
		version: '1.2.0',
	}),
	distTag: 'latest',
	registry: 'https://registry.npmjs.org/',
	tarball: Object.freeze({
		bytes: 247_124,
		sha256: 'd40e3d644249c1c1e22ca4e6f6bcab4a0381444ba3cac14ae8f519f7cde49aa8',
		sha512: 'EmDaQ4jhGBPGJ8YCqdSB7l/CPtx+QBxGcx2sxDeEvPd553OxZ+vad1c2H24dOaOYLO6MP0dubTlcoxGZzwD12Q==',
	}),
	inventoryEntries: 48,
	executable: Object.freeze({
		bytes: 596_449,
		sha256: 'd9089a4338b348e9059d6f69b197b61997c9d49eeebc101e31b2cdab9beda30b',
		mode: 0o755,
	}),
	manifest: Object.freeze({
		bytes: 62_632,
		sha256: '34b7f3fb985145a49ad9a6b7e075fbea5db85cd5ef5c9ad2061775feb53ec74a',
		mode: 0o644,
	}),
	schemas: 'a6c81d6de50fe88859f7b07e3fb526e1a58520dc735299811194d83a0ddd3ca9',
	declarations: '5221cf503f5d07c4e734996df40be5e8540c3f97e4be5ad6ad960bb1777fd084',
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
	tag: 'cli-v1.2.0',
	confirmation: 'STAGE @stratejya/operon-cli@1.2.0 TO latest',
});
