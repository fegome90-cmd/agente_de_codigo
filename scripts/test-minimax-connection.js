#!/usr/bin/env node

/**
 * MiniMax M2 Connection Test Script
 * Tests the MiniMax API integration and configuration
 */

import { createMiniMaxAdapter } from '../packages/orchestrator/src/llm/minimax-adapter.js';
import { llmProviderManager } from '../packages/orchestrator/src/llm/llm-provider-manager.js';
import { config } from 'dotenv';

// Load environment variables
config();

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function colorLog(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testMiniMaxDirect() {
  colorLog('\n=== Testing MiniMax Direct Integration ===', 'cyan');

  try {
    const minimax = createMiniMaxAdapter();

    colorLog('✅ MiniMax adapter created successfully', 'green');

    // Test model info
    const modelInfo = minimax.getModelInfo();
    colorLog(`📋 Model Info: ${JSON.stringify(modelInfo, null, 2)}`, 'blue');

    // Test connection
    colorLog('🔍 Testing API connection...', 'yellow');
    const isValid = await minimax.validateConnection();

    if (isValid) {
      colorLog('✅ API connection validated successfully', 'green');
    } else {
      colorLog('❌ API connection validation failed', 'red');
      return false;
    }

    // Test simple chat
    colorLog('💬 Testing simple chat...', 'yellow');
    const response = await minimax.chat('Hello! Please respond with a brief greeting.', [
      { role: 'system', content: 'You are a helpful AI assistant. Be concise and friendly.' }
    ]);

    colorLog(`🤖 Response: "${response}"`, 'green');

    // Test streaming
    colorLog('🌊 Testing streaming chat...', 'yellow');
    colorLog('Streaming response: ', 'yellow', false);

    for await (const token of minimax.streamChatCompletion([
      { role: 'user', content: 'Tell me a fun fact about programming in one sentence.' }
    ])) {
      process.stdout.write(token);
    }
    console.log(); // New line after streaming

    colorLog('✅ Streaming completed successfully', 'green');

    return true;

  } catch (error) {
    colorLog(`❌ MiniMax test failed: ${error.message}`, 'red');
    console.error(error);
    return false;
  }
}

async function testLLMProviderManager() {
  colorLog('\n=== Testing LLM Provider Manager ===', 'cyan');

  try {
    // Check available providers
    const providers = llmProviderManager.getAvailableProviders();
    colorLog(`📋 Available providers: ${providers.map(p => p.name).join(', ')}`, 'blue');

    // Test MiniMax through provider manager
    const minimaxProvider = providers.find(p => p.name === 'MiniMax M2');

    if (minimaxProvider && minimaxProvider.available) {
      colorLog('✅ MiniMax available through provider manager', 'green');

      // Test request through provider manager
      const response = await llmProviderManager.generateCompletion({
        id: 'test-' + Date.now(),
        prompt: 'What is 2 + 2? Just give the number.',
        temperature: 0.1,
        maxTokens: 10,
        provider: 'minimax'
      });

      colorLog(`🤖 Provider Manager Response: "${response.content}"`, 'green');
      colorLog(`📊 Usage: ${JSON.stringify(response.usage)}`, 'blue');
      colorLog(`⏱️  Processing Time: ${response.processingTime}ms`, 'blue');

    } else {
      colorLog('❌ MiniMax not available through provider manager', 'red');
    }

    // Test provider statistics
    const stats = llmProviderManager.getProviderStats();
    colorLog('📈 Provider Statistics:', 'blue');
    console.log(JSON.stringify(stats, null, 2));

    // Test health check
    colorLog('🔍 Running health check...', 'yellow');
    const healthResults = await llmProviderManager.healthCheck();

    let healthyCount = 0;
    for (const [provider, isHealthy] of Object.entries(healthResults)) {
      const status = isHealthy ? '✅' : '❌';
      colorLog(`  ${status} ${provider}`, isHealthy ? 'green' : 'red');
      if (isHealthy) healthyCount++;
    }

    colorLog(`🏥 Health Summary: ${healthyCount}/${Object.keys(healthResults).length} providers healthy`,
                healthyCount === Object.keys(healthResults).length ? 'green' : 'yellow');

    return true;

  } catch (error) {
    colorLog(`❌ Provider Manager test failed: ${error.message}`, 'red');
    console.error(error);
    return false;
  }
}

function checkEnvironmentConfiguration() {
  colorLog('\n=== Environment Configuration Check ===', 'cyan');

  const requiredVars = [
    'MINIMAX_API_KEY',
    'MINIMAX_BASE_URL',
    'MINIMAX_MODEL'
  ];

  let allConfigured = true;

  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (value && value !== `your-${varName.toLowerCase()}-here`) {
      colorLog(`✅ ${varName}: ${value.substring(0, 20)}${value.length > 20 ? '...' : ''}`, 'green');
    } else {
      colorLog(`❌ ${varName}: Not configured or using placeholder`, 'red');
      allConfigured = false;
    }
  }

  // Check optional variables
  const optionalVars = [
    'MINIMAX_TEMPERATURE',
    'MINIMAX_MAX_TOKENS',
    'MINIMAX_TIMEOUT'
  ];

  colorLog('\n📋 Optional Configuration:', 'blue');
  for (const varName of optionalVars) {
    const value = process.env[varName];
    if (value) {
      colorLog(`  ✓ ${varName}: ${value}`, 'blue');
    } else {
      colorLog(`  - ${varName}: Using default`, 'yellow');
    }
  }

  return allConfigured;
}

async function main() {
  colorLog('🚀 MiniMax M2 Connection Test', 'bright');
  colorLog('==================================', 'bright');

  // Check environment configuration
  const envConfigured = checkEnvironmentConfiguration();

  if (!envConfigured) {
    colorLog('\n❌ Environment configuration incomplete. Please update your .env file.', 'red');
    colorLog('\n📖 MiniMax API Documentation:', 'blue');
    colorLog('   https://platform.minimaxi.com/document/QuickStart', 'blue');
    colorLog('   https://platform.minimaxi.com/user-center/api-key', 'blue');
    process.exit(1);
  }

  // Run tests
  const directTestResult = await testMiniMaxDirect();
  const providerTestResult = await testLLMProviderManager();

  colorLog('\n=== Test Results ===', 'bright');

  if (directTestResult && providerTestResult) {
    colorLog('🎉 All tests passed! MiniMax M2 is ready to use.', 'green');
    colorLog('\n💡 You can now use MiniMax in your agents:', 'cyan');
    colorLog('   • Set LLM_PROVIDER=minimax in your agent configuration', 'cyan');
    colorLog('   • The system will automatically fallback to other providers if needed', 'cyan');
    process.exit(0);
  } else {
    colorLog('❌ Some tests failed. Please check the errors above.', 'red');
    colorLog('\n🔧 Troubleshooting:', 'yellow');
    colorLog('   1. Verify your API key is correct', 'yellow');
    colorLog('   2. Check your internet connection', 'yellow');
    colorLog('   3. Ensure you have sufficient API quota', 'yellow');
    colorLog('   4. Check if the MiniMax API is accessible', 'yellow');
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  colorLog(`\n💥 Uncaught Error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  colorLog(`\n💥 Unhandled Rejection: ${reason}`, 'red');
  console.error('Promise:', promise);
  process.exit(1);
});

// Run the test
main().catch(error => {
  colorLog(`\n💥 Test Failed: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});