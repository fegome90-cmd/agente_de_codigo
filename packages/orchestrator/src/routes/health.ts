/**
 * Health Check Routes for Orchestrator
 * Provides health status endpoints for the orchestrator service
 */

import { Router, Request, Response } from 'express';
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import * as os from 'os';
import * as process from 'process';

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    [key: string]: {
      status: 'pass' | 'fail' | 'warn';
      description: string;
      responseTime?: number;
      details?: any;
    };
  };
}

interface DependencyCheck {
  name: string;
  type: 'internal' | 'external';
  check: () => Promise<boolean>;
  timeout: number;
  critical: boolean;
}

export class HealthService extends EventEmitter {
  private dependencies: Map<string, DependencyCheck> = new Map();
  private startTime: number = Date.now();
  private status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
  private version: string;

  constructor(version: string = '1.0.0') {
    super();
    this.version = version;
    this.setupDefaultDependencies();
  }

  private setupDefaultDependencies(): void {
    // Internal dependencies
    this.addDependency({
      name: 'memory',
      type: 'internal',
      critical: true,
      timeout: 1000,
      check: async () => {
        const usage = process.memoryUsage();
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const memoryUsagePercent = (usedMemory / totalMemory) * 100;

        return memoryUsagePercent < 90; // Fail if memory usage > 90%
      }
    });

    this.addDependency({
      name: 'disk',
      type: 'internal',
      critical: true,
      timeout: 1000,
      check: async () => {
        // Simple disk space check (would need fs-extra or similar for real implementation)
        return true; // Placeholder
      }
    });

    this.addDependency({
      name: 'cpu',
      type: 'internal',
      critical: false,
      timeout: 1000,
      check: async () => {
        const loadAvg = os.loadavg()[0];
        const cpuCount = os.cpus().length;
        const loadPercent = (loadAvg / cpuCount) * 100;

        return loadPercent < 80; // Warn if CPU load > 80%
      }
    });

    // External dependencies
    this.addDependency({
      name: 'redis',
      type: 'external',
      critical: true,
      timeout: 3000,
      check: async () => {
        try {
          // Check Redis connection (would need redis client)
          return true; // Placeholder
        } catch {
          return false;
        }
      }
    });

    this.addDependency({
      name: 'database',
      type: 'external',
      critical: true,
      timeout: 5000,
      check: async () => {
        try {
          // Check database connection (would need database client)
          return true; // Placeholder
        } catch {
          return false;
        }
      }
    });

    this.addDependency({
      name: 'agents',
      type: 'external',
      critical: false,
      timeout: 10000,
      check: async () => {
        try {
          // Check if agents are responsive
          return true; // Placeholder
        } catch {
          return false;
        }
      }
    });
  }

  public addDependency(dependency: DependencyCheck): void {
    this.dependencies.set(dependency.name, dependency);
  }

  public async checkHealth(): Promise<HealthStatus> {
    const checks: { [key: string]: any } = {};
    let hasFailures = false;
    let hasWarnings = false;

    for (const [name, dependency] of this.dependencies) {
      const startTime = performance.now();
      let status: 'pass' | 'fail' | 'warn';
      let details: any;

      try {
        const result = await Promise.race([
          dependency.check(),
          new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), dependency.timeout)
          )
        ]);

        status = result ? 'pass' : 'fail';
        if (!result) {
          hasFailures = true;
          if (dependency.critical) {
            this.status = 'unhealthy';
          } else {
            hasWarnings = true;
          }
        }

