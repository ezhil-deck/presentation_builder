const path = require('node:path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => ({
  mode: argv.mode || 'development',
  entry: path.join(__dirname, 'src', 'index.jsx'),
  output: {
    path: path.join(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
    clean: true,
  },
  devtool: argv.mode === 'production' ? 'source-map' : 'eval-cheap-module-source-map',
  resolve: { extensions: ['.js', '.jsx'] },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        // rootMode upward: use the repo-root babel.config.cjs when run from packages/ui.
        use: { loader: 'babel-loader', options: { rootMode: 'upward' } },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
    ],
  },
  // A local tool: the bundle size warnings are noise.
  performance: { hints: false },
  plugins: [new HtmlWebpackPlugin({ template: path.join(__dirname, 'public', 'index.html') })],
  devServer: {
    port: 8100,
    host: 'localhost',
    historyApiFallback: true,
    hot: true,
    // The API + files come from `npm run api:ui` (packages/ui/server.js --api-only, port 8101).
    proxy: [{ context: ['/api', '/files'], target: 'http://localhost:8101' }],
  },
});
