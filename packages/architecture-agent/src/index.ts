#!/usr/bin/env node

/**
 * Architecture Agent - Entry Point
 * Main entry point for the Architecture Agent
 */

import { ArchitectureAgent } from './architecture-agent.js';
import { logger } from './utils/logger.js';

/**
 * Main function to start the Architecture Agent
 */
async function main(): Promise<void> {
  const agent = new ArchitectureAgent();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('🛑 Received SIGINT, shutting down gracefully');
    agent.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('🛑 Received SIGTERM, shutting down gracefully');
    agent.stop();
    process.exit(0);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    agent.stop();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    agent.stop();
    process.exit(1);
  });

  try {
    await agent.start();
  } catch (error) {
    logger.error('Failed to start Architecture Agent:', error);
    process.exit(1);
  }
}

// Start the agent if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Failed to start Architecture Agent:', error);
    process.exit(1);
  });
}

export { ArchitectureAgent };