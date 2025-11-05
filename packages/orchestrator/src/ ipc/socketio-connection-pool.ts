/**
 * Socket.IO Connection Pool Manager
 *
 * Provides efficient connection pooling for Socket.IO IPC communication:
 * - Connection pooling and reuse
 * - Load balancing across multiple connections
 * - Connection health monitoring and recovery
 * - Automatic reconnection with exponential backoff
 * - Performance metrics and optimization
 */

import { EventEmitter } from "events";
import { Server as SocketIOServer, Socket as SocketIOSocket } from "socket.io";
import { createPool, Pool } from "generic-pool";
import type { PoolConfig } from "generic-pool";
import { io, Socket } from "socket.io-client";
import { logger } from "../utils/logger.js";

export interface ConnectionConfig {
  host: string;
  port: number;
  path?: string;
  secure?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  timeout?: number;
}

export interface PoolConfig {
  min: number;
  max: number;
  acquireTimeoutMillis?: number;
  createTimeoutMillis?: number;
  destroyTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  reapIntervalMillis?: number;
  createRetryIntervalMillis?: number;
}

export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  averageResponseTime: number;
  connectionErrors: number;
  reconnections: number;
  throughput: number;
  poolUtilization: number;
}

export interface SocketConnection {
  id: string;
  socket: Socket;
  created: number;
  lastUsed: number;
  isHealthy: boolean;
  usageCount: number;
  lastError?: Error;
}

export interface ConnectionPoolManagerConfig {
  connections: ConnectionConfig[];
  pool: PoolConfig;
  health: {
    checkInterval: number;
    maxIdleTime: number;
    maxErrors: number;
    reconnectBackoffMultiplier: number;
    maxReconnectDelay: number;
  };
  performance: {
    enableMetrics: boolean;
    metricsInterval: number;
    slowQueryThreshold: number;
  };
  reconnectDelay?: number;
  reconnectAttempts?: number;
}

export class SocketIOConnectionPool extends EventEmitter {
  private config: ConnectionPoolManagerConfig;
  private pools: Map<string, Pool<SocketConnection>> = new Map();
  private metrics: ConnectionMetrics;
  private healthCheckInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;
  private responseTimeBuffer: number[] = [];
  private maxResponseTimeBuffer = 1000;
  private isShuttingDown = false;

  constructor(config: ConnectionPoolManagerConfig) {
    super();
    this.config = config;
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingRequests: 0,
      averageResponseTime: 0,
      connectionErrors: 0,
      reconnections: 0,
      throughput: 0,
      poolUtilization: 0,
    };

    this.initializePools();
    this.startHealthChecking();
    this.startMetricsCollection();

