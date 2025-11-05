/**
 * Unix Socket IPC Server
 * F1 Pit Stop Architecture - Communication layer between orchestrator and agents
 */

import { EventEmitter } from 'events';
import { createServer, Server as NetServer, Socket } from 'net';
import { rm } from 'fs/promises';
import winston from 'winston';
import { AgentTask, AgentEvent, AgentUtils } from '@pit-crew/shared';
import path from 'path';

export interface IPCMessage {
  id: string;
  type: 'task' | 'event' | 'heartbeat' | 'ping' | 'pong';
  agent?: string;
  timestamp: string;
  data: any;
}

export interface AgentConnection {
  socket: Socket;
  agent: string;
  pid: number;
  lastHeartbeat: number;
  activeTasks: Set<string>;
  status: 'idle' | 'busy' | 'error';
}

export class SocketServer extends EventEmitter {
  private server: NetServer | null = null;
  private socketPath: string;
  private connections: Map<string, AgentConnection> = new Map();
  private logger: winston.Logger;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private maxConnections = 50;
  private connectionTimeout = 30000; // 30 seconds

  // Security: Agent authentication
  private readonly AGENT_AUTH_TOKEN: string;
  private connectionAttempts: Map<string, { count: number; firstAttempt: number }> = new Map();
  private readonly MAX_AUTH_ATTEMPTS = 5;
  private readonly AUTH_WINDOW_MS = 60000; // 1 minute

