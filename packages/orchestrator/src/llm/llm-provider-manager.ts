/**
 * LLM Provider Manager
 * Manages multiple LLM providers including MiniMax M2, Claude, and others
 * Provides fallback mechanisms and intelligent provider selection
 */

import { EventEmitter } from 'events';
import { createMiniMaxAdapter, MiniMaxAdapter } from './minimax-adapter.js';
import { logger } from '../utils/logger.js';

export interface LLMProvider {
  name: string;
  available: boolean;
  priority: number;
  costPerToken: number;
  maxTokens: number;
  supportsStreaming: boolean;
  supportsFunctions: boolean;
}

export interface LLMRequest {
  id: string;
  prompt: string;
  context?: any;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  provider?: string;
}

export interface LLMResponse {
  id: string;
  content: string;
  provider: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  processingTime: number;
  cached: boolean;
}

export interface ProviderConfig {
  name: string;
  enabled: boolean;
  apiKey: string;
  baseURL?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  priority?: number;
}

export class LLMProviderManager extends EventEmitter {
  private providers: Map<string, any> = new Map();
  private defaultProvider: string = 'minimax';
  private fallbackProviders: string[] = ['claude', 'openai', 'glm'];
  private providerStats: Map<string, any> = new Map();

  constructor() {
    super();
    this.initializeProviders();
  }

