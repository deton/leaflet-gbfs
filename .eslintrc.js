const airbnbBaseStyle = require("eslint-config-airbnb-base/rules/style");

module.exports = {
  env: {
    browser: true,
    es6: true
  },
  extends: [
    'airbnb-base'
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
    L: 'readonly'
  },
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module'
  },
  rules: {
    'no-console': 'off',
    'prefer-destructuring': ['error', {
      'array': false,
      'object': false
    }],
    // allow ForOfStatement https://zenn.dev/pirosikick/articles/f57c573282b3d8
    "no-restricted-syntax": airbnbBaseStyle.rules[
      "no-restricted-syntax"
    ].filter(
      (value) =>
        typeof value === "string" || // 'error'
        value.selector !== "ForOfStatement" // allow
    )
  }
};
