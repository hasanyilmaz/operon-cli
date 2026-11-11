export const OPERON_CLI_RELEASE_V1 = Object.freeze({
	package: Object.freeze({
		name: '@stratejya/operon-cli',
		version: '1.3.1',
	}),
	distTag: 'latest',
	registry: 'https://registry.npmjs.org/',
	tarball: Object.freeze({
		bytes: 272_876,
		sha256: '0e3c63d8a3d32723bcfb24e8d670cd6833a70022f2e824ce7a282a1615bc37df',
		sha512: '3SNWR5tX/rXesgXxei2YECB9kO6ryNC8eJp+GEjzhVcYXMeUWOVUrj5SrcHcwbLBIRUKE3y/NNVfv9sqNmGEAQ==',
	}),
	inventoryEntries: 55,
	executable: Object.freeze({
		bytes: 618_791,
		sha256: 'b94bdb4809f2e8d208509e51b6d3ff1c09cef745c59b97eeab135df598b1397d',
		mode: 0o755,
	}),
	manifest: Object.freeze({
		bytes: 82_517,
		sha256: '8bcded26c46aa5b8bf1785c1bb522b91e840a81fdba45861b5057e9cdcd85bcf',
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
	tag: 'cli-v1.3.1',
	confirmation: 'STAGE @stratejya/operon-cli@1.3.1 TO latest',
});
