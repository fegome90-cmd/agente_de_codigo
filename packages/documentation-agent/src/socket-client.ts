/**
 * TypeScript Socket Client for Documentation Agent
 * Unix socket IPC communication with the orchestrator
 */

import { createConnection, Socket } from 'net';
import { EventEmitter } from 'events';
import { IPCMessage, AgentCapabilities } from './types.js';
import { randomUUID } from 'crypto';

export class DocumentationSocketClient extends EventEmitter {
  private socketPath: string;
  private agentName: string;
  private socket: Socket | null = null;
  private isConnected = false;
  private isRunning = false;
  private activeTasks = new Map<string, any>();
  private heartbeatInterval = 5000; // 5 seconds
  private reconnectInterval = 2000; // 2 seconds
  private maxReconnectAttempts = 10;
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(socketPath: string, agentName: string) {
    super();
    this.socketPath = socketPath;
    this.agentName = agentName;
  }

  /**
   * Connect to the orchestrator socket
   */
  async connect(): Promise<boolean> {
    try {
      this.socket = createConnection(this.socketPath);

      this.socket.on('connect', () => {
        this.isConnected = true;
        this.emit('connected');
        this.sendRegistration();
        console.log(`[${this.agentName}] Connected to orchestrator via ${this.socketPath}`);
      });

      this.socket.on('data', (data) => {
        this.handleData(data);
      });

      this.socket.on('error', (error) => {
        console.error(`[${this.agentName}] Socket error:`, error);
        this.isConnected = false;
        this.emit('error', error);
      });

      this.socket.on('close', () => {
        this.isConnected = false;
        this.emit('disconnected');
        console.log(`[${this.agentName}] Disconnected from orchestrator`);
      });

      // Wait for connection
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        this.once('connected', () => {
          clearTimeout(timeout);
          resolve(true);
        });

        this.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

    } catch (error) {
      console.error(`[${this.agentName}] Failed to connect to orchestrator:`, error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Disconnect from the orchestrator
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
    this.isConnected = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
  }

  /**
   * Start the client with automatic reconnection and heartbeat
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn(`[${this.agentName}] Client already running`);
      return;
    }

    this.isRunning = true;
    console.log(`[${this.agentName}] Starting client`);

    // Setup signal handlers
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());

    // Start heartbeat
    this.startHeartbeat();

    // Start main connection loop
    await this.mainLoop();
  }

  /**
   * Stop the client
   */
  stop(): void {
    console.log(`[${this.agentName}] Stopping client`);
    this.isRunning = false;
    this.disconnect();
  }

  /**
   * Send a message to the orchestrator
   */
  sendMessage(message: Omit<IPCMessage, 'timestamp' | 'agent'>): boolean {
    if (!this.isConnected || !this.socket) {
      console.error(`[${this.agentName}] Not connected to orchestrator`);
      return false;
    }

    try {
      const fullMessage: IPCMessage = {
        ...message,
        agent: this.agentName,
        timestamp: new Date().toISOString(),
      };

      const messageData = JSON.stringify(fullMessage) + '\n';
      this.socket.write(messageData);

      console.debug(`[${this.agentName}] Message sent: ${message.type} (id: ${message.id})`);
      return true;

    } catch (error) {
      console.error(`[${this.agentName}] Failed to send message:`, error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Send task completion response
   */
  sendTaskResponse(
    taskId: string,
    status: 'done' | 'failed',
    results: any,
    durationMs?: number
  ): boolean {
    return this.sendMessage({
      id: taskId,
      type: 'task',
      data: {
        status,
        results,
        duration_ms: durationMs,
        agent: this.agentName,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Send an event message
   */
  sendEvent(eventType: string, data: Record<string, any>): boolean {
    return this.sendMessage({
      id: `event-${Date.now()}`,
      type: 'event',
      data: {
        type: eventType,
        agent: this.agentName,
        status: 'active',
        ...data
      }
    });
  }

  /**
   * Get agent capabilities (to be overridden by subclass)
   */
  protected getCapabilities(): AgentCapabilities {
    return {
      supportsHeartbeat: true,
      supportsTasks: true,
      supportsEvents: true,
      tools: [],
      languages: ['json', 'yaml', 'typescript'],
      features: ['openapi-validation', 'breaking-change-detection', 'changelog-generation']
    };
  }

  /**
   * Handle incoming task (to be implemented by subclass)
   */
  async handleTask(taskId: string, taskData: any): Promise<void> {
    throw new Error('handleTask must be implemented by subclass');
  }

  private sendRegistration(): void {
    const registrationData = {
      agent: this.agentName,
      pid: process.pid,
      version: '1.0.0',
      capabilities: this.getCapabilities()
    };

    this.sendMessage({
      id: 'registration',
      type: 'event',
      data: registrationData
    });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        const heartbeatData = {
          agent: this.agentName,
          pid: process.pid,
          status: this.activeTasks.size > 0 ? 'busy' : 'idle',
          active_tasks: this.activeTasks.size,
          uptime: process.uptime()
        };

        this.sendMessage({
          id: `heartbeat-${Date.now()}`,
          type: 'heartbeat',
          data: heartbeatData
        });
      }
    }, this.heartbeatInterval);
  }

  private handleData(data: Buffer): void {
    try {
      const messageStr = data.toString().trim();
      if (!messageStr) return;

      const messages = messageStr.split('\n');
      for (const msg of messages) {
        if (msg.trim()) {
          this.processMessage(msg.trim());
        }
      }
    } catch (error) {
      console.error(`[${this.agentName}] Failed to parse message:`, error);
    }
  }

  private processMessage(messageStr: string): void {
    try {
      const message: IPCMessage = JSON.parse(messageStr);
      console.debug(`[${this.agentName}] Message received: ${message.type} (id: ${message.id})`);

      switch (message.type) {
        case 'task':
          this.handleTaskMessage(message);
          break;
        case 'ping':
          this.handlePing(message);
          break;
        case 'pong':
          this.handlePong(message);
          break;
        default:
          console.warn(`[${this.agentName}] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error(`[${this.agentName}] Error processing message:`, error);
    }
  }

  private async handleTaskMessage(message: IPCMessage): Promise<void> {
    if (!message.data) {
      console.error(`[${this.agentName}] Task message missing data`);
      return;
    }

    const taskData = message.data;
    const taskId = message.id;

    console.log(`[${this.agentName}] Received task: ${taskId}`);

    // Store active task
    this.activeTasks.set(taskId, {
      taskData,
      startTime: Date.now()
    });

    // Call task handler
    try {
      await this.handleTask(taskId, taskData);
    } catch (error) {
      console.error(`[${this.agentName}] Task handler failed:`, error);
      this.sendTaskResponse(taskId, 'failed', { error: (error as Error).message });
    }
  }

  private handlePing(message: IPCMessage): void {
    this.sendMessage({
      id: `pong-${message.id}`,
      type: 'pong',
      data: {
        agent: this.agentName,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      }
    });
  }

  private handlePong(message: IPCMessage): void {
    if (message.data?.server_time) {
      const serverTime = message.data.server_time;
      const clientTime = Date.now() / 1000;
      const latency = clientTime - serverTime;
      console.debug(`[${this.agentName}] Server latency: ${latency.toFixed(3)}s`);
    }
  }

  private async mainLoop(): Promise<void> {
    let reconnectAttempts = 0;

    while (this.isRunning) {
      if (!this.isConnected) {
        if (reconnectAttempts >= this.maxReconnectAttempts) {
          console.error(`[${this.agentName}] Max reconnection attempts (${this.maxReconnectAttempts}) reached`);
          break;
        }

        console.log(`[${this.agentName}] Attempting to connect (attempt ${reconnectAttempts + 1})`);

        try {
          await this.connect();
          reconnectAttempts = 0;
          console.log(`[${this.agentName}] Connection established`);
        } catch (error) {
          reconnectAttempts++;
          await new Promise(resolve => setTimeout(resolve, this.reconnectInterval));
          continue;
        }
      }

      // Connection is alive, wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`[${this.agentName}] Main loop ended`);
  }
}