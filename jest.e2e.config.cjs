// The browser e2e tests (P4.4): puppeteer driving the real Studio (packages/ui/server.js on a sandbox data root).
// `npm run test:e2e` (under caffeinate on a Mac: display sleep hangs puppeteer). Not part of `npm test`.
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  testMatch: ['**/__e2e__/**/*.e2e.js'],
  transform: { '^.+\\.[cm]?jsx?$': 'babel-jest' },
  moduleFileExtensions: ['js', 'jsx', 'cjs', 'mjs', 'json'],
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 180000,
  maxWorkers: 1,
};
