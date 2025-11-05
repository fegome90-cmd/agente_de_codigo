/**
 * Main entry point for Observability Agent
 * Integrates metrics collection, tracing, alerting, and health monitoring
 */

import { ObservabilityAgent } from './observability-agent.js';
import { logger } from './simple-logger.js';

async function main() {
  const args = process.argv.slice(2);
  const socketPath = process.env.SOCKET_PATH || '/tmp/pit-crew-orchestrator.sock';

  const agent = new ObservabilityAgent(socketPath);

  try {
    console.log('🚀 Starting Observability Agent...');
    console.log(`📡 Connecting to orchestrator via: ${socketPath}`);
    console.log(`🔍 Monitoring endpoints:`);
    console.log(`   - Metrics: http://localhost:9090/metrics`);
    console.log(`   - Health: http://localhost:9090/health`);
    console.log(`   - Alerts: http://localhost:9090/alerts`);

    await agent.start();

    console.log('✅ Observability Agent started successfully');
    console.log('📊 Ready to collect metrics and monitor system health');

    // Keep the process running
    process.on('SIGINT', async () => {
      console.log('\n🛑 Received SIGINT, shutting down gracefully...');
      await agent.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
      await agent.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start Observability Agent:', error);
    process.exit(1);
  }
}

// Start the agent
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ObservabilityAgent } from './observability-agent.js';
export { default as MetricsCollector } from './metrics-collector.js';
export { default as TraceManager } from './trace-manager.js';
export { default as AlertingSystem } from './alerting-system.js';
export * from './types.js';
