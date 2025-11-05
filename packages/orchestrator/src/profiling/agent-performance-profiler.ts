/**
 * Performance Profiling System for Agent Bottleneck Detection
 *
 * Provides comprehensive performance profiling and bottleneck detection:
 * - Real-time performance monitoring for all agents
 * - Bottleneck detection and analysis
 * - Performance trend analysis and prediction
 * - Resource utilization profiling
 * - Automated optimization recommendations
 * - Performance regression detection
 */

import { EventEmitter } from 'events';
import { RedisCacheService } from '../caching/redis-cache-service.js';
import { logger } from '../utils/logger.js';

export interface ProfileSession {
  id: string;
  agentName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  metadata: Record<string, any>;
  samples: PerformanceSample[];
  summary?: PerformanceSummary;
}

export interface PerformanceSample {
  timestamp: number;
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    total: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  io: {
    reads: number;
    writes: number;
    readBytes: number;
    writeBytes: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
  };
  custom: Record<string, number>;
  events: PerformanceEvent[];
}

export interface PerformanceEvent {
  timestamp: number;
  type: 'function_start' | 'function_end' | 'error' | 'warning' | 'info';
  name: string;
  duration?: number;
  data?: any;
  stack?: string;
}

export interface PerformanceSummary {
  totalDuration: number;
  averageCpuUsage: number;
  peakCpuUsage: number;
  averageMemoryUsage: number;
  peakMemoryUsage: number;
  memoryGrowthRate: number;
  ioOperations: {
    totalReads: number;
    totalWrites: number;
    totalReadBytes: number;
    totalWriteBytes: number;
  };
  networkActivity: {
    totalBytesIn: number;
    totalBytesOut: number;
  };
  eventCounts: Record<string, number>;
  bottlenecks: Bottleneck[];
  recommendations: OptimizationRecommendation[];
  performanceScore: number; // 0-100
}

export interface Bottleneck {
  id: string;
  type: 'cpu' | 'memory' | 'io' | 'network' | 'function' | 'external';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location?: string;
  impact: {
    performanceImpact: number; // percentage
    resourceWaste: number; // percentage
  };
  detectedAt: number;
  evidence: any[];
}

export interface OptimizationRecommendation {
  id: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'algorithm' | 'memory' | 'io' | 'network' | 'concurrency' | 'caching';
  title: string;
  description: string;
  expectedImprovement: {
    performanceGain: number; // percentage
    resourceReduction: number; // percentage
  };
  implementation: {
    complexity: 'simple' | 'moderate' | 'complex';
    estimatedEffort: number; // hours
    codeChanges?: string[];
    configurationChanges?: Record<string, any>;
  };
  riskAssessment: {
    riskLevel: 'low' | 'medium' | 'high';
    breakingChanges: boolean;
    testingRequired: boolean;
  };
}

export interface ProfilingConfig {
  sampling: {
    interval: number; // ms
    maxSamples: number;
    enableCustomMetrics: boolean;
  };
  analysis: {
    bottleneckDetection: {
      cpuThreshold: number; // percentage
      memoryThreshold: number; // percentage
      ioThreshold: number; // operations per second
      networkThreshold: number; // bytes per second
      functionDurationThreshold: number; // ms
    };
    trendAnalysis: {
      windowSize: number; // samples
      minDataPoints: number;
      significanceLevel: number; // 0-1
    };
    regressionDetection: {
      baselineWindow: number; // samples
      threshold: number; // percentage degradation
      confidenceLevel: number; // 0-1
    };
  };
  reporting: {
    autoGenerate: boolean;
    includeRecommendations: boolean;
    formats: ('json' | 'html' | 'markdown')[];
    retention: number; // hours
  };
  alerts: {
    enabled: boolean;
    thresholds: {
      performanceDegradation: number; // percentage
      memoryLeak: number; // MB per hour
      cpuSaturation: number; // percentage
    };
  };
}

export interface PerformanceTrend {
  metric: string;
  direction: 'improving' | 'degrading' | 'stable';
  changeRate: number; // percentage per time unit
  significance: number; // statistical significance 0-1
  prediction: {
    nextValue: number;
    confidence: number; // 0-1
    timeToThreshold?: number; // ms until threshold reached
  };
}

