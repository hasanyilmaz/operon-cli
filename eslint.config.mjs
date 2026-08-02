import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
	{
		ignores: [
			'dist/**',
			'node_modules/**',
			'schemas/**',
			'types/**',
			'examples/developer-api-consumer/**',
		],
	},
	{
		...js.configs.recommended,
		files: ['**/*.mjs'],
		languageOptions: {
			globals: globals.node,
		},
	},
	...tseslint.configs.recommended.map(config => ({
		...config,
		files: ['src/**/*.ts', 'vendor/**/*.ts', 'test/**/*.ts'],
	})),
	{
		files: ['src/**/*.ts', 'vendor/**/*.ts', 'test/**/*.ts'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unused-vars': ['error', {
				argsIgnorePattern: '^_',
				varsIgnorePattern: '^_',
			}],
		},
	},
];