  constructor(socketPath: string) {
    super();
    this.socketPath = socketPath;

    // Initialize logger first
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}] [SOCKET]: ${message} ${metaStr}`;
        })
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({
          filename: './logs/ipc-server.log',
          maxsize: 10 * 1024 * 1024,
          maxFiles: 3,
        }),
      ],
    });

    // Initialize agent authentication token from environment
    this.AGENT_AUTH_TOKEN = process.env.AGENT_AUTH_TOKEN || this.generateFallbackToken();

    if (!process.env.AGENT_AUTH_TOKEN) {
      this.logger.warn('AGENT_AUTH_TOKEN not set - using generated token. Set for production!', {
        token: this.AGENT_AUTH_TOKEN.substring(0, 8) + '...'
      });
    }
  }

  /**
   * Start the socket server
   */
  async start(): Promise<void> {
    try {
      // Remove existing socket file if it exists
      await rm(this.socketPath, { force: true });

      this.server = createServer((socket: Socket) => {
        this.handleNewConnection(socket);
      });

      // Setup server event handlers
      this.server.on('error', (error: Error) => {
        this.logger.error('Socket server error', { error });
        this.emit('error', error);
      });

      this.server.on('listening', () => {
        this.logger.info('Socket server started', { socketPath: this.socketPath });
        this.emit('started');
      });

      // Start heartbeat monitoring
      this.startHeartbeatMonitoring();

      // Start the server
      return new Promise((resolve, reject) => {
        this.server!.listen(this.socketPath, () => {
          resolve();
        });

        this.server!.on('error', reject);
      });

    } catch (error) {
      this.logger.error('Failed to start socket server', { error });
      throw error;
    }
  }

  /**
   * Stop the socket server
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping socket server');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.server) {
      // Close all connections
      for (const connection of this.connections.values()) {
        connection.socket.destroy();
      }

      return new Promise((resolve) => {
        this.server!.close(() => {
          this.server = null;
          this.connections.clear();
          this.logger.info('Socket server stopped');
          resolve();
        });
      });
    }
  }

  /**
   * Handle new agent connection
   */
  private handleNewConnection(socket: Socket): void {
    if (this.connections.size >= this.maxConnections) {
      this.logger.warn('Connection rejected - max connections reached');
      socket.destroy();
      return;
    }

    const connectionId = `${socket.remoteAddress}:${socket.remotePort}`;
    this.logger.debug('New connection attempt', { connectionId });

    let agentConnection: AgentConnection | null = null;
    let authenticated = false;
    let authBuffer = '';

    socket.on('data', (data: Buffer) => {
      try {
        const raw = data.toString();
        authBuffer += raw;

        // Check if we have a complete message (ends with newline)
        const lines = authBuffer.split('\n');
        authBuffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          const message = JSON.parse(line) as IPCMessage;

          // CRITICAL: Authenticate agent before any other processing
          if (!authenticated) {
            if (message.type === 'event' && message.id === 'auth') {
              const token = (message.data as any)?.token;
              if (this.validateAgentAuth(token, connectionId)) {
                authenticated = true;
                this.connectionAttempts.delete(connectionId);
                this.logger.info('Agent authenticated', {
                  agent: message.agent,
                  connectionId
                });
              } else {
                this.logger.warn('Agent authentication failed', {
                  agent: message.agent,
                  connectionId,
                  token: token ? token.substring(0, 4) + '...' : 'none'
                });
                socket.destroy();
                return;
              }
            } else {
              this.logger.warn('Authentication required before registration', { connectionId });
              socket.destroy();
              return;
            }
          }

          // Initialize agent connection on registration event (after auth)
          if (
            authenticated &&
            message.type === 'event' &&
            (!agentConnection) &&
            message.agent &&
            (message.id === 'registration' || (message.data && (message.data as any).capabilities))
          ) {
            // Verify the agent name matches what was authenticated
            if (this.isAgentAllowed(message.agent)) {
              agentConnection = {
                socket,
                agent: message.agent,
                pid: (message.data as any)?.pid ?? 0,
                lastHeartbeat: Date.now(),
                activeTasks: new Set<string>(),
                status: 'idle'
              };
              this.connections.set(message.agent, agentConnection);
              this.emit('agent_registered', agentConnection);
              this.logger.info('Agent registered', {
                agent: message.agent,
                pid: agentConnection.pid,
                connectionId
              });
            } else {
              this.logger.warn('Agent not in allowed list', {
                agent: message.agent,
                connectionId
              });
              socket.destroy();
              return;
            }
          }

          this.handleMessage(message, socket, agentConnection);
        }
      } catch (error) {
        this.logger.error('Invalid message received', {
          error: error instanceof Error ? error.message : 'Unknown error',
          connectionId
        });
        socket.destroy();
      }
    });

    socket.on('close', () => {
      if (agentConnection) {
        this.logger.info('Agent disconnected', {
          agent: (agentConnection as any).agent,
          pid: (agentConnection as any).pid,
          activeTasks: (agentConnection as any).activeTasks.size
        });
        this.connections.delete((agentConnection as any).agent);
        this.emit('agent_disconnected', agentConnection);
      }
      this.connectionAttempts.delete(connectionId);
    });

    socket.on('error', (error: Error) => {
      this.logger.error('Socket error', {
        error: error.message,
        connectionId
      });
      this.connectionAttempts.delete(connectionId);
    });

    // Set timeout for handshake (includes authentication)
    const handshakeTimeout = setTimeout(() => {
      if (!agentConnection || !authenticated) {
        this.logger.warn('Handshake/auth timeout', { connectionId });
        socket.destroy();
      }
    }, 5000);
  }

  /**
   * Validate agent authentication token
   */
  private validateAgentAuth(token: string | undefined, connectionId: string): boolean {
    if (!token) {
      this.recordAuthAttempt(connectionId);
      return false;
    }

    // Check rate limiting
    const attempts = this.connectionAttempts.get(connectionId);
    const now = Date.now();

    if (attempts) {
      // Reset window if enough time has passed
      if (now - attempts.firstAttempt > this.AUTH_WINDOW_MS) {
        this.connectionAttempts.set(connectionId, { count: 1, firstAttempt: now });
      } else {
        attempts.count++;

        if (attempts.count > this.MAX_AUTH_ATTEMPTS) {
          this.logger.error('Rate limit exceeded - too many auth attempts', { connectionId });
          return false;
        }
      }
    } else {
      this.connectionAttempts.set(connectionId, { count: 1, firstAttempt: now });
    }

    // Validate token
    const isValid = token === this.AGENT_AUTH_TOKEN;
    if (!isValid) {
      this.logger.warn('Invalid authentication token', {
        connectionId,
        tokenPreview: token.substring(0, 4) + '...'
      });
    }

    return isValid;
  }

  /**
   * Record authentication attempt for rate limiting
   */
  private recordAuthAttempt(connectionId: string): void {
    const attempts = this.connectionAttempts.get(connectionId);
    const now = Date.now();

    if (attempts) {
      if (now - attempts.firstAttempt > this.AUTH_WINDOW_MS) {
        this.connectionAttempts.set(connectionId, { count: 1, firstAttempt: now });
      } else {
        attempts.count++;
      }
    } else {
      this.connectionAttempts.set(connectionId, { count: 1, firstAttempt: now });
    }
  }

  /**
   * Check if agent is in allowed list
   */
  private isAgentAllowed(agentName: string): boolean {
    const allowedAgents = process.env.ALLOWED_AGENTS?.split(',').map(a => a.trim()) || [
      'security-agent',
      'quality-agent',
      'documentation-agent',
      'architecture-agent',
      'observability-agent',
      'pr-reviewer'
    ];

    return allowedAgents.includes(agentName);
  }

  /**
   * Generate fallback authentication token (for development only)
   */
  private generateFallbackToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  /**
   * Handle incoming messages from agents
   */
  private handleMessage(message: IPCMessage, socket: Socket, connection: AgentConnection | null): void {
    this.logger.debug('Message received', {
      id: message.id,
      type: message.type,
      agent: message.agent,
      timestamp: message.timestamp
    });

    switch (message.type) {
      case 'task':
        this.handleTaskResponse(message);
        break;

      case 'event':
        this.handleAgentEvent(message);
        break;

      case 'heartbeat':
        this.handleHeartbeat(message, socket, connection);
        break;

      case 'ping':
        this.handlePing(socket, connection);
        break;

      case 'pong':
        // Pong responses are handled by connection tracking
        break;

      default:
        this.logger.warn('Unknown message type', { type: message.type });
    }
  }

  /**
   * Handle task completion response from agent
   */
  private handleTaskResponse(message: IPCMessage): void {
    if (!message.agent) {
      this.logger.error('Task response missing agent field', { message });
      return;
    }

    const connection = this.connections.get(message.agent);
    if (connection) {
      connection.activeTasks.delete(message.id);
      if (connection.activeTasks.size === 0) {
        connection.status = 'idle';
      }
    }

    this.emit('task_response', message);
    this.logger.info('Task completed', {
      agent: message.agent,
      taskId: message.id,
      status: message.data?.status,
      duration: message.data?.duration_ms
    });
  }

  /**
   * Handle agent status events
   */
  private handleAgentEvent(message: IPCMessage): void {
    if (!message.agent) {
      this.logger.error('Agent event missing agent field', { message });
      return;
    }

    this.emit('agent_event', message);
    this.logger.info('Agent event', {
      agent: message.agent,
      type: message.data?.type,
      status: message.data?.status
    });
  }

  /**
   * Handle heartbeat from agent
   */
  private handleHeartbeat(message: IPCMessage, socket: Socket, connection: AgentConnection | null): void {
    if (!message.agent) {
      return;
    }
    // Resolve connection if not provided
    const conn = connection ?? this.connections.get(message.agent) ?? null;
    if (!conn) {
      // Lazy register minimal connection on heartbeat if needed
      this.connections.set(message.agent, {
        socket,
        agent: message.agent,
        pid: (message.data as any)?.pid ?? 0,
        lastHeartbeat: Date.now(),
        activeTasks: new Set<string>(),
        status: message.data?.status || 'idle'
      });
    } else {
      conn.lastHeartbeat = Date.now();
      conn.status = message.data?.status || conn.status;
    }

    // Respond with pong
    const pongMessage: IPCMessage = {
      id: `pong-${message.id}`,
      type: 'pong',
      timestamp: AgentUtils.now(),
      data: {
        server_time: Date.now()
      }
    };

    socket.write(JSON.stringify(pongMessage) + '\n');
  }

  /**
   * Handle ping request
   */
  private handlePing(socket: Socket, connection: AgentConnection | null): void {
    const pongMessage: IPCMessage = {
      id: `pong-${Date.now()}`,
      type: 'pong',
      timestamp: AgentUtils.now(),
      data: {
        server_time: Date.now(),
        connections: this.connections.size
      }
    };

    socket.write(JSON.stringify(pongMessage) + '\n');
  }

  /**
   * Send task to specific agent
   */
  async sendTask(task: AgentTask): Promise<boolean> {
    const connection = this.connections.get(task.agent);
    if (!connection) {
      this.logger.error('Agent not connected', { agent: task.agent });
      return false;
    }

    if (connection.status === 'error') {
      this.logger.error('Agent in error state', { agent: task.agent });
      return false;
    }

    const message: IPCMessage = {
      id: task.task_id,
      type: 'task',
      agent: task.agent,
      timestamp: AgentUtils.now(),
      data: task
    };

    try {
      connection.socket.write(JSON.stringify(message) + '\n');
      connection.activeTasks.add(task.task_id);
      connection.status = 'busy';

      this.logger.info('Task sent to agent', {
        agent: task.agent,
        taskId: task.task_id,
        scope: task.scope.length
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to send task to agent', {
        agent: task.agent,
        taskId: task.task_id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Broadcast message to all connected agents
   */
  broadcastMessage(message: Omit<IPCMessage, 'agent'>): void {
    const fullMessage: IPCMessage = {
      ...message,
      agent: 'broadcast'
    };

    const data = JSON.stringify(fullMessage) + '\n';
    let sentCount = 0;

    for (const connection of this.connections.values()) {
      try {
        connection.socket.write(data);
        sentCount++;
      } catch (error) {
        this.logger.error('Failed to broadcast to agent', {
          agent: connection.agent,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    this.logger.info('Message broadcasted', {
      type: message.type,
      sentTo: sentCount,
      totalConnections: this.connections.size
    });
  }

  /**
   * Get list of connected agents
   */
  getConnectedAgents(): Array<{ agent: string; pid: number; status: string; activeTasks: number }> {
    return Array.from(this.connections.values()).map(conn => ({
      agent: conn.agent,
      pid: conn.pid,
      status: conn.status,
      activeTasks: conn.activeTasks.size
    }));
  }

  /**
   * Check if agent is connected and healthy
   */
  isAgentHealthy(agent: string): boolean {
    const connection = this.connections.get(agent);
    if (!connection) {
      return false;
    }

    const timeSinceHeartbeat = Date.now() - connection.lastHeartbeat;
    return timeSinceHeartbeat < this.connectionTimeout && connection.status !== 'error';
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeatMonitoring(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();

      for (const [agent, connection] of this.connections.entries()) {
        const timeSinceHeartbeat = now - connection.lastHeartbeat;

        if (timeSinceHeartbeat > this.connectionTimeout) {
          this.logger.warn('Agent heartbeat timeout', {
            agent,
            lastHeartbeat: new Date(connection.lastHeartbeat).toISOString(),
            timeout: this.connectionTimeout
          });

          connection.status = 'error';
          connection.socket.destroy();
          this.connections.delete(agent);
          this.emit('agent_timeout', connection);
        }
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      socketPath: this.socketPath,
      connectedAgents: this.connections.size,
      maxConnections: this.maxConnections,
      uptime: process.uptime(),
      connections: Array.from(this.connections.entries()).map(([agent, conn]) => ({
        agent,
        pid: conn.pid,
        status: conn.status,
        activeTasks: conn.activeTasks.size,
        lastHeartbeat: conn.lastHeartbeat,
        socketId: conn.socket.remoteAddress
      }))
    };
  }
}
