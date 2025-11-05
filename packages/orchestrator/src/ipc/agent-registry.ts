/**
 * Agent Registry and Discovery
 * F1 Pit Stop Architecture - Manages agent connections and task distribution
 */

import { SocketServer, AgentConnection } from './socket-server.js';
import { AgentTask, AgentEvent, AgentUtils, CONSTANTS } from '@pit-crew/shared';
import winston from 'winston';
import { EventEmitter } from 'events';

export interface AgentRegistration {
  agent: string;
  pid: number;
  version: string;
  capabilities: Record<string, any>;
  lastSeen: number;
  status: 'idle' | 'busy' | 'error';
}

export interface TaskResult {
  taskId: string;
  agent: string;
  status: string;
  results: any;
  durationMs?: number;
  error?: string;
  createdAt: number; // Unix timestamp for cleanup
}

export class AgentRegistry extends EventEmitter {
  private socketServer: SocketServer;
  private agents: Map<string, AgentRegistration> = new Map();
  private activeTasks: Map<string, TaskResult> = new Map();
  private pendingTasks: Map<string, AgentTask> = new Map();
  private taskTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private logger: winston.Logger;

  // Security: Size limits to prevent memory exhaustion
  private readonly MAX_REGISTERED_AGENTS = 100;
  private readonly MAX_ACTIVE_TASKS = 1000;
  private readonly MAX_PENDING_TASKS = 500;
  private readonly MAX_TASK_TIMEOUTS = 1000;

