/**
 * Socket Client for Architecture Agent
 * Real IPC communication with orchestrator using Socket.IO
 */

import { EventEmitter } from 'events';
import { createConnection } from 'node:net';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { IPCMessage } from './types.js';
import type { ArchitectureTaskData, ArchitectureFinding } from './types.js';
import { logger } from './utils/logger.js';

/**
 * Socket client implementation for Architecture Agent communication
 * with real Socket.IO/Unix socket support
 */
export class SocketClient extends EventEmitter {
  private socketPath: string;
  private netSocket: any = null;
  private isConnected: boolean = false;
  private maxRetries: number = 5;
  private retryDelay: number = 5000; // 5 seconds
  private agentId: string = 'architecture-agent';
  private authToken: string;
  private connectionTimeout: number = 10000; // 10 seconds
  private reconnectAttempts: number = 0;
  private messageQueue: string[] = [];
  private heartbeatInterval?: NodeJS.Timeout;
  private createConnection = createConnection;

  constructor(socketPath: string = '/tmp/pit-crew.sock', authToken?: string) {
    super();
    this.socketPath = socketPath;
    this.authToken = authToken || process.env.AGENT_AUTH_TOKEN || this.generateAuthToken();
    this.setupErrorHandling();
  }

  /**
   * Generate a simple authentication token
   */
  private generateAuthToken(): string {
    return `arch-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Connect to the orchestrator via Unix socket with authentication
   */
  async connect(): Promise<void> {
    logger.info(`🔗 Connecting to orchestrator via ${this.socketPath}`);

    // Check if socket exists
    if (!existsSync(this.socketPath)) {
      logger.warn('⚠️ Orchestrator socket not found, running in standalone mode');
      this.emit('standalone-mode');
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.cleanupSocket();
        logger.error('Connection timeout, running in standalone mode');
        this.emit('standalone-mode');
        resolve();
      }, this.connectionTimeout);

      try {
        // Create Unix socket connection
        this.netSocket = createConnection(this.socketPath);

        this.netSocket.on('connect', () => {
          clearTimeout(timeout);
          logger.info('✅ Connected to orchestrator via Unix socket');

          this.isConnected = true;
          this.reconnectAttempts = 0;

          // Send authentication
          this.sendAuthentication();

          // Start heartbeat
          this.startHeartbeat();

          // Process queued messages
          this.processMessageQueue();

          this.emit('connected');
          resolve();
        });

        this.netSocket.on('data', (data: Buffer) => {
          this.handleIncomingData(data);
        });

        this.netSocket.on('error', (error: Error) => {
          clearTimeout(timeout);
          logger.error('Socket error:', error);
          this.handleConnectionError(error);
        });

        this.netSocket.on('close', () => {
          logger.warn('Socket connection closed');
          this.handleDisconnection();
        });

      } catch (error) {
        clearTimeout(timeout);
        logger.error('Failed to create socket connection:', error);
        this.handleConnectionError(error as Error);
      }
    });
  }

  /**
   * Send authentication message to orchestrator
   */
  private sendAuthentication(): void {
    const authMessage: IPCMessage = {
      type: 'auth',
      agentId: this.agentId,
      timestamp: Date.now(),
      data: {
        token: this.authToken,
        capabilities: this.getCapabilities()
      }
    };

    this.sendMessage(authMessage);
  }

  /**
   * Start heartbeat interval
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat().catch(error => {
        logger.error('Failed to send heartbeat:', error);
      });
    }, 30000); // Every 30 seconds
  }

  /**
   * Handle incoming data from socket
   */
  private handleIncomingData(data: Buffer): void {
    try {
      const messages = data.toString().split('\n');
      for (const line of messages) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line) as IPCMessage;
            this.handleMessage(message);
          } catch (parseError) {
            logger.warn('Failed to parse incoming message:', parseError);
          }
        }
      }
    } catch (error) {
      logger.error('Error handling incoming data:', error);
    }
  }

  /**
   * Handle connection errors with retry logic
   */
  private handleConnectionError(error: Error): void {
    if (this.reconnectAttempts < this.maxRetries) {
      this.reconnectAttempts++;
      logger.warn(
        `Connection failed (attempt ${this.reconnectAttempts}/${this.maxRetries}), retrying in ${this.retryDelay}ms`,
        { error: error.message }
      );

      setTimeout(() => {
        this.connect().catch(err => {
          logger.error('Reconnection failed:', err);
        });
      }, this.retryDelay);
    } else {
      logger.error('Max reconnection attempts reached, running in standalone mode');
      this.emit('standalone-mode');
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnection(): void {
    this.isConnected = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    this.emit('disconnected');

    // Attempt reconnection unless we're shutting down
    if (this.reconnectAttempts < this.maxRetries) {
      this.handleConnectionError(new Error('Unexpected disconnection'));
    }
  }

  /**
   * Process queued messages
   */
  private processMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      if (message && this.netSocket) {
        this.netSocket.write(message, 'utf-8');
      }
    }
  }

  /**
   * Cleanup socket resources
   */
  private cleanupSocket(): void {
    if (this.netSocket) {
      this.netSocket.removeAllListeners();
      this.netSocket.destroy();
      this.netSocket = null;
    }
  }

  /**
   * Send a heartbeat to the orchestrator
   */
  async sendHeartbeat(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    const heartbeat: IPCMessage = {
      type: 'heartbeat',
      agentId: this.agentId,
      timestamp: Date.now(),
      data: {
        status: 'healthy',
        capabilities: this.getCapabilities()
      }
    };

    await this.sendMessage(heartbeat);
  }

  /**
   * Send a task response to the orchestrator
   */
  async sendTaskResponse(
    taskId: string,
    status: 'running' | 'done' | 'failed',
    data?: any,
    duration?: number
  ): Promise<void> {
    const response: IPCMessage = {
      type: 'task_response',
      agentId: this.agentId,
      taskId,
      timestamp: Date.now(),
      data: {
        status,
        data,
        duration
      }
    };

    await this.sendMessage(response);
  }

  /**
   * Send a generic message to the orchestrator
   */
  private async sendMessage(message: IPCMessage): Promise<void> {
    try {
      const serialized = JSON.stringify(message) + '\n';

      if (!this.isConnected || !this.netSocket) {
        // Queue message for later if not connected
        logger.debug(`Queuing message: ${message.type}`, { taskId: message.taskId });
        this.messageQueue.push(serialized);
        return;
      }

      // Send via Unix socket
      return new Promise((resolve, reject) => {
        this.netSocket.write(serialized, 'utf-8', (error: Error | null) => {
          if (error) {
            logger.error('Failed to send message:', error);
            reject(error);
          } else {
            logger.debug(`Message sent: ${message.type}`, { taskId: message.taskId });
            resolve();
          }
        });
      });
    } catch (error) {
      logger.error('Failed to send message:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Handle incoming messages from the orchestrator
   */
  private handleMessage(message: IPCMessage): void {
    logger.debug(`Received message: ${message.type}`, { taskId: message.taskId });

    switch (message.type) {
      case 'task':
        this.handleTask(message.taskId!, message.data as ArchitectureTaskData);
        break;
      case 'ping':
        this.handlePing();
        break;
      default:
        logger.warn(`Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle task assignment from orchestrator
   */
  private async handleTask(taskId: string, taskData: ArchitectureTaskData): Promise<void> {
    logger.info(`🎯 Received architecture analysis task: ${taskId}`);
    this.emit('task', taskId, taskData);
  }

  /**
   * Handle ping from orchestrator
   */
  private handlePing(): void {
    this.sendHeartbeat();
  }

  /**
   * Get agent capabilities for registration
   */
  private getCapabilities() {
    return {
      name: 'Architecture Agent',
      version: '1.0.0',
      languages: ['python', 'typescript', 'javascript'],
      features: [
        'layering-violation-detection',
        'dry-violation-analysis',
        'testing-coverage-analysis',
        'complexity-analysis',
        'dependency-graph-analysis',
        'refactor-recommendations',
        'ast-parsing',
        'symbol-extraction'
      ],
      tools: [
        'tree-sitter',
        'ast-analysis',
        'similarity-detection',
        'coverage-parser',
        'layer-rules-engine'
      ]
    };
  }

  /**
   * Setup error handling for the socket client
   */
  private setupErrorHandling(): void {
    this.on('error', (error) => {
      logger.error('Socket client error:', error);
    });

    process.on('SIGINT', () => {
      this.disconnect();
      process.exit(0);
    });
  }

  /**
   * Disconnect from the orchestrator
   */
  disconnect(): void {
    logger.info('🔌 Disconnecting from orchestrator');

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    // Cleanup socket
    this.cleanupSocket();

    // Reset state
    this.isConnected = false;
    this.messageQueue = [];
    this.reconnectAttempts = this.maxRetries; // Prevent reconnection attempts

    this.emit('disconnected');
    logger.info('🔌 Disconnected from orchestrator');
  }

  /**
   * Check if connected to orchestrator
   */
  isClientConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Run in standalone mode (for testing)
   */
  async runStandalone(taskData: ArchitectureTaskData): Promise<void> {
    logger.info('🔧 Running in standalone mode');

    // Ensure output directory exists
    const outputDir = taskData.output ? dirname(taskData.output) : './obs/reports';
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    this.emit('standalone-task', taskData);
  }

  /**
   * Save report to file system
   */
  async saveReport(report: any, outputPath: string): Promise<void> {
    try {
      writeFileSync(outputPath, JSON.stringify(report, null, 2));
      logger.info(`📄 Report saved: ${outputPath}`);
    } catch (error) {
      logger.error('Failed to save report:', error);
      throw error;
    }
  }

  /**
   * Utility function to add delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}