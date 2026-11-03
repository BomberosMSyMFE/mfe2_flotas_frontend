const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('webpack').container;

module.exports = {
  entry: './src/index.js',
  mode: 'development',
  devServer: {
    port: 3002,
    static: path.join(__dirname, 'public'),
    hot: true,
    historyApiFallback: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
    },
  },
  output: {
    publicPath: 'auto',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', { targets: 'defaults' }],
              ['@babel/preset-react', { runtime: 'automatic' }],
            ],
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'mf_mapa',
      filename: 'remoteEntry.js',
      exposes: {
        './VisorCartografico': './src/components/VisorCartografico',
        './FlotasMapModule': './src/App',
      },
      shared: {
        react: {
          singleton: true,
          requiredVersion: '^18.3.1',
          eager: false,
        },
        'react-dom': {
          singleton: true,
          requiredVersion: '^18.3.1',
          eager: false,
        },
      },
    }),
    new HtmlWebpackPlugin({
      template: './public/index.html',
      favicon: false,
    }),
  ],
  resolve: {
    extensions: ['.js', '.jsx'],
  },
};
