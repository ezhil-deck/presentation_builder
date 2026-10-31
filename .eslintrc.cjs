module.exports = {
  root: true,
  env: { es2024: true, node: true, browser: true, jest: true },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  settings: { react: { version: 'detect' } },
  rules: {
    'react/prop-types': 'off',
  },
  overrides: [
    {
      files: ['*.cjs'],
      parserOptions: { sourceType: 'script' },
    },
  ],
};
