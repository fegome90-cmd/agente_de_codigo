/**
 * Main entry point for PR Reviewer Agent (Simplified Version)
 * Meta-agent that synthesizes findings from other agents
 */

import { SimplePRReviewerAgent } from './simple-pr-reviewer-agent.js';
import { runDemo } from './demo.js';

async function main() {
  const args = process.argv.slice(2);

  // Check if demo mode is requested
  if (args.includes('--demo') || args.includes('-d')) {
    console.log('🎬 Running PR Reviewer Agent Demo...');
    await runDemo();
    return;
  }

  const socketPath = process.env.SOCKET_PATH || '/tmp/pit-crew-orchestrator.sock';

  const agent = new SimplePRReviewerAgent(socketPath);

  try {
    console.log('🚀 Starting Simplified PR Reviewer Agent...');
    console.log(`📡 Connecting to orchestrator via: ${socketPath}`);

    await agent.start();

  } catch (error) {
    console.error('❌ Failed to start PR Reviewer Agent:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the agent
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { SimplePRReviewerAgent } from './simple-pr-reviewer-agent.js';
export { runDemo } from './demo.js';
export * from './types.js';
export * from './socket-client.js';
export * from './simple-logger.js';