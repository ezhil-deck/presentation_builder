module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: '24' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
};
