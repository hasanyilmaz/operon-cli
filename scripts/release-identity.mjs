export const OPERON_CLI_RELEASE_V1 = Object.freeze({
	package: Object.freeze({
		name: '@stratejya/operon-cli',
		version: '1.3.0',
	}),
	distTag: 'latest',
	registry: 'https://registry.npmjs.org/',
	tarball: Object.freeze({
		bytes: 272_381,
		sha256: '7541ad027948d7ba5b454276af118b2b77782d844185b14648a7f3b84db41ecc',
		sha512: 's+ojX0T+uNpetxcTuvth6tCtnx3jtfdDLNJy3p2q/S3m3Wkth7+DpCBtwGjU6OK77JqUykV9o5gbyMqgVt37VA==',
	}),
	inventoryEntries: 55,
	executable: Object.freeze({
		bytes: 617_615,
		sha256: '6bb7d3d8be2195fd554dd7e96df27b7f01f2751e5673fdebf212a7abb9bc6134',
		mode: 0o755,
	}),
	manifest: Object.freeze({
		bytes: 82_517,
		sha256: '30425e6d7604f3d1f921adcd3de3b553752c915336c2708e5de6da991325a834',
		mode: 0o644,
	}),
	schemas: '3996fdeb64709b93140a4a17b7e641da0324a6ca1973d04c4a12ebc5cda1f8e2',
	declarations: '12d9d6bbb129f405cdfaaebd1e625093faa13e49702efcb2296c8c9a51b8260c',
	runtimeV1Digest: 'bf073d0e4d8ae881c1637f9142430193af9c6cc8ae2404ac85fbf412b138aa50',
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
	tag: 'cli-v1.3.0',
	confirmation: 'STAGE @stratejya/operon-cli@1.3.0 TO latest',
});
