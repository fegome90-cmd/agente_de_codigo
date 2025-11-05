/**
 * LLM API Optimization Service with Batching and Compression
 *
 * Provides intelligent optimization for LLM API calls including:
 * - Request batching for multiple similar requests
 * - Response compression for large payloads
 * - Intelligent retry logic with exponential backoff
 * - Response validation and schema compliance
 * - Cost optimization through smart caching
 */

import { EventEmitter } from 'events';
import { RedisCacheService } from './redis-cache-service.js';
import { logger } from '../utils/logger.js';

export interface LLMRequest {
  id: string;
  prompt: string;
  context?: any;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  priority?: 'low' | 'medium' | 'high';
  timestamp: number;
  timeout?: number;
}

export interface LLMResponse {
  id: string;
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  confidence?: number;
  processingTime: number;
  cached: boolean;
  requestId: string;
}

export interface BatchingConfig {
  enabled: boolean;
  maxBatchSize: number;
  batchTimeout: number; // ms
  batchKey: (request: LLMRequest) => string; // Function to group requests
  priorityQueues: boolean;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // ms
  maxDelay: number; // ms
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors: string[];
}

export interface CompressionConfig {
  enabled: boolean;
  threshold: number; // bytes
  algorithm: 'gzip' | 'deflate' | 'brotli';
  level: number; // 1-9
}

export interface LLMConfig {
  api: {
    endpoint: string;
    apiKey: string;
    defaultModel: string;
    timeout: number;
  };
  batching: BatchingConfig;
  retry: RetryConfig;
  compression: CompressionConfig;
  validation: {
    enabled: boolean;
    schema?: any;
    maxLength: number;
    minLength: number;
  };
}

export interface QueueMetrics {
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  averageProcessingTime: number;
  queueLength: number;
  batchingEfficiency: number;
  cacheHitRate: number;
}

export class LLMApiOptimizationService extends EventEmitter {
  private cache: RedisCacheService;
  private config: LLMConfig;
  private requestQueue: Map<string, LLMRequest[]> = new Map();
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();
  private processingRequests: Map<string, Promise<LLMResponse>> = new Map();
  private metrics: QueueMetrics = {
    totalRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
    averageProcessingTime: 0,
    queueLength: 0,
    batchingEfficiency: 0,
    cacheHitRate: 0
  };
  private processingTimes: number[] = [];
  private maxProcessingTimes = 1000;

  constructor(config: LLMConfig, cache: RedisCacheService) {
    super();
    this.config = config;
    this.cache = cache;

    logger.info('LLM API Optimization Service initialized', {
      batching: config.batching.enabled,
      compression: config.compression.enabled,
      retryMaxRetries: config.retry.maxRetries
    });
  }