  /**
   * Initialize all available LLM providers
   */
  private initializeProviders(): void {
    // MiniMax M2 Provider
    if (process.env.MINIMAX_API_KEY) {
      try {
        const minimax = createMiniMaxAdapter();
        this.providers.set('minimax', minimax);
        this.providerStats.set('minimax', {
          name: 'MiniMax M2',
          available: true,
          priority: 1,
          costPerToken: 0.0001,
          maxTokens: 4096,
          supportsStreaming: true,
          supportsFunctions: false,
          totalRequests: 0,
          totalTokens: 0,
          totalErrors: 0,
          lastUsed: null,
        });
        logger.info('MiniMax M2 provider initialized');
      } catch (error) {
        logger.error('Failed to initialize MiniMax provider:', error);
      }
    }

    // Claude Provider
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        // Note: You would need to implement ClaudeAdapter similar to MiniMaxAdapter
        // this.providers.set('claude', new ClaudeAdapter({...}));
        this.providerStats.set('claude', {
          name: 'Claude',
          available: true,
          priority: 2,
          costPerToken: 0.00015,
          maxTokens: 8192,
          supportsStreaming: true,
          supportsFunctions: true,
          totalRequests: 0,
          totalTokens: 0,
          totalErrors: 0,
          lastUsed: null,
        });
        logger.info('Claude provider initialized');
      } catch (error) {
        logger.error('Failed to initialize Claude provider:', error);
      }
    }

    // GLM Provider
    if (process.env.GLM_API_KEY) {
      try {
        // Note: You would need to implement GLMAdapter similar to MiniMaxAdapter
        // this.providers.set('glm', new GLMAdapter({...}));
        this.providerStats.set('glm', {
          name: 'GLM',
          available: true,
          priority: 3,
          costPerToken: 0.00008,
          maxTokens: 2048,
          supportsStreaming: false,
          supportsFunctions: false,
          totalRequests: 0,
          totalTokens: 0,
          totalErrors: 0,
          lastUsed: null,
        });
        logger.info('GLM provider initialized');
      } catch (error) {
        logger.error('Failed to initialize GLM provider:', error);
      }
    }

    logger.info(`Initialized ${this.providers.size} LLM providers`);
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): LLMProvider[] {
    return Array.from(this.providerStats.entries())
      .map(([key, stats]) => ({
        name: stats.name,
        available: stats.available,
        priority: stats.priority,
        costPerToken: stats.costPerToken,
        maxTokens: stats.maxTokens,
        supportsStreaming: stats.supportsStreaming,
        supportsFunctions: stats.supportsFunctions,
      }))
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Select best provider for request
   */
  selectProvider(request: LLMRequest): string {
    // If specific provider requested and available
    if (request.provider && this.providers.has(request.provider)) {
      return request.provider;
    }

    // Select based on priority and availability
    const availableProviders = this.getAvailableProviders()
      .filter(p => p.available)
      .filter(p => {
        // Check if provider supports requested features
        if (request.stream && !p.supportsStreaming) return false;
        if (request.maxTokens && p.maxTokens < request.maxTokens) return false;
        return true;
      });

    if (availableProviders.length === 0) {
      throw new Error('No suitable LLM provider available');
    }

    // Select highest priority provider
    return availableProviders[0].name.toLowerCase();
  }

  /**
   * Generate text completion
   */
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const providerName = this.selectProvider(request);
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider ${providerName} not available`);
    }

    try {
      this.updateProviderStats(providerName, 'request');

      let content: string;
      let usage: any;

      if (providerName === 'minimax') {
        const minimaxProvider = provider as MiniMaxAdapter;

        if (request.stream) {
          // Handle streaming
          let fullContent = '';
          for await (const token of minimaxProvider.streamChatCompletion([
            { role: 'user', content: request.prompt }
          ], {
            temperature: request.temperature,
            maxTokens: request.maxTokens,
          })) {
            fullContent += token;
          }
          content = fullContent;
        } else {
          // Handle non-streaming
          const response = await minimaxProvider.chatCompletion([
            { role: 'user', content: request.prompt }
          ], {
            temperature: request.temperature,
            maxTokens: request.maxTokens,
          });

          content = response.choices[0]?.message?.content || '';
          usage = {
            inputTokens: response.usage?.prompt_tokens || 0,
            outputTokens: response.usage?.completion_tokens || 0,
            totalTokens: response.usage?.total_tokens || 0,
          };
        }
      } else {
        // Handle other providers (you would implement similar logic for Claude, GLM, etc.)
        throw new Error(`Provider ${providerName} not implemented yet`);
      }

      const processingTime = Date.now() - startTime;

      this.updateProviderStats(providerName, 'success', usage?.totalTokens || 0);

      const response: LLMResponse = {
        id: request.id,
        content,
        provider: providerName,
        model: request.model || this.getDefaultModel(providerName),
        usage,
        processingTime,
        cached: false,
      };

      this.emit('completion', response);
      return response;

    } catch (error) {
      this.updateProviderStats(providerName, 'error');
      this.emit('error', { provider: providerName, error, request });

      // Try fallback providers
      if (this.fallbackProviders.length > 0) {
        logger.warn(`Provider ${providerName} failed, trying fallback...`);
        return this.tryFallbackProviders(request, providerName);
      }

      throw error;
    }
  }

  /**
   * Try fallback providers
   */
  private async tryFallbackProviders(request: LLMRequest, failedProvider: string): Promise<LLMResponse> {
    for (const fallbackName of this.fallbackProviders) {
      if (fallbackName === failedProvider) continue;
      if (!this.providers.has(fallbackName)) continue;

      try {
        logger.info(`Trying fallback provider: ${fallbackName}`);
        const fallbackRequest = { ...request, provider: fallbackName };
        return await this.generateCompletion(fallbackRequest);
      } catch (fallbackError) {
        logger.warn(`Fallback provider ${fallbackName} also failed:`, fallbackError);
        continue;
      }
    }

    throw new Error(`All providers failed. Primary: ${failedProvider}, Fallbacks: ${this.fallbackProviders.join(', ')}`);
  }

  /**
   * Update provider statistics
   */
  private updateProviderStats(providerName: string, type: 'request' | 'success' | 'error', tokens?: number): void {
    const stats = this.providerStats.get(providerName);
    if (!stats) return;

    stats.lastUsed = new Date();

    if (type === 'request') {
      stats.totalRequests++;
    } else if (type === 'success') {
      if (tokens) stats.totalTokens += tokens;
    } else if (type === 'error') {
      stats.totalErrors++;
    }
  }

  /**
   * Get default model for provider
   */
  private getDefaultModel(providerName: string): string {
    switch (providerName) {
      case 'minimax':
        return process.env.MINIMAX_MODEL || 'abab6.5s-chat';
      case 'claude':
        return 'claude-3-sonnet-20240229';
      case 'glm':
        return 'glm-4';
      default:
        return 'default';
    }
  }

  /**
   * Get provider statistics
   */
  getProviderStats(): any {
    const stats: any = {};
    for (const [name, providerStats] of this.providerStats) {
      stats[name] = { ...providerStats };
    }
    return stats;
  }

  /**
   * Health check all providers
   */
  async healthCheck(): Promise<{ [key: string]: boolean }> {
    const results: { [key: string]: boolean } = {};

    for (const [name, provider] of this.providers) {
      try {
        if (name === 'minimax') {
          const minimaxProvider = provider as MiniMaxAdapter;
          results[name] = await minimaxProvider.validateConnection();
        } else {
          // Implement health checks for other providers
          results[name] = true; // Placeholder
        }
      } catch (error) {
        logger.error(`Health check failed for provider ${name}:`, error);
        results[name] = false;
      }
    }

    return results;
  }

  /**
   * Reset provider statistics
   */
  resetStats(): void {
    for (const stats of this.providerStats.values()) {
      stats.totalRequests = 0;
      stats.totalTokens = 0;
      stats.totalErrors = 0;
      stats.lastUsed = null;
    }
    this.emit('stats-reset');
  }
}

// Export singleton instance
export const llmProviderManager = new LLMProviderManager();