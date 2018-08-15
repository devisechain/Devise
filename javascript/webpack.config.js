const path = require('path');

process.env.BABEL_ENV = process.env.NODE_ENV;

module.exports = {
    entry: './devise/index.js',
    output: {
        filename: 'devise.min.js',
        library: 'devise',
        libraryTarget: 'umd',
        path: path.resolve(__dirname, 'dist', process.env.NODE_ENV, require("./package.json").version)
    },
    module: {
        rules: [{
            test: /\.(js|jsx)$/,
            include: path.resolve(__dirname, 'devise'),
            loader: 'babel-loader',
            query: {
                // This is a feature of `babel-loader` for webpack (not Babel itself).
                // It enables caching results in ./node_modules/.cache/babel-loader/
                // directory for faster rebuilds.
                cacheDirectory: true
            }
        }]
    },
    externals: [
        {
            "web3": {
                root: "Web3",
                commonjs2: "web3",
                commonjs: ["web3"],
                amd: "web3"
            }
        },
        "xmlhttprequest"
    ]
};
