# 🔗 MiniMax M2 API Integration Guide

## 📋 Overview

This guide explains how to configure and use the MiniMax M2 API with the Agente de Código system.

## 🚀 Quick Setup

### 1. Get Your API Key

1. Visit the MiniMax Platform: https://platform.minimaxi.com/
2. Sign in or create an account
3. Navigate to **User Center** → **API Key**
4. Create a new API key (copy it securely)

### 2. Configure Environment Variables

Edit the `.env` file in your project root:

```bash
# Replace with your actual API key
MINIMAX_API_KEY=your-actual-api-key-here
```

### 3. Test the Connection

```bash
# Test MiniMax integration
node scripts/test-minimax-connection.js
```

## ⚙️ Configuration Options

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MINIMAX_API_KEY` | Your MiniMax API key | `eyJhbGciOiJIUzI1NiIs...` |
| `MINIMAX_BASE_URL` | API base URL | `https://api.minimax.chat/v1` |
| `MINIMAX_MODEL` | Default model | `abab6.5s-chat` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MINIMAX_TEMPERATURE` | `0.7` | Controls randomness (0.0-2.0) |
| `MINIMAX_MAX_TOKENS` | `4096` | Maximum response length |
| `MINIMAX_TIMEOUT` | `60000` | Request timeout in ms |

## 🤖 Available Models

| Model | Context Length | Best For |
|-------|----------------|-----------|
| `abab6.5s-chat` | 8k tokens | General conversations |
| `abab6.5-chat` | 8k tokens | General tasks |
| `abab5.5-chat` | 8k tokens | Basic tasks |

## 💻 Usage Examples

### Direct API Usage

```javascript
import { createMiniMaxAdapter } from './packages/orchestrator/src/llm/minimax-adapter.js';

const minimax = createMiniMaxAdapter();

// Simple chat
const response = await minimax.chat('Hello, how are you?');
console.log(response);

// Streaming
for await (const token of minimax.streamChatCompletion([
  { role: 'user', content: 'Tell me a story' }
])) {
  process.stdout.write(token);
}
```

### Through Provider Manager

```javascript
import { llmProviderManager } from './packages/orchestrator/src/llm/llm-provider-manager.js';

// Automatic provider selection
const response = await llmProviderManager.generateCompletion({
  id: 'request-1',
  prompt: 'What is the meaning of life?',
  temperature: 0.7,
  maxTokens: 500
});

console.log(`Provider: ${response.provider}`);
console.log(`Content: ${response.content}`);
```

## 📡 API Endpoint Examples

### Chat Completion

```bash
curl -X POST "https://api.minimax.chat/v1/text/chatcompletion_pro" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "abab6.5s-chat",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "temperature": 0.7,
    "max_tokens": 1024
  }'
```

### Streaming Response

```bash
curl -X POST "https://api.minimax.chat/v1/text/chatcompletion_pro" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "abab6.5s-chat",
    "messages": [
      {"role": "user", "content": "Tell me a joke"}
    ],
    "stream": true
  }'
```

## 🔧 Integration with Agents

### Security Agent

```javascript
// In your security agent configuration
const securityConfig = {
  llmProvider: 'minimax',
  llmModel: 'abab6.5s-chat',
  temperature: 0.2,  // Lower temperature for security
  maxTokens: 2048   // Concise security analysis
};
```

### Quality Agent

```javascript
// In your quality agent configuration
const qualityConfig = {
  llmProvider: 'minimax',
  llmModel: 'abab6.5-chat',
  temperature: 0.5,  // Balanced for code analysis
  maxTokens: 4096   // Detailed quality reports
};
```

### Architecture Agent

```javascript
// In your architecture agent configuration
const archConfig = {
  llmProvider: 'minimax',
  llmModel: 'abab6.5s-chat',
  temperature: 0.3,  // Consistent architectural advice
  maxTokens: 3072   // Comprehensive analysis
};
```

## 🚨 Troubleshooting

### Common Issues

1. **Authentication Failed**
   ```
   Error: Unauthorized - invalid API key
   ```
   - Verify your API key is correct
   - Check if the key has expired
   - Ensure you have sufficient quota

2. **Network Error**
   ```
   Error: Network error - unable to reach MiniMax API
   ```
   - Check your internet connection
   - Verify firewall settings
   - Try again after a few seconds

3. **Rate Limit Exceeded**
   ```
   Error: Rate limit exceeded
   ```
   - Wait a few seconds before retrying
   - Consider upgrading your API plan
   - Implement request queuing

### Health Check

```bash
# Run comprehensive health check
node scripts/test-minimax-connection.js

# Check all LLM providers
curl http://localhost:8080/health
```

## 📊 Monitoring

### Check Usage Statistics

```javascript
import { llmProviderManager } from './packages/orchestrator/src/llm/llm-provider-manager.js';

// Get provider statistics
const stats = llmProviderManager.getProviderStats();
console.log('MiniMax Stats:', stats.minimax);
```

### Real-time Monitoring

```bash
# View system health
curl http://localhost:8080/health/detailed

# View metrics
curl http://localhost:8080/health/metrics
```

## 🔄 Fallback Configuration

The system automatically falls back to other providers if MiniMax is unavailable:

1. **Primary**: MiniMax M2
2. **Fallback 1**: Claude
3. **Fallback 2**: OpenAI
4. **Fallback 3**: GLM

## 💡 Best Practices

1. **API Key Security**
   - Never commit API keys to version control
   - Use environment variables
   - Rotate keys regularly

2. **Performance Optimization**
   - Use streaming for long responses
   - Set appropriate timeout values
   - Implement request queuing

3. **Error Handling**
   - Always check for API errors
   - Implement retry logic
   - Log errors appropriately

4. **Cost Management**
   - Monitor token usage
   - Set reasonable max_tokens limits
   - Use appropriate temperature settings

## 🔗 Additional Resources

- [MiniMax Platform](https://platform.minimaxi.com/)
- [API Documentation](https://platform.minimaxi.com/document/QuickStart)
- [User Guide](https://platform.minimaxi.com/user-center/api-key)
- [Rate Limits](https://platform.minimaxi.com/document/Ratelimit)

---

**Need Help?**
Check the test output: `node scripts/test-minimax-connection.js`
Or open an issue in the repository.