export const OPERON_CLI_RELEASE_V1 = Object.freeze({
	package: Object.freeze({
		name: '@stratejya/operon-cli',
		version: '1.3.2',
	}),
	distTag: 'latest',
	registry: 'https://registry.npmjs.org/',
	tarball: Object.freeze({
		bytes: 273_155,
		sha256: '2f5d01d40ddf31a813660bad8ca5d0cdd78d85e239cb166503d19766e7426dcd',
		sha512: 'q4BJ1mldCAir0soqOLOw7NJVFJZaT0U6sHW6drZDpBie+TelxpjHL85bJyJwr1NL6i/EA9OtBLt8de49FLKTVg==',
	}),
	inventoryEntries: 55,
	executable: Object.freeze({
		bytes: 619_678,
		sha256: '752d2b4a0f1547d8a9fdd67356d6085b537f6baa322343b789fe22d376c9c062',
		mode: 0o755,
	}),
	manifest: Object.freeze({
		bytes: 82_517,
		sha256: 'e75cad7207505d4ea099909f7f5aa490004d1e7c5528905199da838884df65a5',
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
	tag: 'cli-v1.3.2',
	confirmation: 'STAGE @stratejya/operon-cli@1.3.2 TO latest',
});
