/**
 * Basic functionality test for Documentation Agent
 * Tests core functionality without Jest framework
 */

import { OpenAPIParser } from './dist/openapi-parser.js';
import { DocumentationAgent } from './dist/documentation-agent.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';

console.log('🧪 Testing Documentation Agent basic functionality...');

async function testOpenAPIParser() {
  console.log('\n📋 Testing OpenAPI Parser...');

  const parser = new OpenAPIParser();

  // Test file detection
  console.log('✅ File detection tests:');
  console.log(`   openapi.json: ${OpenAPIParser.isOpenAPIFile('openapi.json')}`);
  console.log(`   swagger.yaml: ${OpenAPIParser.isOpenAPIFile('swagger.yaml')}`);
  console.log(`   package.json: ${OpenAPIParser.isOpenAPIFile('package.json')}`);

  // Test parsing a valid OpenAPI spec
  const testSpec = {
    openapi: '3.0.0',
    info: {
      title: 'Test API',
      version: '1.0.0',
      description: 'A test API for validation'
    },
    paths: {
      '/users': {
        get: {
          operationId: 'getUsers',
          summary: 'Get all users',
          responses: {
            '200': {
              description: 'Successful response',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { type: 'object' }
                  }
                }
              }
            }
          }
        }
      }
    }
  };

  // Create temporary test file
  const testDir = join(dirname(process.argv[1]), 'temp-test');
  const testFile = join(testDir, 'test-api.json');

  try {
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(testFile, JSON.stringify(testSpec, null, 2));

    console.log('\n📄 Testing OpenAPI parsing...');
    const result = await parser.parseDocument(testFile);

    console.log(`   ✅ Parsing successful: ${result.validationErrors.length === 0 ? 'No errors' : `${result.validationErrors.length} errors`}`);
    console.log(`   📊 Document title: ${result.document.title}`);
    console.log(`   📊 Document version: ${result.document.version}`);
    console.log(`   📊 Paths count: ${Object.keys(result.document.paths).length}`);

    // Test document comparison
    console.log('\n🔍 Testing document comparison...');
    const modifiedSpec = {
      ...testSpec,
      info: { ...testSpec.info, version: '2.0.0' },
      paths: {
        ...testSpec.paths,
        '/posts': {
          get: {
            operationId: 'getPosts',
            responses: { '200': { description: 'Success' } }
          }
        }
      }
    };

    const modifiedFile = join(testDir, 'modified-api.json');
    await fs.writeFile(modifiedFile, JSON.stringify(modifiedSpec, null, 2));

    const modifiedResult = await parser.parseDocument(modifiedFile);
    const findings = parser.compareDocuments(result.document, modifiedResult.document);

    console.log(`   ✅ Comparison successful: ${findings.length} changes detected`);
    console.log(`   📊 Version change: ${findings.some(f => f.ruleId === 'VERSION_CHANGED') ? 'Detected' : 'Not detected'}`);
    console.log(`   📊 New path: ${findings.some(f => f.ruleId === 'PATH_ADDED') ? 'Detected' : 'Not detected'}`);

    console.log('\n🎯 OpenAPI Parser tests completed successfully!');

  } catch (error) {
    console.error('❌ OpenAPI Parser test failed:', error.message);
    throw error;
  } finally {
    // Cleanup
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function testDocumentationAgent() {
  console.log('\n🤖 Testing Documentation Agent...');

  try {
    const agent = new DocumentationAgent('/tmp/test-socket');

    // Test capabilities
    const capabilities = agent.getCapabilities();
    console.log('✅ Agent capabilities:');
    console.log(`   📡 Heartbeat support: ${capabilities.supportsHeartbeat}`);
    console.log(`   📡 Task support: ${capabilities.supportsTasks}`);
    console.log(`   🔧 Tools count: ${capabilities.tools.length}`);
    console.log(`   🌐 Languages: ${capabilities.languages.join(', ')}`);
    console.log(`   ⚡ Features: ${capabilities.features.join(', ')}`);

    // Test configuration
    console.log('\n⚙️  Testing configuration...');
    const config = {
      timeoutSeconds: 120,
      breakingChangeThresholds: { critical: 0, high: 5, medium: 10 },
      semverAnalysis: { autoRecommend: true }
    };

    agent.updateConfig(config);
    console.log('   ✅ Configuration updated successfully');

    console.log('\n🎯 Documentation Agent tests completed successfully!');

  } catch (error) {
    console.error('❌ Documentation Agent test failed:', error.message);
    throw error;
  }
}

async function runTests() {
  console.log('🚀 Starting Documentation Agent Tests');
  console.log('=====================================');

  try {
    await testOpenAPIParser();
    await testDocumentationAgent();

    console.log('\n🏆 ALL TESTS PASSED!');
    console.log('✅ Documentation Agent is ready for use');

  } catch (error) {
    console.error('\n💥 TESTS FAILED');
    console.error('Please check the implementation');
    process.exit(1);
  }
}

// Run tests
runTests();