        details = { success: result };
      } catch (error) {
        status = 'fail';
        details = {
          error: error instanceof Error ? error.message : 'Unknown error',
          type: dependency.type
        };

        hasFailures = true;
        if (dependency.critical) {
          this.status = 'unhealthy';
        } else {
          hasWarnings = true;
        }
      }

      const responseTime = performance.now() - startTime;

      checks[name] = {
        status,
        description: this.getDependencyDescription(name),
        responseTime: Math.round(responseTime),
        details
      };
    }

    // Update overall status
    if (hasFailures) {
      this.status = 'unhealthy';
    } else if (hasWarnings) {
      this.status = 'degraded';
    } else {
      this.status = 'healthy';
    }

    const uptime = Date.now() - this.startTime;

    return {
      status: this.status,
      timestamp: new Date().toISOString(),
      uptime,
      version: this.version,
      checks
    };
  }

  private getDependencyDescription(name: string): string {
    const descriptions: { [key: string]: string } = {
      memory: 'System memory usage',
      disk: 'Disk space availability',
      cpu: 'CPU load average',
      redis: 'Redis connection',
      database: 'Database connection',
      agents: 'Agent service availability'
    };
    return descriptions[name] || `${name} dependency check`;
  }

  public async getSystemMetrics(): Promise<any> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const loadAvg = os.loadavg();
    const cpus = os.cpus();

    return {
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memory: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external,
          arrayBuffers: memUsage.arrayBuffers
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        }
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        uptime: os.uptime(),
        loadAverage: loadAvg,
        cpus: cpus.length,
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem()
        }
      }
    };
  }
}

export function createHealthRoutes(healthService: HealthService): Router {
  const router = Router();

  // Basic health check
  router.get('/health', async (req: Request, res: Response) => {
    try {
      const health = await healthService.checkHealth();
      const statusCode = health.status === 'healthy' ? 200 :
                       health.status === 'degraded' ? 200 : 503;

      res.status(statusCode).json({
        status: health.status,
        timestamp: health.timestamp,
        uptime: health.uptime,
        version: health.version
      });
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed'
      });
    }
  });

  // Detailed health check
  router.get('/health/detailed', async (req: Request, res: Response) => {
    try {
      const health = await healthService.checkHealth();
      const metrics = await healthService.getSystemMetrics();
      const statusCode = health.status === 'healthy' ? 200 :
                       health.status === 'degraded' ? 200 : 503;

      res.status(statusCode).json({
        ...health,
        metrics
      });
    } catch (error) {
      console.error('Detailed health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Detailed health check failed'
      });
    }
  });

  // Readiness probe (for Kubernetes)
  router.get('/health/ready', async (req: Request, res: Response) => {
    try {
      const health = await healthService.checkHealth();
      const isReady = health.status !== 'unhealthy' &&
                     Object.values(health.checks)
                       .filter(check => healthService.dependencies.get(Object.keys(health.checks).find(k => health.checks[k] === check))?.critical)
                       .every(check => check.status === 'pass');

      if (isReady) {
        res.status(200).json({
          status: 'ready',
          timestamp: health.timestamp,
          checks: health.checks
        });
      } else {
        res.status(503).json({
          status: 'not ready',
          timestamp: health.timestamp,
          checks: health.checks
        });
      }
    } catch (error) {
      console.error('Readiness check failed:', error);
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        error: 'Readiness check failed'
      });
    }
  });

  // Liveness probe (for Kubernetes)
  router.get('/health/live', async (req: Request, res: Response) => {
    try {
      const health = await healthService.checkHealth();
      const isAlive = health.status !== 'unhealthy';

      if (isAlive) {
        res.status(200).json({
          status: 'alive',
          timestamp: health.timestamp,
          uptime: health.uptime
        });
      } else {
        res.status(503).json({
          status: 'not alive',
          timestamp: health.timestamp,
          uptime: health.uptime
        });
      }
    } catch (error) {
      console.error('Liveness check failed:', error);
      res.status(503).json({
        status: 'not alive',
        timestamp: new Date().toISOString(),
        error: 'Liveness check failed'
      });
    }
  });

  // System metrics
  router.get('/health/metrics', async (req: Request, res: Response) => {
    try {
      const metrics = await healthService.getSystemMetrics();
      const health = await healthService.checkHealth();

      res.json({
        timestamp: new Date().toISOString(),
        health,
        metrics
      });
    } catch (error) {
      console.error('Metrics collection failed:', error);
      res.status(500).json({
        timestamp: new Date().toISOString(),
        error: 'Metrics collection failed'
      });
    }
  });

  return router;
}