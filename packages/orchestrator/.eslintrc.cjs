module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: "./tsconfig.json",
    ecmaFeatures: {
      impliedStrict: true,
    },
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "@typescript-eslint/recommended",
    "@typescript-eslint/recommended-requiring-type-checking",
  ],
  env: {
    node: true,
    es2022: true,
  },
  globals: {
    console: "readonly",
    process: "readonly",
    Buffer: "readonly",
    __dirname: "readonly",
    __filename: "readonly",
    module: "readonly",
    require: "readonly",
    exports: "readonly",
    global: "readonly",
    window: "readonly",
    document: "readonly",
  },
  rules: {
    // TypeScript specific rules - Pit-Crew optimized configuration
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "warn", // Allow any with warning for flexibility
    "@typescript-eslint/explicit-function-return-type": "off", // Optional return types
    "@typescript-eslint/explicit-module-boundary-types": "off", // Flexible boundaries
    "@typescript-eslint/no-non-null-assertion": "warn", // Allow with caution
    "@typescript-eslint/prefer-const": "warn",
    "@typescript-eslint/no-floating-promises": "warn", // Async/await best practices
    "@typescript-eslint/await-thenable": "warn", // Proper async patterns
    "@typescript-eslint/ban-ts-comment": "warn", // Allow @ts-ignore with warning
    "@typescript-eslint/no-unsafe-assignment": "warn", // Safe assignments
    "@typescript-eslint/no-unsafe-member-access": "warn", // Safe member access
    "@typescript-eslint/no-unsafe-call": "warn", // Safe function calls
    "@typescript-eslint/no-unsafe-return": "warn", // Safe returns

    // Performance and optimization rules
    "@typescript-eslint/no-unnecessary-type-assertion": "warn",
    "@typescript-eslint/prefer-as-const": "warn",
    "@typescript-eslint/prefer-includes": "warn",
    "@typescript-eslint/prefer-string-starts-ends-with": "warn",

    // General rules - relaxed for development velocity
    indent: ["error", 2],
    "linebreak-style": ["error", "unix"],
    quotes: ["error", "single"],
    semi: ["error", "always"],
    "no-console": ["warn", { allow: ["warn", "error", "info", "debug"] }], // Allow console logging
    "no-var": ["error"],
    "prefer-const": ["warn"],
    "no-trailing-spaces": "warn",
    "eol-last": "warn",

    // Disabled rules that cause issues with TypeScript
    "no-redeclare": "off", // TypeScript handles this
    "no-undef": "off", // TypeScript handles this
    "@typescript-eslint/no-misused-promises": "off", // Too strict for current codebase
    "@typescript-eslint/restrict-template-expressions": "off", // Allow flexibility
  },
  ignorePatterns: [
    "dist/",
    "node_modules/",
    "test/",
    "**/*.min.js",
    "**/*.d.ts",
  ],
};