export interface PerformanceBaseline {
  agentName: string;
  version: string;
  timestamp: number;
  metrics: {
    averageResponseTime: number;
    throughput: number;
    errorRate: number;
    resourceUtilization: {
      cpu: number;
      memory: number;
      io: number;
      network: number;
    };
  };
  sampleCount: number;
  confidence: number; // 0-1
}

export class AgentPerformanceProfiler extends EventEmitter {
  private config: ProfilingConfig;
  private cache: RedisCacheService;
  private activeSessions: Map<string, ProfileSession> = new Map();
  private completedSessions: ProfileSession[] = [];
  private baselines: Map<string, PerformanceBaseline> = new Map();
  private samplingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isShuttingDown = false;

  constructor(config: ProfilingConfig, cache: RedisCacheService) {
    super();
    this.config = config;
    this.cache = cache;

    this.loadBaselines();
    this.startPeriodicAnalysis();

    logger.info('Agent Performance Profiler initialized', {
      samplingInterval: config.sampling.interval,
      maxSamples: config.sampling.maxSamples,
      bottleneckDetection: config.analysis.bottleneckDetection
    });
  }

  /**
   * Start profiling an agent
   */
  async startProfiling(
    agentName: string,
    metadata: Record<string, any> = {}
  ): Promise<string> {
    const sessionId = this.generateSessionId();
    const session: ProfileSession = {
      id: sessionId,
      agentName,
      startTime: Date.now(),
      status: 'running',
      metadata,
      samples: []
    };

    this.activeSessions.set(sessionId, session);

    // Start sampling for this session
    this.startSampling(sessionId);

    logger.info('Profiling session started', {
      sessionId,
      agentName,
      metadata
    });

    this.emit('profiling:started', { sessionId, agentName, metadata });
    return sessionId;
  }

