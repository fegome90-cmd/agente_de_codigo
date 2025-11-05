module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    project: "./tsconfig.json",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "prettier",
  ],
  rules: {
    // TypeScript specific
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unsafe-assignment": "warn",
    "@typescript-eslint/no-unsafe-call": "warn",
    "@typescript-eslint/no-unsafe-member-access": "warn",
    "@typescript-eslint/no-unsafe-return": "warn",
    "@typescript-eslint/restrict-template-expressions": "warn",
    "@typescript-eslint/no-unsafe-argument": "warn",

    // General code quality
    "prefer-const": "error",
    "no-var": "error",
    "no-console": "warn",
    eqeqeq: ["error", "always", { null: "ignore" }],
    curly: ["error", "all"],
    "no-duplicate-imports": "error",
    "no-self-compare": "error",
    "no-unused-expressions": "error",

    // Style - Less strict comma-dangle for better DX
    indent: ["error", 2, { SwitchCase: 1 }],
    quotes: ["error", "single", { avoidEscape: true }],
    semi: ["error", "always"],
    "comma-dangle": ["error", "never"], // Changed from 'always-multiline' to 'never'
    "object-curly-spacing": ["error", "always"],
    "array-bracket-spacing": ["error", "never"],
  },
  ignorePatterns: [
    "dist/**/*",
    "coverage/**/*",
    "node_modules/**/*",
    "**/*.js",
  ],
  env: {
    node: true,
    es2022: true,
  },
};
