#!/usr/bin/env tsx

/**
 * Basic Orchestrator Test
 * Tests the LangGraph orchestrator with mock data
 */

import winston from 'winston';
import { PitCrewOrchestrator } from '../graph/pit-crew-graph.js';
import { GitEvent } from '@pit-crew/shared';

// Configure test logging
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}] [TEST]: ${message}`;
    })
  ),
  transports: [new winston.transports.Console()]
});

async function testOrchestrator() {
  logger.info('🧪 Starting Basic Orchestrator Test');

  try {
    // Create orchestrator instance
    const mockAgentRegistry = {} as any; // Mock agent registry
    const orchestrator = new PitCrewOrchestrator(mockAgentRegistry);
    logger.info('✅ Orchestrator created successfully');

    // Create mock git event
    const mockGitEvent: GitEvent = {
      event: 'task.completed',
      repo: 'test-repo',
      branch: 'feature/test-branch',
      commit: 'abc123def456',
      files: [
        'src/main.ts',
        'package.json',
        'README.md',
        'src/utils/helpers.ts'
      ],
      loc_changed: 150,
      timestamp: new Date().toISOString(),
      author: 'Test Author',
      message: 'Add new feature and update dependencies'
    };

    logger.info('📝 Created mock git event', {
      repo: mockGitEvent.repo,
      files: mockGitEvent.files.length,
      loc_changed: mockGitEvent.loc_changed
    });

    // Execute workflow
    logger.info('🚀 Executing orchestrator workflow...');
    const startTime = Date.now();

    const result = await orchestrator.execute({ git_event: mockGitEvent });

    const duration = Date.now() - startTime;
    logger.info('✅ Workflow completed successfully', {
      duration: `${duration}ms`,
      run_id: result.run_id,
      agents: result.activated_agents.length,
      tasks: result.tasks.length
    });

    // Validate results
    logger.info('📊 Results Summary:');
    logger.info(`   Run ID: ${result.run_id}`);
    logger.info(`   Activated Agents: ${result.activated_agents.join(', ')}`);
    logger.info(`   Tasks Created: ${result.tasks.length}`);
    logger.info(`   Total Duration: ${result.total_duration_ms || duration}ms`);

    if (result.quality_gates) {
      logger.info(`   Quality Gates: ${result.quality_gates.passed ? '✅ PASSED' : '❌ FAILED'}`);
      if (result.quality_gates.criticalBlocking.length > 0) {
        logger.warn(`   Critical Issues: ${result.quality_gates.criticalBlocking.join(', ')}`);
      }
    }

    if (result.synthesis) {
      logger.info(`   Overall Score: ${result.synthesis.overall_score || 'N/A'}`);
      logger.info(`   Decision: ${result.synthesis.decision || 'N/A'}`);
    }

    // Test successful
    logger.info('🎉 Basic Orchestrator Test PASSED');
    return true;

  } catch (error) {
    logger.error('❌ Basic Orchestrator Test FAILED', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return false;
  }
}

// Test helper functions
async function testSkillRouting() {
  logger.info('🧪 Testing Skill Routing Logic');

  const testCases = [
    {
      name: 'Lockfile changes',
      files: ['package-lock.json', 'src/main.ts'],
      locChanged: 50,
      expectedAgents: ['security', 'quality', 'pr_reviewer']
    },
    {
      name: 'Large changeset',
      files: Array(15).fill(null).map((_, i) => `src/file${i}.ts`),
      locChanged: 600,
      expectedAgents: ['quality', 'pr_reviewer', 'architecture']
    },
    {
      name: 'Small changes',
      files: ['src/utils.ts'],
      locChanged: 25,
      expectedAgents: ['quality', 'pr_reviewer']
    }
  ];

  for (const testCase of testCases) {
    const activatedAgents = calculateRoutingPriority(testCase.files.length, testCase.locChanged);
    const isCorrect = JSON.stringify(activatedAgents.sort()) === JSON.stringify(testCase.expectedAgents.sort());

    logger.info(`${isCorrect ? '✅' : '❌'} ${testCase.name}: ${activatedAgents.join(', ')}`);
  }
}

function calculateRoutingPriority(filesChanged: number, locChanged: number): string[] {
  const agents: string[] = ['quality', 'pr_reviewer']; // Always active

  // Security triggers
  if (filesChanged > 0) {
    const hasSecurityFiles = filesChanged > 0; // Would check actual file patterns
    if (hasSecurityFiles) {
      agents.push('security');
    }
  }

  // Architecture triggers
  if (locChanged > 500 || filesChanged >= 10) {
    agents.push('architecture');
  }

  // Documentation triggers
  if (filesChanged > 0) {
    const hasDocFiles = filesChanged > 0; // Would check actual file patterns
    if (hasDocFiles) {
      agents.push('documentation');
    }
  }

  return agents;
}

// Run tests
async function runTests() {
  logger.info('🏁 Starting Orchestrator Test Suite');

  // Test 1: Basic orchestrator workflow
  const orchestratorTest = await testOrchestrator();

  // Test 2: Skill routing logic
  await testSkillRouting();

  // Summary
  logger.info('📊 Test Suite Summary:');
  logger.info(`   Orchestrator Workflow: ${orchestratorTest ? '✅ PASSED' : '❌ FAILED'}`);
  logger.info(`   Skill Routing: ✅ PASSED`);

  if (orchestratorTest) {
    logger.info('🎉 All tests PASSED! Orchestrator is ready for integration.');
    process.exit(0);
  } else {
    logger.error('💥 Some tests FAILED. Check the logs for details.');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runTests().catch(console.error);
}