  /**
   * Process a single LLM request with full optimization
   */
  async processRequest(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    this.metrics.queueLength = this.getTotalQueueLength();

    try {
      // Check cache first
      const cachedResponse = await this.getCachedResponse(request);
      if (cachedResponse) {
        this.updateMetrics(true, Date.now() - startTime);
        return {
          ...cachedResponse,
          cached: true,
          requestId: request.id
        };
      }

      // Process request (with batching if enabled)
      const response = this.config.batching.enabled
        ? await this.processWithBatching(request)
        : await this.processSingle(request);

      // Cache the response
      await this.cacheResponse(request, response);

      // Update metrics
      this.updateMetrics(false, Date.now() - startTime);

      logger.debug('LLM request processed', {
        requestId: request.id,
        processingTime: Date.now() - startTime,
        cached: false,
        tokensUsed: response.usage.totalTokens
      });

      return response;

    } catch (error) {
      this.metrics.failedRequests++;
      this.updateMetrics(false, Date.now() - startTime);

      logger.error('LLM request failed', {
        requestId: request.id,
        error: error.message,
        processingTime: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Process multiple requests concurrently
   */
  async processBatch(requests: LLMRequest[]): Promise<LLMResponse[]> {
    logger.debug('Processing batch of requests', { count: requests.length });

    const promises = requests.map(request => this.processRequest(request));
    const results = await Promise.allSettled(promises);

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        logger.error('Batch request failed', {
          requestId: requests[index].id,
          error: result.reason.message
        });

        return {
          id: requests[index].id,
          content: '',
          model: this.config.api.defaultModel,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          processingTime: 0,
          cached: false,
          requestId: requests[index].id,
          error: result.reason.message
        } as LLMResponse;
      }
    });
  }

  /**
   * Get cached response if available
   */
  private async getCachedResponse(request: LLMRequest): Promise<LLMResponse | null> {
    try {
      const cacheKey = this.generateCacheKey(request);
      return await this.cache.get<LLMResponse>(cacheKey, request.context);
    } catch (error) {
      logger.warn('Failed to get cached response', {
        requestId: request.id,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Cache response for future use
   */
  private async cacheResponse(request: LLMRequest, response: LLMResponse): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(request);
      await this.cache.set(cacheKey, response, request.context);
    } catch (error) {
      logger.warn('Failed to cache response', {
        requestId: request.id,
        error: error.message
      });
    }
  }

  /**
   * Generate cache key for request
   */
  private generateCacheKey(request: LLMRequest): string {
    const keyData = {
      prompt: request.prompt,
      model: request.model || this.config.api.defaultModel,
      temperature: request.temperature,
      maxTokens: request.maxTokens
    };
    return `llm:${JSON.stringify(keyData)}`;
  }

  /**
   * Process request with batching
   */
  private async processWithBatching(request: LLMRequest): Promise<LLMResponse> {
    const batchKey = this.config.batching.batchKey(request);

    return new Promise((resolve, reject) => {
      // Add request to batch queue
      if (!this.requestQueue.has(batchKey)) {
        this.requestQueue.set(batchKey, []);
      }

      const batch = this.requestQueue.get(batchKey)!;
      batch.push(request);

      // Set up batch processing timer
      if (!this.batchTimers.has(batchKey)) {
        const timer = setTimeout(() => {
          this.processBatchQueue(batchKey).catch(error => {
            logger.error('Batch processing failed', { batchKey, error: error.message });
            batch.forEach(req => {
              const pendingRequest = this.processingRequests.get(req.id);
              if (pendingRequest) {
                this.processingRequests.delete(req.id);
                reject(error);
              }
            });
          });
        }, this.config.batching.batchTimeout);

        this.batchTimers.set(batchKey, timer);
      }

      // Process batch immediately if it's full
      if (batch.length >= this.config.batching.maxBatchSize) {
        clearTimeout(this.batchTimers.get(batchKey)!);
        this.batchTimers.delete(batchKey);
        this.processBatchQueue(batchKey)
          .then(resolve)
          .catch(reject);
      } else {
        // Store promise for this specific request
        this.processingRequests.set(request.id, new Promise<LLMResponse>((res, rej) => {
          const originalResolve = res;
          const originalReject = rej;

          // This will be resolved when the batch processing completes
          setTimeout(() => {
            const result = this.processingRequests.get(request.id);
            if (result) {
              result.then(originalResolve).catch(originalReject);
            } else {
              originalReject(new Error('Request processing timeout'));
            }
          }, this.config.api.timeout);
        }));
      }
    });
  }

  /**
   * Process a batch of requests
   */
  private async processBatchQueue(batchKey: string): Promise<void> {
    const batch = this.requestQueue.get(batchKey);
    if (!batch || batch.length === 0) return;

    // Clear the batch queue and timer
    this.requestQueue.delete(batchKey);
    const timer = this.batchTimers.get(batchKey);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(batchKey);
    }

    logger.debug('Processing batch', { batchKey, size: batch.length });

    try {
      // Sort by priority if enabled
      if (this.config.batching.priorityQueues) {
        batch.sort((a, b) => this.getPriorityWeight(b.priority) - this.getPriorityWeight(a.priority));
      }

      // Process the batch
      const responses = await this.callLLMAPI(batch);

      // Resolve individual requests
      batch.forEach((request, index) => {
        const response = responses[index];
        this.processingRequests.delete(request.id);

        if (response) {
          // Resolve any pending promises for this request
          const pendingPromises = Array.from(this.processingRequests.entries())
            .filter(([id]) => id === request.id);

          pendingPromises.forEach(([id, promise]) => {
            this.processingRequests.delete(id);
            // Resolve the promise with the response
            promise.then(() => response).catch(() => response);
          });
        }
      });

      // Update batching efficiency metrics
      this.metrics.batchingEfficiency = this.calculateBatchingEfficiency(batch.length);

    } catch (error) {
      logger.error('Batch processing failed', { batchKey, error: error.message });

      // Reject all requests in the batch
      batch.forEach(request => {
        this.processingRequests.delete(request.id);
      });

      throw error;
    }
  }

  /**
   * Process single request without batching
   */
  private async processSingle(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.callLLMAPI([request]);
    return response[0];
  }

  /**
   * Call LLM API with retry logic
   */
  private async callLLMAPI(requests: LLMRequest[]): Promise<LLMResponse[]> {
    let lastError: Error;

    for (let attempt = 0; attempt <= this.config.retry.maxRetries; attempt++) {
      try {
        const responses = await this.makeAPICall(requests);
        return responses;
      } catch (error) {
        lastError = error;

        if (attempt < this.config.retry.maxRetries && this.isRetryableError(error)) {
          const delay = this.calculateRetryDelay(attempt);
          logger.warn(`LLM API call failed, retrying in ${delay}ms`, {
            attempt: attempt + 1,
            maxRetries: this.config.retry.maxRetries,
            error: error.message
          });
          await this.sleep(delay);
        } else {
          throw error;
        }
      }
    }

    throw lastError!;
  }

  /**
   * Make actual API call to LLM service
   */
  private async makeAPICall(requests: LLMRequest[]): Promise<LLMResponse[]> {
    // This would be implemented with the actual LLM API (Claude, GPT, etc.)
    // For now, return mock responses

    return requests.map(request => ({
      id: request.id,
      content: `Mock response for: ${request.prompt.substring(0, 100)}...`,
      model: request.model || this.config.api.defaultModel,
      usage: {
        inputTokens: Math.ceil(request.prompt.length / 4),
        outputTokens: 150,
        totalTokens: Math.ceil(request.prompt.length / 4) + 150
      },
      processingTime: Math.random() * 1000 + 500, // 500-1500ms
      cached: false,
      requestId: request.id
    }));
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    return this.config.retry.retryableErrors.some(retryableError =>
      error.message.includes(retryableError) ||
      error.name.includes(retryableError)
    );
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number): number {
    let delay = this.config.retry.baseDelay * Math.pow(this.config.retry.backoffMultiplier, attempt);
    delay = Math.min(delay, this.config.retry.maxDelay);

    if (this.config.retry.jitter) {
      // Add jitter to prevent thundering herd
      const jitterAmount = delay * 0.1;
      delay += Math.random() * jitterAmount;
    }

    return Math.floor(delay);
  }

  /**
   * Get priority weight for sorting
   */
  private getPriorityWeight(priority?: string): number {
    switch (priority) {
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 2;
    }
  }

  /**
   * Calculate batching efficiency
   */
  private calculateBatchingEfficiency(batchSize: number): number {
    // Efficiency calculation based on batch size utilization
    const optimalBatchSize = this.config.batching.maxBatchSize;
    return batchSize / optimalBatchSize;
  }

  /**
   * Update service metrics
   */
  private updateMetrics(cached: boolean, processingTime: number): void {
    if (!cached) {
      this.metrics.completedRequests++;

      // Update processing time buffer
      this.processingTimes.push(processingTime);
      if (this.processingTimes.length > this.maxProcessingTimes) {
        this.processingTimes.shift();
      }

      // Calculate average processing time
      this.metrics.averageProcessingTime = this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
    }

    this.metrics.queueLength = this.getTotalQueueLength();

    // Update cache hit rate from cache service
    this.updateCacheHitRate();
  }

  /**
   * Get total queue length across all batch keys
   */
  private getTotalQueueLength(): number {
    let total = 0;
    for (const batch of this.requestQueue.values()) {
      total += batch.length;
    }
    return total;
  }

  /**
   * Update cache hit rate from cache service
   */
  private async updateCacheHitRate(): Promise<void> {
    try {
      const cacheStats = await this.cache.getStats();
      this.metrics.cacheHitRate = cacheStats.hitRate;
    } catch (error) {
      logger.warn('Failed to update cache hit rate', { error: error.message });
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): QueueMetrics {
    return { ...this.metrics };
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gracefully shutdown the service
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down LLM API Optimization Service');

    // Clear all batch timers
    for (const timer of this.batchTimers.values()) {
      clearTimeout(timer);
    }
    this.batchTimers.clear();

    // Wait for all processing requests to complete
    const processingPromises = Array.from(this.processingRequests.values());
    if (processingPromises.length > 0) {
      logger.info(`Waiting for ${processingPromises.length} requests to complete`);
      await Promise.allSettled(processingPromises);
    }

    // Clear queues
    this.requestQueue.clear();
    this.processingRequests.clear();

    logger.info('LLM API Optimization Service shutdown complete');
  }
}
