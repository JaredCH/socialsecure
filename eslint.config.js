const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  // Global ignores
  {
    ignores: [
      'node_modules/',
      'frontend/',
      'build/',
      'coverage/',
    ],
  },

  // Backend Node.js files
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-constant-condition': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
    },
  },
];