    logger.info("Socket.IO Connection Pool initialized", {
      poolSize: `${config.pool.min}-${config.pool.max}`,
      connectionCount: config.connections.length,
    });
  }

  /**
   * Initialize connection pools for each configured connection
   */
  private initializePools(): void {
    this.config.connections.forEach((connectionConfig) => {
      const poolId = this.generatePoolId(connectionConfig);
      const pool = this.createPool(connectionConfig);
      this.pools.set(poolId, pool);
    });
  }

  /**
   * Create a connection pool for a specific connection configuration
   */
  private createPool(
    connectionConfig: ConnectionConfig,
  ): Pool<SocketConnection> {
    const poolConfig: PoolConfig = {
      min: this.config.pool.min,
      max: this.config.pool.max,
      acquireTimeoutMillis: this.config.pool.acquireTimeoutMillis || 30000,
      createTimeoutMillis: this.config.pool.createTimeoutMillis || 30000,
      destroyTimeoutMillis: this.config.pool.destroyTimeoutMillis || 5000,
      idleTimeoutMillis: this.config.pool.idleTimeoutMillis || 30000,
      reapIntervalMillis: this.config.pool.reapIntervalMillis || 1000,
      createRetryIntervalMillis:
        this.config.pool.createRetryIntervalMillis || 200,
    };

    const pool = createPool<SocketConnection>(
      {
        create: async () => {
          return this.createConnection(connectionConfig);
        },
        destroy: async (connection: SocketConnection) => {
          return this.destroyConnection(connection);
        },
        validate: async (connection: SocketConnection) => {
          return this.validateConnection(connection);
        },
      },
      poolConfig,
    );

    // Set up pool event listeners
    pool.on("acquire", (connection: SocketConnection) => {
      connection.lastUsed = Date.now();
      connection.usageCount++;
      this.metrics.activeConnections++;
      this.metrics.idleConnections--;
    });

    pool.on("release", (connection: SocketConnection) => {
      this.metrics.activeConnections--;
      this.metrics.idleConnections++;
    });

    pool.on("destroy", (connection: SocketConnection) => {
      this.metrics.totalConnections--;
      if (connection.socket.connected) {
        this.metrics.activeConnections--;
      } else {
        this.metrics.idleConnections--;
      }
    });

    return pool;
  }

  /**
   * Create a new Socket.IO connection
   */
  private async createConnection(
    config: ConnectionConfig,
  ): Promise<SocketConnection> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const socketOptions = {
        host: config.host,
        port: config.port,
        path: config.path || "/socket.io",
        secure: config.secure || false,
        timeout: config.timeout || 10000,
        reconnection: false, // We handle reconnection at pool level
        transports: ["websocket", "polling"],
      };

      const socket = io(socketOptions);
      const connectionId = this.generateConnectionId();

      const connection: SocketConnection = {
        id: connectionId,
        socket,
        created: Date.now(),
        lastUsed: Date.now(),
        isHealthy: false,
        usageCount: 0,
      };

      const connectionTimeout = setTimeout(() => {
        socket.disconnect();
        reject(new Error("Connection timeout"));
      }, config.timeout || 10000);

      socket.on("connect", () => {
        clearTimeout(connectionTimeout);
        connection.isHealthy = true;
        this.metrics.totalConnections++;
        this.metrics.idleConnections++;

        const connectionTime = Date.now() - startTime;
        logger.debug("Socket connection created", {
          connectionId,
          host: config.host,
          port: config.port,
          connectionTime,
        });

        resolve(connection);
      });

      socket.on("connect_error", (error) => {
        clearTimeout(connectionTimeout);
        connection.lastError = error;
        this.metrics.connectionErrors++;

        logger.error("Socket connection failed", {
          connectionId,
          host: config.host,
          port: config.port,
          error: (error instanceof Error ? error.message : String(error)),
        });

        reject(error);
      });

      // Set up health monitoring for this connection
      this.setupConnectionHealthMonitoring(connection, config);
    });
  }

  /**
   * Destroy a Socket.IO connection
   */
  private async destroyConnection(connection: SocketConnection): Promise<void> {
    try {
      if (connection.socket.connected) {
        connection.socket.disconnect();
      }

      logger.debug("Socket connection destroyed", {
        connectionId: connection.id,
        usageCount: connection.usageCount,
        lifetime: Date.now() - connection.created,
      });
    } catch (error) {
      logger.warn("Error destroying connection", {
        connectionId: connection.id,
        error: (error instanceof Error ? error.message : String(error)),
      });
    }
  }

  /**
   * Validate a connection is healthy and ready for use
   */
  private async validateConnection(
    connection: SocketConnection,
  ): Promise<boolean> {
    try {
      // Check if socket is connected
      if (!connection.socket.connected) {
        return false;
      }

      // Check last error (if recent error, mark as unhealthy)
      if (
        connection.lastError &&
        Date.now() - connection.lastError.getTime() < 60000
      ) {
        // 1 minute
        return false;
      }

      // Check maximum idle time
      const idleTime = Date.now() - connection.lastUsed;
      if (idleTime > this.config.health.maxIdleTime) {
        return false;
      }

      // Check error count
      if (
        connection.usageCount > 0 &&
        this.metrics.connectionErrors / connection.usageCount >
          this.config.health.maxErrors
      ) {
        return false;
      }

      connection.isHealthy = true;
      return true;
    } catch (error) {
      logger.warn("Connection validation failed", {
        connectionId: connection.id,
        error: (error instanceof Error ? error.message : String(error)),
      });
      return false;
    }
  }

  /**
   * Set up health monitoring for a specific connection
   */
  private setupConnectionHealthMonitoring(
    connection: SocketConnection,
    config: ConnectionConfig,
  ): void {
    connection.socket.on("disconnect", (reason) => {
      connection.isHealthy = false;
      this.metrics.activeConnections--;

      logger.warn("Socket disconnected", {
        connectionId: connection.id,
        reason,
      });

      if (!this.isShuttingDown) {
        this.attemptReconnection(connection, config);
      }
    });

    connection.socket.on("error", (error) => {
      connection.isHealthy = false;
      connection.lastError = error;
      this.metrics.connectionErrors++;

      logger.error("Socket connection error", {
        connectionId: connection.id,
        error: (error instanceof Error ? error.message : String(error)),
      });
    });

    // Ping/pong for health checking
    connection.socket.on("ping", () => {
      connection.lastUsed = Date.now();
    });
  }

  /**
   * Attempt to reconnect a failed connection
   */
  private async attemptReconnection(
    connection: SocketConnection,
    config: ConnectionConfig,
  ): Promise<void> {
    let delay = this.config.reconnectDelay || 1000;
    const maxAttempts = this.config.reconnectAttempts || 5;
    const backoffMultiplier =
      this.config.health.reconnectBackoffMultiplier || 2;
    const maxDelay = this.config.health.maxReconnectDelay || 30000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.info(`Attempting reconnection ${attempt}/${maxAttempts}`, {
          connectionId: connection.id,
          delay,
        });

        await this.sleep(delay);

        // Try to reconnect
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Reconnection timeout"));
          }, config.timeout || 10000);

          connection.socket.connect();

          connection.socket.once("connect", () => {
            clearTimeout(timeout);
            connection.isHealthy = true;
            this.metrics.reconnections++;
            this.metrics.activeConnections++;

            logger.info("Socket reconnected successfully", {
              connectionId: connection.id,
              attempt,
            });

            resolve();
          });

          connection.socket.once("connect_error", (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });

        return; // Reconnection successful
      } catch (error) {
        logger.warn(`Reconnection attempt ${attempt} failed`, {
          connectionId: connection.id,
          error: (error instanceof Error ? error.message : String(error)),
        });

        // Increase delay for next attempt
        delay = Math.min(delay * backoffMultiplier, maxDelay);
      }
    }

    logger.error("All reconnection attempts failed", {
      connectionId: connection.id,
      maxAttempts,
    });
  }

  /**
   * Acquire a connection from the pool
   */
  async acquireConnection(poolId?: string): Promise<SocketConnection> {
    const targetPoolId = poolId || this.getDefaultPoolId();
    const pool = this.pools.get(targetPoolId);

    if (!pool) {
      throw new Error(`Connection pool not found: ${targetPoolId}`);
    }

    const startTime = Date.now();
    this.metrics.waitingRequests++;

    try {
      const connection = await pool.acquire();
      const acquireTime = Date.now() - startTime;

      this.updateResponseTime(acquireTime);
      this.metrics.waitingRequests--;

      logger.debug("Connection acquired from pool", {
        poolId: targetPoolId,
        connectionId: connection.id,
        acquireTime,
        poolSize: pool.size,
        available: pool.available,
      });

      return connection;
    } catch (error) {
      this.metrics.waitingRequests--;
      logger.error("Failed to acquire connection from pool", {
        poolId: targetPoolId,
        error: (error instanceof Error ? error.message : String(error)),
      });
      throw error;
    }
  }

  /**
   * Release a connection back to the pool
   */
  async releaseConnection(
    connection: SocketConnection,
    poolId?: string,
  ): Promise<void> {
    const targetPoolId = poolId || this.getDefaultPoolId();
    const pool = this.pools.get(targetPoolId);

    if (!pool) {
      throw new Error(`Connection pool not found: ${targetPoolId}`);
    }

    try {
      await pool.release(connection);

      logger.debug("Connection released to pool", {
        poolId: targetPoolId,
        connectionId: connection.id,
        usageCount: connection.usageCount,
        poolSize: pool.size,
        available: pool.available,
      });
    } catch (error) {
      logger.error("Failed to release connection to pool", {
        poolId: targetPoolId,
        connectionId: connection.id,
        error: (error instanceof Error ? error.message : String(error)),
      });
      throw error;
    }
  }

  /**
   * Execute an operation with a connection from the pool
   */
  async executeWithConnection<T>(
    operation: (connection: SocketConnection) => Promise<T>,
    poolId?: string,
  ): Promise<T> {
    let connection: SocketConnection | null = null;
    const targetPoolId = poolId || this.getDefaultPoolId();

    try {
      connection = await this.acquireConnection(targetPoolId);
      const result = await operation(connection);
      return result;
    } finally {
      if (connection) {
        await this.releaseConnection(connection, targetPoolId);
      }
    }
  }

  /**
   * Broadcast a message to all connections in all pools
   */
  async broadcast(event: string, data: any): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [poolId, pool] of this.pools.entries()) {
      const promise = this.executeWithConnection(async (connection) => {
        connection.socket.emit(event, data);
      }, poolId);
      promises.push(promise);
    }

    await Promise.allSettled(promises);

    logger.debug("Message broadcasted to all pools", {
      event,
      poolCount: this.pools.size,
    });
  }

  /**
   * Get connection pool metrics
   */
  getMetrics(): ConnectionMetrics & {
    poolDetails: Array<{
      poolId: string;
      size: number;
      available: number;
      active: number;
    }>;
  } {
    const poolDetails = Array.from(this.pools.entries()).map(
      ([poolId, pool]) => ({
        poolId,
        size: pool.size,
        available: pool.available,
        active: pool.size - pool.available,
      }),
    );

    // Update pool utilization
    const totalMaxConnections = Array.from(this.pools.values()).reduce(
      (sum, pool) => sum + pool.max,
      0,
    );
    this.metrics.poolUtilization =
      totalMaxConnections > 0
        ? this.metrics.totalConnections / totalMaxConnections
        : 0;

    return {
      ...this.metrics,
      poolDetails,
    };
  }

  /**
   * Start health checking for all connections
   */
  private startHealthChecking(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.health.checkInterval);
  }

  /**
   * Perform health check on all connections
   */
  private async performHealthCheck(): Promise<void> {
    for (const [poolId, pool] of this.pools.entries()) {
      try {
        // Test connection by acquiring and releasing
        await this.executeWithConnection(async (connection) => {
          // Send a ping to test connection health
          connection.socket.emit("health_check");
        }, poolId);
      } catch (error) {
        logger.warn("Health check failed for pool", {
          poolId,
          error: (error instanceof Error ? error.message : String(error)),
        });
      }
    }
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    if (!this.config.performance.enableMetrics) return;

    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, this.config.performance.metricsInterval);
  }

  /**
   * Collect performance metrics
   */
  private collectMetrics(): void {
    // Calculate throughput (requests per second)
    const timeWindow = this.config.performance.metricsInterval / 1000;
    this.metrics.throughput = this.metrics.totalConnections / timeWindow;

    // Emit metrics event
    this.emit("metrics", this.getMetrics());
  }

  /**
   * Update response time buffer
   */
  private updateResponseTime(responseTime: number): void {
    this.responseTimeBuffer.push(responseTime);

    if (this.responseTimeBuffer.length > this.maxResponseTimeBuffer) {
      this.responseTimeBuffer.shift();
    }

    // Update average response time
    this.metrics.averageResponseTime =
      this.responseTimeBuffer.reduce((a, b) => a + b, 0) /
      this.responseTimeBuffer.length;
  }

  /**
   * Generate unique pool ID
   */
  private generatePoolId(config: ConnectionConfig): string {
    return `${config.host}:${config.port}:${config.path || "/socket.io"}`;
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get default pool ID
   */
  private getDefaultPoolId(): string {
    const firstConnection = this.config.connections[0];
    return firstConnection ? this.generatePoolId(firstConnection) : "";
  }

  /**
   * Gracefully shutdown all connection pools
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    logger.info("Shutting down Socket.IO connection pools");

    // Clear intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Drain all pools
    const shutdownPromises = Array.from(this.pools.entries()).map(
      async ([poolId, pool]) => {
        try {
          await pool.drain();
          await pool.clear();
          logger.info("Connection pool shutdown successfully", { poolId });
        } catch (error) {
          logger.error("Error shutting down connection pool", {
            poolId,
            error: (error instanceof Error ? error.message : String(error)),
          });
        }
      },
    );

    await Promise.allSettled(shutdownPromises);
    this.pools.clear();

    logger.info("Socket.IO connection pools shutdown complete");
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
