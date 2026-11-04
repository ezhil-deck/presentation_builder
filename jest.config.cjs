module.exports = {
  testEnvironment: 'node',
  // Jest roots do not take globs: scan packages/ and match each package's __tests__/.
  roots: ['<rootDir>/packages'],
  testMatch: ['**/__tests__/**/*.test.js?(x)'],
  transform: { '^.+\\.[cm]?jsx?$': 'babel-jest' },
  moduleFileExtensions: ['js', 'jsx', 'cjs', 'mjs', 'json'],
  testPathIgnorePatterns: ['/node_modules/', '/__fixtures__/', '/__e2e__/'],
  collectCoverage: false,
};
