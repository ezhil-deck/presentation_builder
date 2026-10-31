const path = require('node:path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.join(__dirname, 'public', '**', '*.html'),
    path.join(__dirname, 'src', '**', '*.{js,jsx}'),
    path.join(__dirname, '..', 'renderer', 'src', '**', '*.{js,jsx}'),
  ],
  theme: { extend: {} },
  // No preflight: slides painted live by @pb/renderer must match the export (no reset); src/index.css resets the
  // UI chrome only.
  corePlugins: { preflight: false },
  plugins: [],
};
