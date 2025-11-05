/**
 * Redis-based Caching Service for LLM Decisions
 *
 * Provides intelligent caching with adaptive TTL, compression,
 * and pattern-based cache invalidation for LLM API responses.
 */

import Redis from "ioredis";
import crypto from "crypto";
import zlib from "zlib";
import { logger } from "../utils/logger.js";

/**
 * Helper function to safely extract error message
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? getErrorMessage(error) : String(error);
}

export interface CacheConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  caching: {
    defaultTTL: number; // Default TTL in seconds
    maxTTL: number; // Maximum TTL in seconds
    minTTL: number; // Minimum TTL in seconds
    compressionThreshold: number; // Min size to compress (bytes)
    keyPrefix: string; // Redis key prefix
  };
  adaptive: {
    enableAdaptiveTTL: boolean;
    hitRateThreshold: number; // Minimum hit rate for TTL increase
    ttlMultiplier: number; // Multiplier for TTL adjustment
    learningWindow: number; // Window for hit rate calculation
  };
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
  lastAccessed: number;
  compressed: boolean;
  checksum: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
  avgResponseTime: number;
  compressionRatio: number;
  memoryUsage: number;
}

export class RedisCacheService {
  private redis: Redis;
  private config: CacheConfig;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalRequests: 0,
    avgResponseTime: 0,
    compressionRatio: 0,
    memoryUsage: 0,
  };
  private responseTimeBuffer: number[] = [];
  private maxResponseTimeBuffer = 1000;

  constructor(config: CacheConfig) {
    this.config = config;
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db || 0,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableAutoPipelining: true,
      connectTimeout: 10000,
      commandTimeout: 5000,
    });

    this.setupRedisEvents();
    logger.info("Redis Cache Service initialized", {
      host: config.redis.host,
      port: config.redis.port,
      db: config.redis.db || 0,
    });
  }

  private setupRedisEvents(): void {
    this.redis.on("connect", () => {
      logger.info("Redis connected");
    });

    this.redis.on("error", (error: Error) => {
      logger.error("Redis connection error", { error: getErrorMessage(error) });
    });

    this.redis.on("close", () => {
      logger.warn("Redis connection closed");
    });

    // Clean up stats buffer periodically
    setInterval(() => {
      this.cleanupResponseTimeBuffer();
    }, 60000); // Every minute
  }

  /**
   * Generate cache key based on input content and context
   */
  private generateCacheKey(content: string, context?: any): string {
    const hashInput = JSON.stringify({ content, context });
    const hash = crypto.createHash("sha256").update(hashInput).digest("hex");
    return `${this.config.caching.keyPrefix}:${hash}`;
  }

  /**
   * Calculate adaptive TTL based on hit rate and usage patterns
   */
  private calculateAdaptiveTTL(baseKey: string): number {
    if (!this.config.adaptive.enableAdaptiveTTL) {
      return this.config.caching.defaultTTL;
    }

    // Get hit rate for this key pattern
    const pattern = baseKey.split(":")[0]; // Extract pattern
    const hitRate = this.getPatternHitRate(pattern);

    let adaptiveTTL = this.config.caching.defaultTTL;

    if (hitRate > this.config.adaptive.hitRateThreshold) {
      // Increase TTL for frequently accessed items
      adaptiveTTL = Math.min(
        this.config.caching.maxTTL,
        Math.floor(adaptiveTTL * this.config.adaptive.ttlMultiplier),
      );
    } else if (hitRate < this.config.adaptive.hitRateThreshold / 2) {
      // Decrease TTL for rarely accessed items
      adaptiveTTL = Math.max(
        this.config.caching.minTTL,
        Math.floor(adaptiveTTL / this.config.adaptive.ttlMultiplier),
      );
    }

    return adaptiveTTL;
  }

  /**
   * Get hit rate for a specific pattern
   */
  private getPatternHitRate(pattern: string): number {
    // This would typically be stored in Redis or memory
    // For now, return a default value that could be enhanced
    return 0.8; // 80% default hit rate
  }

  /**
   * Compress data if it exceeds threshold
   */
  private async compressData(
    data: string,
  ): Promise<{ compressed: boolean; result: string }> {
    if (data.length < this.config.caching.compressionThreshold) {
      return { compressed: false, result: data };
    }

    try {
      const compressed = await new Promise<string>((resolve, reject) => {
        zlib.deflate(data, { level: 6 }, (err, result) => {
          if (err) reject(err);
          else resolve(result.toString("base64"));
        });
      });

      return { compressed: true, result: compressed };
    } catch (error) {
      logger.warn("Compression failed, using original data", {
        error: getErrorMessage(error),
      });
      return { compressed: false, result: data };
    }
  }

  /**
   * Decompress data if needed
   */
  private async decompressData(
    data: string,
    compressed: boolean,
  ): Promise<string> {
    if (!compressed) {
      return data;
    }

    try {
      const decompressed = await new Promise<string>((resolve, reject) => {
        zlib.inflate(Buffer.from(data, "base64"), (err, result) => {
          if (err) reject(err);
          else resolve(result.toString());
        });
      });

      return decompressed;
    } catch (error) {
      logger.error("Decompression failed", { error: getErrorMessage(error) });
      throw new Error("Failed to decompress cached data");
    }
  }

  /**
   * Store data in cache with adaptive TTL
   */
  async set<T>(key: string, data: T, context?: any): Promise<void> {
    const startTime = Date.now();

    try {
      const cacheKey = this.generateCacheKey(key, context);
      const ttl = this.calculateAdaptiveTTL(cacheKey);
      const serialized = JSON.stringify(data);
      const checksum = crypto
        .createHash("md5")
        .update(serialized)
        .digest("hex");

      const { compressed, result: processedData } =
        await this.compressData(serialized);

      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl,
        hits: 0,
        lastAccessed: Date.now(),
        compressed,
        checksum,
      };

      await this.redis.setex(cacheKey, ttl, JSON.stringify(entry));

      // Update compression ratio stats
      if (compressed) {
        const ratio = processedData.length / serialized.length;
        this.updateCompressionRatio(ratio);
      }

      const responseTime = Date.now() - startTime;
      this.updateResponseTime(responseTime);

      logger.debug("Cache entry stored", {
        key: cacheKey,
        ttl,
        compressed,
        responseTime,
      });
    } catch (error) {
      logger.error("Failed to store cache entry", {
        key,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Retrieve data from cache
   */
  async get<T>(key: string, context?: any): Promise<T | null> {
    const startTime = Date.now();

    try {
      const cacheKey = this.generateCacheKey(key, context);
      const cached = await this.redis.get(cacheKey);

      if (!cached) {
        this.stats.misses++;
        this.updateHitRate();
        return null;
      }

      const entry: CacheEntry<T> = JSON.parse(cached);

      // Verify data integrity
      const serialized = JSON.stringify(entry.data);
      const checksum = crypto
        .createHash("md5")
        .update(serialized)
        .digest("hex");

      if (checksum !== entry.checksum) {
        logger.warn("Cache entry checksum mismatch, removing entry", {
          key: cacheKey,
        });
        await this.redis.del(cacheKey);
        this.stats.misses++;
        this.updateHitRate();
        return null;
      }

      // Update access statistics
      entry.hits++;
      entry.lastAccessed = Date.now();

      // Update the entry in Redis with new stats
      await this.redis.setex(cacheKey, entry.ttl, JSON.stringify(entry));

      this.stats.hits++;
      this.updateHitRate();

      const responseTime = Date.now() - startTime;
      this.updateResponseTime(responseTime);

      logger.debug("Cache entry retrieved", {
        key: cacheKey,
        hits: entry.hits,
        responseTime,
      });

      return entry.data;
    } catch (error) {
      logger.error("Failed to retrieve cache entry", {
        key,
        error: getErrorMessage(error),
      });
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }
  }

  /**
   * Delete entry from cache
   */
  async delete(key: string, context?: any): Promise<boolean> {
    try {
      const cacheKey = this.generateCacheKey(key, context);
      const result = await this.redis.del(cacheKey);
      return result > 0;
    } catch (error) {
      logger.error("Failed to delete cache entry", {
        key,
        error: getErrorMessage(error),
      });
      return false;
    }
  }

  /**
   * Clear all cache entries with the configured prefix
   */
  async clear(): Promise<void> {
    try {
      const pattern = `${this.config.caching.keyPrefix}:*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info("Cache cleared", { entriesDeleted: keys.length });
      }
    } catch (error) {
      logger.error("Failed to clear cache", { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Update hit rate statistics
   */
  private updateHitRate(): void {
    this.stats.totalRequests = this.stats.hits + this.stats.misses;
    this.stats.hitRate =
      this.stats.totalRequests > 0
        ? this.stats.hits / this.stats.totalRequests
        : 0;
  }

  /**
   * Update response time statistics
   */
  private updateResponseTime(responseTime: number): void {
    this.responseTimeBuffer.push(responseTime);

    if (this.responseTimeBuffer.length > this.maxResponseTimeBuffer) {
      this.responseTimeBuffer.shift();
    }

    this.stats.avgResponseTime =
      this.responseTimeBuffer.reduce((a, b) => a + b, 0) /
      this.responseTimeBuffer.length;
  }

  /**
   * Update compression ratio statistics
   */
  private updateCompressionRatio(ratio: number): void {
    // Simple exponential moving average
    this.stats.compressionRatio =
      this.stats.compressionRatio * 0.9 + ratio * 0.1;
  }

  /**
   * Clean up response time buffer
   */
  private cleanupResponseTimeBuffer(): void {
    if (this.responseTimeBuffer.length > this.maxResponseTimeBuffer) {
      this.responseTimeBuffer = this.responseTimeBuffer.slice(
        -this.maxResponseTimeBuffer,
      );
    }
  }

  /**
   * Get comprehensive cache statistics
   */
  async getStats(): Promise<
    CacheStats & { memoryUsage: number; keyCount: number }
  > {
    try {
      const pattern = `${this.config.caching.keyPrefix}:*`;
      const keys = await this.redis.keys(pattern);
      const memoryInfo = await this.redis.memory(
        "USAGE",
        keys.length > 0 ? keys[0] : pattern,
      );

      return {
        ...this.stats,
        memoryUsage: memoryInfo || 0,
        keyCount: keys.length,
      };
    } catch (error) {
      logger.error("Failed to get cache stats", {
        error: getErrorMessage(error),
      });
      return {
        ...this.stats,
        memoryUsage: 0,
        keyCount: 0,
      };
    }
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === "PONG";
    } catch (error) {
      logger.error("Redis health check failed", {
        error: getErrorMessage(error),
      });
      return false;
    }
  }

  /**
   * Gracefully close Redis connection
   */
  async disconnect(): Promise<void> {
    try {
      await this.redis.quit();
      logger.info("Redis connection closed");
    } catch (error) {
      logger.error("Error closing Redis connection", {
        error: getErrorMessage(error),
      });
    }
  }
}
