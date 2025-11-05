/**
 * Debug Path Matching for Layering Analyzer
 */

import { LayeringAnalyzer } from './dist/layering-analyzer.js';
import { SymbolExtractor } from './dist/symbol-extractor.js';

async function debugPathMatching() {
  console.log('🔍 Debugging Path Matching...\n');

  try {
    const symbolExtractor = new SymbolExtractor();
    const layeringAnalyzer = new LayeringAnalyzer(symbolExtractor);

    // Load configuration
    await layeringAnalyzer.loadConfiguration('./temp-layering-test/layering-config.yaml');

    // Test file paths and their expected layers
    const testCases = [
      {
        filePath: './temp-layering-test/src/components/UserComponent.ts',
        expectedLayer: 'presentation'
      },
      {
        filePath: './temp-layering-test/src/services/UserService.ts',
        expectedLayer: 'business'
      },
      {
        filePath: './temp-layering-test/src/infrastructure/database/DatabaseService.ts',
        expectedLayer: 'infrastructure'
      },
      {
        filePath: './temp-layering-test/src/utils/Helper.ts',
        expectedLayer: 'infrastructure'
      }
    ];

    console.log('Testing path matching:');
    for (const testCase of testCases) {
      const fullPath = testCase.filePath.replace(/^\.\//, '');
      console.log(`\n📁 File: ${testCase.filePath}`);
      console.log(`   Expected layer: ${testCase.expectedLayer}`);
      console.log(`   Full path: ${fullPath}`);

      // Extract relative path like the analyzer does
      const normalizedPath = fullPath.replace(/\\/g, '/');
      const relativePath = normalizedPath.includes('/')
        ? normalizedPath.substring(normalizedPath.lastIndexOf('src/'))
        : normalizedPath;

      console.log(`   Relative path: ${relativePath}`);

      // Test patterns that should match
      const patterns = {
        'presentation': ['src/components/**', 'src/controllers/**', 'src/views/**'],
        'business': ['src/services/**', 'src/domain/**', 'src/core/**'],
        'infrastructure': ['src/repositories/**', 'src/database/**', 'src/infrastructure/**', 'src/api/**', 'src/utils/**']
      };

      for (const [layer, layerPatterns] of Object.entries(patterns)) {
        console.log(`   Testing ${layer} patterns:`);
        for (const pattern of layerPatterns) {
          const regex = new RegExp(
            `^${pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`
          );
          const matches = regex.test(relativePath);
          console.log(`     ${pattern} -> ${matches ? '✅ MATCH' : '❌ no match'}`);
        }
      }
    }

    // Test the actual getFileLayer method (we need to make it accessible)
    console.log('\n🔧 Testing actual layer detection (if accessible)...');

  } catch (error) {
    console.error('❌ Debug test failed:', error);
  }
}

debugPathMatching();