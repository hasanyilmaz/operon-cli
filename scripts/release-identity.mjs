export const OPERON_CLI_RELEASE_V1 = Object.freeze({
	package: Object.freeze({
		name: '@stratejya/operon-cli',
		version: '1.0.8',
	}),
	distTag: 'latest',
	registry: 'https://registry.npmjs.org/',
	tarball: Object.freeze({
		bytes: 214_687,
		sha256: '8638e108569f7a17de39a8c7981f48fa609dab47dc2d86e18bf2453046c540c8',
		sha512: 'at5kcCCMa6ScfpvPrQTkVJMWE3DIxQqZDsLWopQKQY/YYKeLYHwKA/R296rSyJ61BOG6xMlxD1Q3hb851kYcXA==',
	}),
	inventoryEntries: 41,
	executable: Object.freeze({
		bytes: 514_533,
		sha256: '5f8c2917ab55e79f9d3608e3f253bd8a2e24341b301ca386e16135bbc3a2ba6f',
		mode: 0o755,
	}),
	manifest: Object.freeze({
		bytes: 51_235,
		sha256: '5bc2d14a94f2edec2154d3df901291ff9895a6372ad16dac0bf0ef26ea389c6a',
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
	tag: 'cli-v1.0.8',
	confirmation: 'STAGE @stratejya/operon-cli@1.0.8 TO latest',
});
