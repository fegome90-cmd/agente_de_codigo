/**
 * Health Check System for Agente de Código
 * Provides comprehensive health monitoring for all services and agents
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import axios from 'axios';
import * as http from 'http';
import * as https from 'https';

interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime: number;
  timestamp: Date;
  details?: any;
  error?: string;
}

interface ServiceConfig {
  name: string;
  url?: string;
  port?: number;
  timeout: number;
  interval: number;
  retries: number;
  healthEndpoint?: string;
  dependencies?: string[];
}

interface HealthMetrics {
  uptime: number;
  lastCheck: Date;
  consecutiveFailures: number;
  totalChecks: number;
  totalFailures: number;
  averageResponseTime: number;
  status: 'healthy' | 'unhealthy' | 'degraded';
}

export class HealthCheckService extends EventEmitter {
  private services: Map<string, ServiceConfig> = new Map();
  private metrics: Map<string, HealthMetrics> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;

  constructor() {
    super();
    this.setupDefaultServices();
  }

  private setupDefaultServices(): void {
    // Core services
    this.addService({
      name: 'orchestrator',
      port: 3000,
      timeout: 5000,
      interval: 30000,
      retries: 3,
      healthEndpoint: '/health',
      dependencies: ['redis', 'postgres']
    });

    this.addService({
      name: 'security-agent',
      port: 3001,
      timeout: 10000,
      interval: 60000,
      retries: 3,
      healthEndpoint: '/health',
      dependencies: ['semgrep', 'gitleaks']
    });

    this.addService({
      name: 'quality-agent',
      port: 3002,
      timeout: 10000,
      interval: 60000,
      retries: 3,
      healthEndpoint: '/health',
      dependencies: ['ruff', 'eslint']
    });

    this.addService({
      name: 'architecture-agent',
      port: 3003,
      timeout: 10000,
      interval: 60000,
      retries: 3,
      healthEndpoint: '/health',
      dependencies: ['tree-sitter']
    });

    this.addService({
      name: 'documentation-agent',
      port: 3004,
      timeout: 10000,
      interval: 60000,
      retries: 3,
      healthEndpoint: '/health',
      dependencies: ['openapi-parser']
    });

    // External dependencies
    this.addService({
      name: 'redis',
      port: 6379,
      timeout: 3000,
      interval: 30000,
      retries: 3
    });

    this.addService({
      name: 'postgres',
      port: 5432,
      timeout: 5000,
      interval: 30000,
      retries: 3
    });

    this.addService({
      name: 'grafana',
      port: 3001,
      timeout: 5000,
      interval: 120000,
      retries: 2
    });

    this.addService({
      name: 'prometheus',
      port: 9090,
      timeout: 5000,
      interval: 120000,
      retries: 2
    });
  }

  public addService(config: ServiceConfig): void {
    this.services.set(config.name, config);

    // Initialize metrics
    this.metrics.set(config.name, {
      uptime: 0,
      lastCheck: new Date(),
      consecutiveFailures: 0,
      totalChecks: 0,
      totalFailures: 0,
      averageResponseTime: 0,
      status: 'healthy'
    });
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Health check service is already running');
      return;
    }

    console.log('🏥 Starting Health Check Service...');
    this.isRunning = true;

    // Start monitoring all services
    for (const [name, config] of this.services) {
      this.startServiceMonitoring(name, config);
    }

    console.log(`✅ Health check service started. Monitoring ${this.services.size} services.`);
    this.emit('started', { services: Array.from(this.services.keys()) });
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping Health Check Service...');
    this.isRunning = false;

    // Clear all intervals
    for (const [name, interval] of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();

    console.log('✅ Health check service stopped');
    this.emit('stopped');
  }

  private startServiceMonitoring(name: string, config: ServiceConfig): void {
    // Initial check
    this.checkService(name, config);

    // Set up recurring checks
    const interval = setInterval(() => {
      this.checkService(name, config);
    }, config.interval);

    this.intervals.set(name, interval);
  }

  private async checkService(name: string, config: ServiceConfig): Promise<void> {
    const startTime = performance.now();
    let result: HealthCheckResult;

    try {
      if (config.url) {
        result = await this.checkHttpService(name, config);
      } else if (config.port) {
        result = await this.checkPortService(name, config);
      } else {
        result = await this.checkExternalService(name, config);
      }
    } catch (error) {
      result = {
        service: name,
        status: 'unhealthy',
        responseTime: performance.now() - startTime,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Update metrics
    this.updateMetrics(name, result);

    // Emit event
    this.emit('health-check', result);

    // Log significant status changes
    const metrics = this.metrics.get(name)!;
    if (result.status === 'unhealthy' && metrics.consecutiveFailures === 1) {
      console.warn(`⚠️ Service ${name} is unhealthy`);
      this.emit('service-unhealthy', result);
    } else if (result.status === 'healthy' && metrics.consecutiveFailures > 0) {
      console.log(`✅ Service ${name} recovered`);
      this.emit('service-recovered', result);
    }
  }

  private async checkHttpService(name: string, config: ServiceConfig): Promise<HealthCheckResult> {
    const url = config.url || `http://localhost:${config.port}${config.healthEndpoint || '/health'}`;
    const startTime = performance.now();

    try {
      const response = await axios.get(url, {
        timeout: config.timeout,
        validateStatus: (status) => status < 500 // Consider 4xx as healthy
      });

      return {
        service: name,
        status: this.determineHealthStatus(response.status),
        responseTime: performance.now() - startTime,
        timestamp: new Date(),
        details: {
          status: response.status,
          statusText: response.statusText,
          data: response.data
        }
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          service: name,
          status: 'unhealthy',
          responseTime: performance.now() - startTime,
          timestamp: new Date(),
          error: `HTTP Error: ${error.code || error.message}`,
          details: {
            status: error.response?.status,
            statusText: error.response?.statusText
          }
        };
      }
      throw error;
    }
  }

  private async checkPortService(name: string, config: ServiceConfig): Promise<HealthCheckResult> {
    const startTime = performance.now();

    return new Promise((resolve, reject) => {
      const socket = new (require('net').Socket)();

      socket.setTimeout(config.timeout);

      socket.on('connect', () => {
        socket.end();
        resolve({
          service: name,
          status: 'healthy',
          responseTime: performance.now() - startTime,
          timestamp: new Date(),
          details: { port: config.port }
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error(`Connection timeout to port ${config.port}`));
      });

      socket.on('error', (error: Error) => {
        reject(error);
      });

      socket.connect(config.port!, 'localhost');
    });
  }

  private async checkExternalService(name: string, config: ServiceConfig): Promise<HealthCheckResult> {
    const startTime = performance.now();

    // Specialized checks for external tools
    switch (name) {
      case 'semgrep':
        return await this.checkSemgrep(startTime);
      case 'gitleaks':
        return await this.checkGitleaks(startTime);
      case 'ruff':
        return await this.checkRuff(startTime);
      case 'tree-sitter':
        return await this.checkTreeSitter(startTime);
      default:
        throw new Error(`No health check configured for service: ${name}`);
    }
  }

  private async checkSemgrep(startTime: number): Promise<HealthCheckResult> {
    const { exec } = require('child_process');

    return new Promise((resolve) => {
      exec('semgrep --version', { timeout: 5000 }, (error: any, stdout: string) => {
        resolve({
          service: 'semgrep',
          status: error ? 'unhealthy' : 'healthy',
          responseTime: performance.now() - startTime,
          timestamp: new Date(),
          details: { version: stdout.trim() },
          error: error?.message
        });
      });
    });
  }

  private async checkGitleaks(startTime: number): Promise<HealthCheckResult> {
    const { exec } = require('child_process');

    return new Promise((resolve) => {
      exec('gitleaks --version', { timeout: 5000 }, (error: any, stdout: string) => {
        resolve({
          service: 'gitleaks',
          status: error ? 'unhealthy' : 'healthy',
          responseTime: performance.now() - startTime,
          timestamp: new Date(),
          details: { version: stdout.trim() },
          error: error?.message
        });
      });
    });
  }

  private async checkRuff(startTime: number): Promise<HealthCheckResult> {
    const { exec } = require('child_process');

    return new Promise((resolve) => {
      exec('ruff --version', { timeout: 5000 }, (error: any, stdout: string) => {
        resolve({
          service: 'ruff',
          status: error ? 'unhealthy' : 'healthy',
          responseTime: performance.now() - startTime,
          timestamp: new Date(),
          details: { version: stdout.trim() },
          error: error?.message
        });
      });
    });
  }

  private async checkTreeSitter(startTime: number): Promise<HealthCheckResult> {
    try {
      const { execSync } = require('child_process');
      const output = execSync('python -c "import tree_sitter; print(tree_sitter.Language.version())"', {
        timeout: 5000,
        encoding: 'utf8'
      });

      return {
        service: 'tree-sitter',
        status: 'healthy',
        responseTime: performance.now() - startTime,
        timestamp: new Date(),
        details: { version: output.trim() }
      };
    } catch (error: any) {
      return {
        service: 'tree-sitter',
        status: 'unhealthy',
        responseTime: performance.now() - startTime,
        timestamp: new Date(),
        error: error.message
      };
    }
  }

  private determineHealthStatus(httpStatus: number): 'healthy' | 'unhealthy' | 'degraded' {
    if (httpStatus >= 200 && httpStatus < 300) {
      return 'healthy';
    } else if (httpStatus >= 400 && httpStatus < 500) {
      return 'degraded';
    } else {
      return 'unhealthy';
    }
  }

  private updateMetrics(name: string, result: HealthCheckResult): void {
    const metrics = this.metrics.get(name)!;

    metrics.totalChecks++;
    metrics.lastCheck = new Date();

    if (result.status === 'healthy') {
      metrics.consecutiveFailures = 0;
    } else {
      metrics.consecutiveFailures++;
      metrics.totalFailures++;
    }

    // Update average response time
    const totalResponseTime = metrics.averageResponseTime * (metrics.totalChecks - 1) + result.responseTime;
    metrics.averageResponseTime = totalResponseTime / metrics.totalChecks;

    // Update status
    if (metrics.consecutiveFailures >= 3) {
      metrics.status = 'unhealthy';
    } else if (metrics.consecutiveFailures > 0) {
      metrics.status = 'degraded';
    } else {
      metrics.status = 'healthy';
    }

    // Update uptime
    if (metrics.status === 'healthy') {
      metrics.uptime += this.services.get(name)!.interval / 1000;
    }
  }

  public getHealthStatus(): { [serviceName: string]: HealthMetrics } {
    const status: { [serviceName: string]: HealthMetrics } = {};
    for (const [name, metrics] of this.metrics) {
      status[name] = { ...metrics };
    }
    return status;
  }

  public getServiceHealth(name: string): HealthMetrics | null {
    return this.metrics.get(name) || null;
  }

  public async checkAllServices(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    for (const [name, config] of this.services) {
      try {
        const startTime = performance.now();
        let result: HealthCheckResult;

        if (config.url) {
          result = await this.checkHttpService(name, config);
        } else if (config.port) {
          result = await this.checkPortService(name, config);
        } else {
          result = await this.checkExternalService(name, config);
        }

        results.push(result);
      } catch (error) {
        results.push({
          service: name,
          status: 'unhealthy',
          responseTime: 0,
          timestamp: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  public async generateHealthReport(): Promise<any> {
    const status = this.getHealthStatus();
    const results = await this.checkAllServices();

    const summary = {
      total: this.services.size,
      healthy: Object.values(status).filter(m => m.status === 'healthy').length,
      degraded: Object.values(status).filter(m => m.status === 'degraded').length,
      unhealthy: Object.values(status).filter(m => m.status === 'unhealthy').length,
      timestamp: new Date()
    };

    return {
      summary,
      services: status,
      lastChecks: results,
      uptime: this.calculateSystemUptime()
    };
  }

  private calculateSystemUptime(): number {
    let totalUptime = 0;
    let totalServices = 0;

    for (const metrics of this.metrics.values()) {
      totalUptime += metrics.uptime;
      totalServices++;
    }

    return totalServices > 0 ? totalUptime / totalServices : 0;
  }
}

// Health Check HTTP Server
export class HealthCheckServer {
  private healthService: HealthCheckService;
  private server: http.Server;
  private port: number;

  constructor(port: number = 8080) {
    this.port = port;
    this.healthService = new HealthCheckService();
    this.server = this.createServer();
  }

  private createServer(): http.Server {
    return http.createServer(async (req, res) => {
      const startTime = performance.now();

      try {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        const url = new URL(req.url!, `http://localhost:${this.port}`);

        switch (url.pathname) {
          case '/health':
            await this.handleHealthCheck(req, res);
            break;
          case '/health/detailed':
            await this.handleDetailedHealth(req, res);
            break;
          case '/health/services':
            await this.handleServicesHealth(req, res);
            break;
          case '/health/metrics':
            await this.handleMetrics(req, res);
            break;
          default:
            res.writeHead(404);
            res.end('Not Found');
        }
      } catch (error) {
        console.error('Health server error:', error);
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });
  }

  private async handleHealthCheck(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const report = await this.healthService.generateHealthReport();
    const responseTime = performance.now() - performance.timeOrigin;

    // Simple health check - return overall status
    const isHealthy = report.summary.unhealthy === 0;
    const statusCode = isHealthy ? 200 : 503;

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime: Math.round(responseTime),
      summary: report.summary
    }));
  }

  private async handleDetailedHealth(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const report = await this.healthService.generateHealthReport();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(report, null, 2));
  }

  private async handleServicesHealth(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const services = this.healthService.getHealthStatus();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      services,
      timestamp: new Date().toISOString()
    }));
  }

  private async handleMetrics(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const status = this.healthService.getHealthStatus();

    // Calculate system-wide metrics
    const totalChecks = Object.values(status).reduce((sum, m) => sum + m.totalChecks, 0);
    const totalFailures = Object.values(status).reduce((sum, m) => sum + m.totalFailures, 0);
    const avgResponseTime = Object.values(status).reduce((sum, m) => sum + m.averageResponseTime, 0) / Object.keys(status).length;

    const metrics = {
      system: {
        totalChecks,
        totalFailures,
        successRate: totalChecks > 0 ? ((totalChecks - totalFailures) / totalChecks) * 100 : 0,
        averageResponseTime: Math.round(avgResponseTime),
        uptime: this.healthService['calculateSystemUptime']()
      },
      services: status,
      timestamp: new Date().toISOString()
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metrics, null, 2));
  }

  public async start(): Promise<void> {
    await this.healthService.start();

    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        console.log(`🏥 Health check server listening on port ${this.port}`);
        console.log(`   Health endpoint: http://localhost:${this.port}/health`);
        console.log(`   Detailed health: http://localhost:${this.port}/health/detailed`);
        console.log(`   Services health: http://localhost:${this.port}/health/services`);
        console.log(`   Metrics: http://localhost:${this.port}/health/metrics`);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  public async stop(): Promise<void> {
    await this.healthService.stop();

    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('🏥 Health check server stopped');
        resolve();
      });
    });
  }
}

// CLI for standalone usage
if (require.main === module) {
  const server = new HealthCheckServer(parseInt(process.argv[2]) || 8080);

  server.start().catch(console.error);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down health check server...');
    await server.stop();
    process.exit(0);
  });
}