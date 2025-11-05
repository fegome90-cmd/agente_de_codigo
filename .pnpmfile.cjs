// pnpm override file for strict version management
// This ensures reproducible builds and prevents unexpected updates

module.exports = {
  // Override dependencies with strict version constraints
  overrides: {
    // Core dependencies - exact versions for reproducibility
    "tree-sitter": "0.22.4",
    "tree-sitter-typescript": "0.23.2",
    "tree-sitter-javascript": "0.23.1",
    "tree-sitter-python": "0.23.6",

    // Security-related dependencies with exact versions
    "semgrep": "1.78.0",
    "gitleaks": "8.18.4",

    // Quality tools with exact versions
    "ruff": "0.1.15",
    "eslint": "8.55.0",
    "@typescript-eslint/eslint-plugin": "6.13.1",
    "@typescript-eslint/parser": "6.13.1",

    // Testing dependencies
    "jest": "30.2.0",
    "@jest/globals": "30.2.0",
    "@types/jest": "30.0.0",
    "ts-jest": "29.4.5",

    // Core Node.js dependencies
    "typescript": "5.9.3",
    "esbuild": "0.19.8",
    "rollup": "4.6.1",

    // Build and development tools
    "vite": "5.0.5",
    "rollup-plugin-typescript2": "0.36.0",

    // Security patches - prevent vulnerable versions
    "axios": "^1.6.2",
    "lodash": "^4.17.21",
    "node-forge": "^1.3.1",
    "minimist": "^1.2.8",
    "qs": "^6.11.2",
    "json5": "^2.2.3",

    // Prevent known vulnerable packages
    "request": "npm:@cypress/request@^3.0.0",
    "node-fetch": "npm:node-fetch-native@^1.2.0",
    "glob-parent": "^6.0.2",
    "path-parse": "^1.0.7",

    // Performance and optimization
    "picocolors": "^1.0.0",
    "fast-glob": "^3.3.2",
    "rimraf": "^5.0.5"
  },

  // Package-specific rules
  hooks: {
    readPackage(pkg, context) {
      // Remove development dependencies from production builds
      if (context.devDependencies === false) {
        delete pkg.devDependencies;
        delete pkg.optionalDependencies?.dev;
      }

      // Ensure all dependencies have exact versions
      if (pkg.dependencies) {
        for (const [name, version] of Object.entries(pkg.dependencies)) {
          // Convert caret ranges to exact versions for critical deps
          if (pkg.name?.includes('agente') || name.includes('tree-sitter')) {
            pkg.dependencies[name] = version.replace(/^[\^~]/, '');
          }
        }
      }

      return pkg;
    }
  },

  // Peer dependency rules
  peerDependencyRules: {
    // Ignore missing peer dependencies for development
    ignoreMissing: [
      '@types/node',
      'typescript',
      'eslint',
      'prettier'
    ],

    // Allow any version for these peer dependencies
    allowAny: [
      'node',
      'npm',
      'pnpm'
    ]
  },

  // Prevent installation of known problematic packages
  packageExtensions: {
    // Extend package.json with additional metadata
    'pkg': {
      engines: {
        node: '>=20.0.0',
        pnpm: '>=8.0.0'
      }
    }
  }
};