const { join } = require('node:path');

// Keep puppeteer's Chrome download inside the repo (git-ignored) instead of ~/.cache.
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