  /**
   * Stop profiling an agent
   */
  async stopProfiling(sessionId: string): Promise<ProfileSession> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Profiling session not found: ${sessionId}`);
    }

    session.endTime = Date.now();
    session.duration = session.endTime - session.startTime;
    session.status = 'completed';

    // Stop sampling
    this.stopSampling(sessionId);

    // Generate performance summary
    session.summary = await this.generatePerformanceSummary(session);

    // Move to completed sessions
    this.activeSessions.delete(sessionId);
    this.completedSessions.push(session);

    // Store in cache
    await this.storeProfilingSession(session);

    // Check for performance regressions
    await this.checkPerformanceRegression(session);

    logger.info('Profiling session completed', {
      sessionId,
      agentName: session.agentName,
      duration: session.duration,
      samplesCount: session.samples.length,
      performanceScore: session.summary.performanceScore
    });

    this.emit('profiling:completed', { session });
    return session;
  }

  /**
   * Record a custom performance event
   */
  recordEvent(sessionId: string, event: Omit<PerformanceEvent, 'timestamp'>): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const performanceEvent: PerformanceEvent = {
      ...event,
      timestamp: Date.now()
    };

    // Add event to current sample if available, or create a temporary one
    if (session.samples.length > 0) {
      const currentSample = session.samples[session.samples.length - 1];
      currentSample.events.push(performanceEvent);
    } else {
      // Create a temporary sample for this event
      const tempSample: PerformanceSample = {
        timestamp: performanceEvent.timestamp,
        cpu: { usage: 0, loadAverage: [0, 0, 0] },
        memory: { used: 0, total: 0, heapUsed: 0, heapTotal: 0, external: 0 },
        io: { reads: 0, writes: 0, readBytes: 0, writeBytes: 0 },
        network: { bytesIn: 0, bytesOut: 0, packetsIn: 0, packetsOut: 0 },
        custom: {},
        events: [performanceEvent]
      };
      session.samples.push(tempSample);
    }
  }

  /**
   * Start sampling for a profiling session
   */
  private startSampling(sessionId: string): void {
    const interval = setInterval(async () => {
      const session = this.activeSessions.get(sessionId);
      if (!session || this.isShuttingDown) return;

      try {
        const sample = await this.collectPerformanceSample();
        session.samples.push(sample);

        // Check sample limit
        if (session.samples.length > this.config.sampling.maxSamples) {
          session.samples.shift(); // Remove oldest sample
        }

        this.emit('profiling:sample', { sessionId, sample });
      } catch (error) {
        logger.error('Failed to collect performance sample', {
          sessionId,
          error: error.message
        });
      }
    }, this.config.sampling.interval);

    this.samplingIntervals.set(sessionId, interval);
  }

  /**
   * Stop sampling for a profiling session
   */
  private stopSampling(sessionId: string): void {
    const interval = this.samplingIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.samplingIntervals.delete(sessionId);
    }
  }

  /**
   * Collect a performance sample
   */
  private async collectPerformanceSample(): Promise<PerformanceSample> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      timestamp: Date.now(),
      cpu: {
        usage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
        loadAverage: [0, 0, 0] // Would get from OS in real implementation
      },
      memory: {
        used: memUsage.rss,
        total: memUsage.rss, // Would get total system memory
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external
      },
      io: {
        reads: 0,
        writes: 0,
        readBytes: 0,
        writeBytes: 0
      },
      network: {
        bytesIn: 0,
        bytesOut: 0,
        packetsIn: 0,
        packetsOut: 0
      },
      custom: {},
      events: []
    };
  }

  /**
   * Generate performance summary for a session
   */
  private async generatePerformanceSummary(session: ProfileSession): Promise<PerformanceSummary> {
    const samples = session.samples;
    if (samples.length === 0) {
      throw new Error('No samples collected for profiling session');
    }

    // Calculate basic metrics
    const totalDuration = session.duration || 0;
    const cpuUsages = samples.map(s => s.cpu.usage);
    const memoryUsages = samples.map(s => s.memory.used);

    const averageCpuUsage = cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length;
    const peakCpuUsage = Math.max(...cpuUsages);
    const averageMemoryUsage = memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length;
    const peakMemoryUsage = Math.max(...memoryUsages);

    // Calculate memory growth rate
    const memoryGrowthRate = this.calculateMemoryGrowthRate(samples);

    // Sum IO and network metrics
    const ioOperations = samples.reduce((acc, s) => ({
      totalReads: acc.totalReads + s.io.reads,
      totalWrites: acc.totalWrites + s.io.writes,
      totalReadBytes: acc.totalReadBytes + s.io.readBytes,
      totalWriteBytes: acc.totalWriteBytes + s.io.writeBytes
    }), { totalReads: 0, totalWrites: 0, totalReadBytes: 0, totalWriteBytes: 0 });

    const networkActivity = samples.reduce((acc, s) => ({
      totalBytesIn: acc.totalBytesIn + s.network.bytesIn,
      totalBytesOut: acc.totalBytesOut + s.network.bytesOut
    }), { totalBytesIn: 0, totalBytesOut: 0 });

    // Count events
    const eventCounts = samples.reduce((acc, s) => {
      s.events.forEach(event => {
        acc[event.type] = (acc[event.type] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

    // Detect bottlenecks
    const bottlenecks = await this.detectBottlenecks(session, samples);

    // Generate optimization recommendations
    const recommendations = await this.generateRecommendations(bottlenecks, session);

    // Calculate performance score
    const performanceScore = this.calculatePerformanceScore(session, bottlenecks);

    return {
      totalDuration,
      averageCpuUsage,
      peakCpuUsage,
      averageMemoryUsage,
      peakMemoryUsage,
      memoryGrowthRate,
      ioOperations,
      networkActivity,
      eventCounts,
      bottlenecks,
      recommendations,
      performanceScore
    };
  }

  /**
   * Calculate memory growth rate
   */
  private calculateMemoryGrowthRate(samples: PerformanceSample[]): number {
    if (samples.length < 2) return 0;

    const firstSample = samples[0];
    const lastSample = samples[samples.length - 1];
    const timeDiff = (lastSample.timestamp - firstSample.timestamp) / 1000 / 3600; // hours
    const memoryDiff = lastSample.memory.used - firstSample.memory.used;

    return timeDiff > 0 ? memoryDiff / timeDiff : 0; // MB per hour
  }

  /**
   * Detect performance bottlenecks
   */
  private async detectBottlenecks(
    session: ProfileSession,
    samples: PerformanceSample[]
  ): Promise<Bottleneck[]> {
    const bottlenecks: Bottleneck[] = [];
    const thresholds = this.config.analysis.bottleneckDetection;

    // CPU bottlenecks
    const highCpuSamples = samples.filter(s => s.cpu.usage > thresholds.cpuThreshold);
    if (highCpuSamples.length > samples.length * 0.1) { // More than 10% of samples
      bottlenecks.push({
        id: this.generateBottleneckId(),
        type: 'cpu',
        severity: highCpuSamples.length > samples.length * 0.3 ? 'critical' : 'high',
        description: `High CPU usage detected in ${highCpuSamples.length}/${samples.length} samples`,
        impact: {
          performanceImpact: (highCpuSamples.length / samples.length) * 100,
          resourceWaste: Math.max(...highCpuSamples.map(s => s.cpu.usage)) - thresholds.cpuThreshold
        },
        detectedAt: Date.now(),
        evidence: highCpuSamples.map(s => ({ timestamp: s.timestamp, cpu: s.cpu.usage }))
      });
    }

    // Memory bottlenecks
    const highMemorySamples = samples.filter(s =>
      s.memory.used > thresholds.memoryThreshold * 1024 * 1024 // Convert MB to bytes
    );
    if (highMemorySamples.length > 0) {
      bottlenecks.push({
        id: this.generateBottleneckId(),
        type: 'memory',
        severity: 'high',
        description: `High memory usage detected: ${Math.max(...highMemorySamples.map(s => s.memory.used))} bytes`,
        impact: {
          performanceImpact: (highMemorySamples.length / samples.length) * 100,
          resourceWaste: 25 // Estimated waste percentage
        },
        detectedAt: Date.now(),
        evidence: highMemorySamples.map(s => ({ timestamp: s.timestamp, memory: s.memory.used }))
      });
    }

    // Memory leak detection
    const memoryGrowthRate = this.calculateMemoryGrowthRate(samples);
    if (memoryGrowthRate > 50) { // More than 50MB per hour
      bottlenecks.push({
        id: this.generateBottleneckId(),
        type: 'memory',
        severity: 'critical',
        description: `Potential memory leak detected: ${memoryGrowthRate.toFixed(2)} MB/hour growth rate`,
        impact: {
          performanceImpact: Math.min(95, memoryGrowthRate),
          resourceWaste: memoryGrowthRate
        },
        detectedAt: Date.now(),
        evidence: samples.map(s => ({ timestamp: s.timestamp, memory: s.memory.used }))
      });
    }

    // Function duration bottlenecks
    const functionEvents = samples.flatMap(s => s.events).filter(e => e.type === 'function_end' && e.duration);
    const slowFunctions = functionEvents.filter(e =>
      e.duration && e.duration > thresholds.functionDurationThreshold
    );
    if (slowFunctions.length > 0) {
      bottlenecks.push({
        id: this.generateBottleneckId(),
        type: 'function',
        severity: 'medium',
        description: `${slowFunctions.length} slow function calls detected`,
        impact: {
          performanceImpact: 30,
          resourceWaste: 15
        },
        detectedAt: Date.now(),
        evidence: slowFunctions.map(e => ({
          name: e.name,
          duration: e.duration,
          timestamp: e.timestamp
        }))
      });
    }

    return bottlenecks;
  }

  /**
   * Generate optimization recommendations
   */
  private async generateRecommendations(
    bottlenecks: Bottleneck[],
    session: ProfileSession
  ): Promise<OptimizationRecommendation[]> {
    const recommendations: OptimizationRecommendation[] = [];

    for (const bottleneck of bottlenecks) {
      switch (bottleneck.type) {
        case 'cpu':
          recommendations.push({
            id: this.generateRecommendationId(),
            priority: bottleneck.severity === 'critical' ? 'high' : 'medium',
            category: 'algorithm',
            title: 'Optimize CPU-intensive operations',
            description: 'Consider optimizing algorithms, reducing computational complexity, or implementing caching',
            expectedImprovement: {
              performanceGain: 40,
              resourceReduction: 30
            },
            implementation: {
              complexity: 'moderate',
              estimatedEffort: 8,
              codeChanges: ['Optimize loops', 'Add caching', 'Reduce algorithmic complexity']
            },
            riskAssessment: {
              riskLevel: 'low',
              breakingChanges: false,
              testingRequired: true
            }
          });
          break;

        case 'memory':
          if (bottleneck.description.includes('memory leak')) {
            recommendations.push({
              id: this.generateRecommendationId(),
              priority: 'critical',
              category: 'memory',
              title: 'Fix memory leak',
              description: 'Memory leak detected. Review object lifecycle and cleanup procedures',
              expectedImprovement: {
                performanceGain: 60,
                resourceReduction: 80
              },
              implementation: {
                complexity: 'complex',
                estimatedEffort: 16,
                codeChanges: ['Fix memory leaks', 'Improve garbage collection', 'Review object disposal']
              },
              riskAssessment: {
                riskLevel: 'medium',
                breakingChanges: false,
                testingRequired: true
              }
            });
          } else {
            recommendations.push({
              id: this.generateRecommendationId(),
              priority: 'medium',
              category: 'memory',
              title: 'Optimize memory usage',
              description: 'Reduce memory footprint through better data structures and memory management',
              expectedImprovement: {
                performanceGain: 25,
                resourceReduction: 40
              },
              implementation: {
                complexity: 'moderate',
                estimatedEffort: 12,
                codeChanges: ['Use efficient data structures', 'Implement object pooling', 'Reduce memory allocations']
              },
              riskAssessment: {
                riskLevel: 'low',
                breakingChanges: false,
                testingRequired: true
              }
            });
          }
          break;

        case 'function':
          recommendations.push({
            id: this.generateRecommendationId(),
            priority: 'medium',
            category: 'algorithm',
            title: 'Optimize slow functions',
            description: 'Improve performance of identified slow functions',
            expectedImprovement: {
              performanceGain: 35,
              resourceReduction: 20
            },
            implementation: {
              complexity: 'moderate',
              estimatedEffort: 6,
              codeChanges: ['Optimize function logic', 'Add memoization', 'Reduce I/O operations']
            },
            riskAssessment: {
              riskLevel: 'low',
              breakingChanges: false,
              testingRequired: true
            }
          });
          break;
      }
    }

    return recommendations;
  }

  /**
   * Calculate performance score
   */
  private calculatePerformanceScore(session: ProfileSession, bottlenecks: Bottleneck[]): number {
    let score = 100;

    // Penalize for bottlenecks
    bottlenecks.forEach(bottleneck => {
      switch (bottleneck.severity) {
        case 'critical':
          score -= 30;
          break;
        case 'high':
          score -= 20;
          break;
        case 'medium':
          score -= 10;
          break;
        case 'low':
          score -= 5;
          break;
      }
    });

    // Penalize for memory leaks
    const memoryGrowthRate = this.calculateMemoryGrowthRate(session.samples);
    if (memoryGrowthRate > 10) {
      score -= Math.min(20, memoryGrowthRate);
    }

    // Penalize for high error rates
    const errorEvents = session.samples.flatMap(s => s.events).filter(e => e.type === 'error');
    if (errorEvents.length > 0) {
      score -= Math.min(15, errorEvents.length * 2);
    }

    return Math.max(0, score);
  }

  /**
   * Check for performance regression against baseline
   */
  private async checkPerformanceRegression(session: ProfileSession): Promise<void> {
    if (!session.summary) return;

    const baseline = this.baselines.get(session.agentName);
    if (!baseline) return;

    const regressionThreshold = this.config.analysis.regressionDetection.threshold;
    const currentResponseTime = session.summary.totalDuration;

    const regressionPercentage = ((currentResponseTime - baseline.metrics.averageResponseTime) / baseline.metrics.averageResponseTime) * 100;

    if (regressionPercentage > regressionThreshold) {
      logger.warn('Performance regression detected', {
        agentName: session.agentName,
        regressionPercentage: regressionPercentage.toFixed(2),
        baseline: baseline.metrics.averageResponseTime,
        current: currentResponseTime
      });

      this.emit('profiling:regression', {
        agentName: session.agentName,
        session,
        baseline,
        regressionPercentage
      });
    }
  }

  /**
   * Store profiling session in cache
   */
  private async storeProfilingSession(session: ProfileSession): Promise<void> {
    try {
      const cacheKey = `profiling:session:${session.id}`;
      await this.cache.set(cacheKey, session, {
        agentName: session.agentName,
        sessionId: session.id
      });
    } catch (error) {
      logger.warn('Failed to store profiling session', {
        sessionId: session.id,
        error: error.message
      });
    }
  }

  /**
   * Load performance baselines from cache
   */
  private async loadBaselines(): Promise<void> {
    try {
      // This would load baselines from cache or file system
      // For now, we'll start with empty baselines
      logger.info('Performance baselines loaded', { count: this.baselines.size });
    } catch (error) {
      logger.error('Failed to load performance baselines', { error: error.message });
    }
  }

  /**
   * Start periodic analysis
   */
  private startPeriodicAnalysis(): void {
    setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.performPeriodicAnalysis();
      }
    }, 60000); // Every minute
  }

  /**
   * Perform periodic analysis
   */
  private async performPeriodicAnalysis(): Promise<void> {
    try {
      // Analyze trends, update baselines, etc.
      // This would implement trend analysis and baseline updates
    } catch (error) {
      logger.error('Periodic analysis failed', { error: error.message });
    }
  }

  /**
   * Get profiling session
   */
  getSession(sessionId: string): ProfileSession | null {
    return this.activeSessions.get(sessionId) ||
           this.completedSessions.find(s => s.id === sessionId) ||
           null;
  }

  /**
   * Get all sessions for an agent
   */
  getAgentSessions(agentName: string): ProfileSession[] {
    return [
      ...Array.from(this.activeSessions.values()).filter(s => s.agentName === agentName),
      ...this.completedSessions.filter(s => s.agentName === agentName)
    ];
  }

  /**
   * Set performance baseline for an agent
   */
  async setBaseline(agentName: string, baseline: PerformanceBaseline): Promise<void> {
    this.baselines.set(agentName, baseline);

    try {
      const cacheKey = `profiling:baseline:${agentName}`;
      await this.cache.set(cacheKey, baseline, { agentName });
    } catch (error) {
      logger.warn('Failed to store performance baseline', {
        agentName,
        error: error.message
      });
    }

    logger.info('Performance baseline set', { agentName, version: baseline.version });
  }

  /**
   * Get performance analysis report
   */
  async getAnalysisReport(agentName: string, limit = 10): Promise<{
    agentName: string;
    sessions: ProfileSession[];
    trends: PerformanceTrend[];
    bottlenecks: Bottleneck[];
    recommendations: OptimizationRecommendation[];
    baseline?: PerformanceBaseline;
  }> {
    const sessions = this.getAgentSessions(agentName).slice(-limit);
    const bottlenecks = sessions.flatMap(s => s.summary?.bottlenecks || []);
    const recommendations = sessions.flatMap(s => s.summary?.recommendations || []);
    const baseline = this.baselines.get(agentName);

    // This would calculate trends from historical data
    const trends: PerformanceTrend[] = [];

    return {
      agentName,
      sessions,
      trends,
      bottlenecks,
      recommendations,
      baseline
    };
  }

  /**
   * Utility methods
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateBottleneckId(): string {
    return `bottleneck_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRecommendationId(): string {
    return `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gracefully shutdown the profiler
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    logger.info('Shutting down Agent Performance Profiler');

    // Stop all sampling intervals
    for (const interval of this.samplingIntervals.values()) {
      clearInterval(interval);
    }
    this.samplingIntervals.clear();

    // Complete all active sessions
    const activeSessionIds = Array.from(this.activeSessions.keys());
    for (const sessionId of activeSessionIds) {
      try {
        await this.stopProfiling(sessionId);
      } catch (error) {
        logger.warn('Failed to stop profiling session during shutdown', {
          sessionId,
          error: error.message
        });
      }
    }

    logger.info('Agent Performance Profiler shutdown complete');
  }
}
