export const OPERON_CLI_RELEASE_V1 = Object.freeze({
	package: Object.freeze({
		name: '@stratejya/operon-cli',
		version: '1.0.9',
	}),
	distTag: 'latest',
	registry: 'https://registry.npmjs.org/',
	tarball: Object.freeze({
		bytes: 214_810,
		sha256: '13d537a752690b8bdd6f0a5afdb64d50e7dae82653e0f1b13d79f5a26b987225',
		sha512: 'Fl2Axn85XfILTR7B9zLCC9OPpIZ023DbPGGsh8PTaKxHj8JfBz4/3QY4zs0kdIIR83UBDf1Y/gB/ky0vNOFOPQ==',
	}),
	inventoryEntries: 41,
	executable: Object.freeze({
		bytes: 514_849,
		sha256: '1a1658943ec990fa94bcbb58799afc0dfbc5d1d8c6254102672ae9f340dba731',
		mode: 0o755,
	}),
	manifest: Object.freeze({
		bytes: 51_235,
		sha256: '79eb2aef24f443474b3dc8301ba71fbb07142556ec9268783f5cd3a6df9801ac',
		mode: 0o644,
	}),
	schemas: 'e843f87facf647617b613f3cb1d19ffd858054581a943aeab3ebff25b67db247',
	declarations: '2d1043363a96c156086c4b974bb43d0cd151acc94663a50d5834759fa4d2b45d',
	runtimeV1Digest: '407f3a222f8c59a9622038e99e9345d0d34882fd358149b38bce5354ae0ca92b',
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
	tag: 'cli-v1.0.9',
	confirmation: 'STAGE @stratejya/operon-cli@1.0.9 TO latest',
});