  // Cleanup interval in milliseconds (5 minutes)
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(socketServer: SocketServer) {
    super();
    this.socketServer = socketServer;

    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL_MS);

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}] [REGISTRY]: ${message} ${metaStr}`;
        })
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({
          filename: './logs/agent-registry.log',
          maxsize: 10 * 1024 * 1024,
          maxFiles: 3,
        }),
      ],
    });

    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for socket server
   */
  private setupEventHandlers(): void {
    this.socketServer.on('task_response', (message: any) => {
      this.handleTaskResponse(message);
    });

    this.socketServer.on('agent_event', (message: any) => {
      this.handleAgentEvent(message);
    });

    this.socketServer.on('agent_disconnected', (connection: AgentConnection) => {
      this.handleAgentDisconnected(connection);
    });

    this.socketServer.on('agent_timeout', (connection: AgentConnection) => {
      this.handleAgentTimeout(connection);
    });
  }

  /**
   * Handle task completion response from agent
   */
  private handleTaskResponse(message: any): void {
    const { agent, id: taskId, data } = message;

    this.logger.debug('Task response received', { agent, taskId, status: data?.status });

    // Update active tasks
    if (this.activeTasks.has(taskId)) {
      const existingTask = this.activeTasks.get(taskId)!;
      this.activeTasks.delete(taskId);

      // Cancel timeout
      const timeout = this.taskTimeouts.get(taskId);
      if (timeout) {
        clearTimeout(timeout);
        this.taskTimeouts.delete(taskId);
      }

      // Update agent registration
      this.updateAgentActivity(agent, data?.status || 'done');

      const result: TaskResult = {
        taskId,
        agent,
        status: data?.status || 'unknown',
        results: data?.results,
        durationMs: data?.duration_ms,
        error: data?.error,
        createdAt: Date.now()
      };

      // Security: Check size limit for active tasks
      if (this.activeTasks.size >= this.MAX_ACTIVE_TASKS) {
        this.logger.warn('Active tasks limit reached, cleaning up old tasks');
        this.cleanupActiveTasks(100); // Clean 100 oldest tasks
      }

      this.activeTasks.set(taskId, result);
      this.pendingTasks.delete(taskId);

      this.emit('task_completed', result);
      this.logger.info('Task completed', {
        taskId,
        agent,
        status: result.status,
        duration: result.durationMs
      });
    }
  }

  /**
   * Handle agent status events
   */
  private handleAgentEvent(message: any): void {
    const { agent, data } = message;

    if (this.agents.has(agent)) {
      const registration = this.agents.get(agent)!;
      registration.lastSeen = Date.now();
      registration.status = data?.status || registration.status;

      this.agents.set(agent, registration);
      this.logger.debug('Agent status updated', {
        agent,
        status: registration.status,
        lastSeen: new Date(registration.lastSeen).toISOString()
      });
    }
  }

  /**
   * Handle agent disconnection
   */
  private handleAgentDisconnected(connection: AgentConnection): void {
    const { agent, pid } = connection;

    // Handle pending tasks
    const pendingAgentTasks = Array.from(this.pendingTasks.entries())
      .filter(([_, task]) => task.agent === agent)
      .map(([taskId, task]) => taskId);

    if (this.agents.has(agent)) {
      const registration = this.agents.get(agent)!;
      registration.status = 'error';

      for (const taskId of pendingAgentTasks) {
        this.logger.warn('Task failed due to agent disconnection', {
          taskId,
          agent,
          pendingTasks: pendingAgentTasks.length
        });

        // Cancel timeout
        const timeout = this.taskTimeouts.get(taskId);
        if (timeout) {
          clearTimeout(timeout);
          this.taskTimeouts.delete(taskId);
        }

        this.pendingTasks.delete(taskId);

        const result: TaskResult = {
          taskId,
          agent,
          status: 'failed',
          results: null,
          error: 'Agent disconnected during task execution',
          createdAt: Date.now()
        };

        this.activeTasks.set(taskId, result);
        this.emit('task_failed', result);
      }
    }

    this.logger.info('Agent disconnected', { agent, pid, pendingTasks: pendingAgentTasks.length });
  }

  /**
   * Handle agent timeout
   */
  private handleAgentTimeout(connection: AgentConnection): void {
    const { agent, pid } = connection;

    if (this.agents.has(agent)) {
      const registration = this.agents.get(agent)!;
      registration.status = 'error';
      this.agents.set(agent, registration);
    }

    this.logger.error('Agent timeout', { agent, pid });
    this.emit('agent_timeout', { agent, pid });
  }

  /**
   * Update agent activity status
   */
  private updateAgentActivity(agent: string, status: string): void {
    if (this.agents.has(agent)) {
      const registration = this.agents.get(agent)!;
      registration.lastSeen = Date.now();
      registration.status = status as any;
      this.agents.set(agent, registration);
    }
  }

  /**
   * Register a new agent (called when agent connects and sends registration message)
   */
  registerAgent(data: { agent: string; pid: number; version: string; capabilities: any }): void {
    const { agent, pid, version, capabilities } = data;

    // Security: Check size limit
    if (this.agents.size >= this.MAX_REGISTERED_AGENTS && !this.agents.has(agent)) {
      const error = `Agent registry full - maximum ${this.MAX_REGISTERED_AGENTS} agents reached`;
      this.logger.error(error);
      throw new Error(error);
    }

    this.logger.info('Agent registered', { agent, pid, version, totalAgents: this.agents.size });

    const registration: AgentRegistration = {
      agent,
      pid,
      version,
      capabilities,
      lastSeen: Date.now(),
      status: 'idle'
    };

    this.agents.set(agent, registration);
    this.emit('agent_registered', registration);
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agent: string): void {
    if (this.agents.has(agent)) {
      this.agents.delete(agent);
      this.logger.info('Agent unregistered', { agent });
      this.emit('agent_unregistered', { agent });
    }
  }

  /**
   * Send task to agent
   */
  async sendTask(task: AgentTask): Promise<TaskResult> {
    const { agent, task_id } = task;

    // Check if agent is available
    if (!this.isAgentAvailable(agent)) {
      throw new Error(`Agent ${agent} is not available`);
    }

    // Add to pending tasks
    // Security: Check size limit
    if (this.pendingTasks.size >= this.MAX_PENDING_TASKS) {
      this.logger.warn('Pending tasks limit reached');
      throw new Error(`Pending tasks limit reached - maximum ${this.MAX_PENDING_TASKS} pending tasks`);
    }

    this.pendingTasks.set(task_id, task);

    // Set timeout for task completion
    // Security: Check size limit
    if (this.taskTimeouts.size >= this.MAX_TASK_TIMEOUTS) {
      this.logger.warn('Task timeouts limit reached, cleaning up old timeouts');
      this.cleanupTaskTimeouts(100);
    }
    const timeout = CONSTANTS.AGENT_TIMEOUTS[agent.toUpperCase() as keyof typeof CONSTANTS.AGENT_TIMEOUTS] || 60000;
    const timeoutHandle = setTimeout(() => {
      this.handleTaskTimeout(task_id, agent);
    }, timeout);

    this.taskTimeouts.set(task_id, timeoutHandle);

    try {
      // Send task via socket server
      const success = await this.socketServer.sendTask(task);
      if (!success) {
        throw new Error(`Failed to send task to agent ${agent}`);
      }

      this.logger.info('Task sent to agent', {
        agent,
        taskId: task_id,
        scope: task.scope.length
      });

      // Wait for task completion
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (this.activeTasks.has(task_id)) {
            const result = this.activeTasks.get(task_id)!;
            clearInterval(checkInterval);
            resolve(result);
          }
        }, 100);

        // Clean up interval if task is removed
        setTimeout(() => {
          clearInterval(checkInterval);
          if (!this.activeTasks.has(task_id)) {
            reject(new Error(`Task ${task_id} was removed from active tasks`));
          }
        }, timeout + 1000);
      });

    } catch (error) {
      // Cleanup on failure
      this.pendingTasks.delete(task_id);
      const timeoutHandle = this.taskTimeouts.get(task_id);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        this.taskTimeouts.delete(task_id);
      }
      throw error;
    }
  }

  /**
   * Handle task timeout
   */
  private handleTaskTimeout(taskId: string, agent: string): void {
    this.pendingTasks.delete(taskId);
    this.taskTimeouts.delete(taskId);

    const result: TaskResult = {
      taskId,
      agent,
      status: 'failed',
      results: null,
      error: `Task timeout after ${CONSTANTS.AGENT_TIMEOUTS[agent.toUpperCase() as keyof typeof CONSTANTS.AGENT_TIMEOUTS]}ms`,
      createdAt: Date.now()
    };

    this.activeTasks.set(taskId, result);
    this.emit('task_timeout', result);
    this.logger.error('Task timeout', { taskId, agent });
  }

  /**
   * Check if agent is available for tasks
   */
  isAgentAvailable(agent: string): boolean {
    if (!this.agents.has(agent)) {
      return false;
    }

    const registration = this.agents.get(agent)!;
    return registration.status === 'idle' || registration.status === 'busy';
  }

  /**
   * Get agent registration info
   */
  getAgentInfo(agent: string): AgentRegistration | null {
    return this.agents.get(agent) || null;
  }

  /**
   * Get all registered agents
   */
  getAllAgents(): AgentRegistration[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get active agents
   */
  getActiveAgents(): AgentRegistration[] {
    return this.getAllAgents().filter(agent =>
      agent.status === 'idle' || agent.status === 'busy'
    );
  }

  /**
   * Get pending tasks
   */
  getPendingTasks(): Map<string, AgentTask> {
    return new Map(this.pendingTasks);
  }

  /**
   * Get active tasks
   */
  getActiveTasks(): Map<string, TaskResult> {
    return new Map(this.activeTasks);
  }

  /**
   * Get task result
   */
  getTaskResult(taskId: string): TaskResult | null {
    return this.activeTasks.get(taskId) || null;
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const agents = this.getAllAgents();
    const activeAgents = this.getActiveAgents();
    const idleAgents = agents.filter(agent => agent.status === 'idle');
    const busyAgents = agents.filter(agent => agent.status === 'busy');
    const errorAgents = agents.filter(agent => agent.status === 'error');

    return {
      totalAgents: agents.length,
      activeAgents: activeAgents.length,
      idleAgents: idleAgents.length,
      busyAgents: busyAgents.length,
      errorAgents: errorAgents.length,
      pendingTasks: this.pendingTasks.size,
      activeTasks: this.activeTasks.size,
      completedTasks: this.activeTasks.size,
      agents: agents.map(agent => ({
        agent: agent.agent,
        pid: agent.pid,
        version: agent.version,
        status: agent.status,
        lastSeen: agent.lastSeen,
        capabilities: agent.capabilities
      }))
    };
  }

  /**
   * Broadcast message to all agents
   */
  broadcast(message: any): void {
    this.socketServer.broadcastMessage({
      id: `broadcast-${Date.now()}`,
      type: 'event',
      timestamp: AgentUtils.now(),
      data: message
    });
  }

  /**
   * Cleanup old tasks and data
   */
  cleanup(): void {
    const now = Date.now();
    const taskTimeout = 300000; // 5 minutes (matching AGENT_TIMEOUTS)
    let cleanedActive = 0;
    let cleanedTimeouts = 0;

    // Clean up old active tasks using createdAt timestamp
    for (const [taskId, result] of this.activeTasks.entries()) {
      const age = now - result.createdAt;
      if (age > taskTimeout) {
        this.activeTasks.delete(taskId);
        cleanedActive++;
      }
    }

    if (cleanedActive > 0) {
      this.logger.info('Cleanup: removed old active tasks', { count: cleanedActive });
    }

    // Clean up expired task timeouts (these are one-time cleanup, not periodic)
    // Only clear completed timeouts
    for (const [taskId, timeout] of this.taskTimeouts.entries()) {
      // Check if task still exists in activeTasks
      if (!this.activeTasks.has(taskId)) {
        clearTimeout(timeout);
        this.taskTimeouts.delete(taskId);
        cleanedTimeouts++;
      }
    }

    if (cleanedTimeouts > 0) {
      this.logger.info('Cleanup: removed orphaned task timeouts', { count: cleanedTimeouts });
    }

    // Log current state for monitoring
    if (cleanedActive > 0 || cleanedTimeouts > 0 || this.agents.size > 0) {
      this.logger.debug('Registry state', {
        registeredAgents: this.agents.size,
        activeTasks: this.activeTasks.size,
        pendingTasks: this.pendingTasks.size,
        taskTimeouts: this.taskTimeouts.size
      });
    }
  }

  /**
   * Clean up a specific number of oldest active tasks
   */
  private cleanupActiveTasks(count: number): void {
    const tasksArray = Array.from(this.activeTasks.entries());
    // Sort by createdAt (oldest first)
    tasksArray.sort((a, b) => a[1].createdAt - b[1].createdAt);

    // Remove the oldest tasks
    for (let i = 0; i < Math.min(count, tasksArray.length); i++) {
      const [taskId] = tasksArray[i];
      this.activeTasks.delete(taskId);
    }

    this.logger.info('Forced cleanup of active tasks', {
      removed: Math.min(count, tasksArray.length),
      remaining: this.activeTasks.size
    });
  }

  /**
   * Clean up a specific number of task timeouts
   */
  private cleanupTaskTimeouts(count: number): void {
    const timeoutArray = Array.from(this.taskTimeouts.entries());

    // Remove the first N timeouts
    for (let i = 0; i < Math.min(count, timeoutArray.length); i++) {
      const [taskId, timeout] = timeoutArray[i];
      clearTimeout(timeout);
      this.taskTimeouts.delete(taskId);
    }

    this.logger.info('Forced cleanup of task timeouts', {
      removed: Math.min(count, timeoutArray.length),
      remaining: this.taskTimeouts.size
    });
  }
}
