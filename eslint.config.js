// @ts-check
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: [
      'dist/',
      '**/dist/',
      'build/',
      '**/build/',
      '.next/',
      '**/.next/',
      'node_modules/',
      '**/node_modules/',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['*.config.js', '**/*.config.js', '*.config.ts', '**/*.config.ts', '*.workspace.ts', '.sdd-scripts/**'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        projectService: {
          allowDefaultProject: ['packages/icons/tests/Icon.test.tsx'],
          defaultProject: 'packages/icons/tsconfig.json',
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs['recommended-type-checked'].rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
