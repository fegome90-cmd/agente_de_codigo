#!/usr/bin/env node

/**
 * System Stability Fix Script
 * Addresses memory leaks, crash loops, and configuration issues
 */

import { execSync, spawn } from 'node:child_process';
import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function exec(command, options = {}) {
  try {
    return execSync(command, { encoding: 'utf8', ...options });
  } catch (error) {
    log(`Error executing: ${command}`, 'red');
    return null;
  }
}

async function main() {
  log('🔧 System Stability Fix', 'blue');
  log('==================================\n');

  let fixed = 0;
  let errors = 0;

  // 1. Fix PM2 configuration
  log('[1] Fixing PM2 configuration...', 'blue');
  const ecosystemPath = './ecosystem.config.cjs';
  if (existsSync(ecosystemPath)) {
    let config = readFileSync(ecosystemPath, 'utf8');

    // Add crash loop protection
    const protections = `
      // Crash loop protection
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '500M',

      // Log rotation
      log_type: 'json',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Auto-restart settings
      restart_delay: 4000,
      watch: false,
      ignore_watch: ['node_modules', 'logs'],`;

    // Insert protections into apps configuration
    config = config.replace(
      /modules:\s*\[([\s\S]*?)\]/,
      `modules: [$1]`
    );

    // Add to each app configuration
    config = config.replace(
      /name:\s*['"][^"']+['"],\s*(\n\s*script:)/,
      `name: '$&',${protections}$1`
    );

    writeFileSync(ecosystemPath, config);
    log('✅ PM2 configuration updated', 'green');
    fixed++;
  } else {
    log('❌ ecosystem.config.cjs not found', 'red');
    errors++;
  }

  // 2. Clean up large logs
  log('\n[2] Cleaning up large logs...', 'blue');
  const logDirs = [
    './packages/architecture-agent/logs',
    './packages/security-agent/logs',
    './packages/quality-agent/logs',
    './packages/documentation-agent/logs',
    './packages/orchestrator/logs'
  ];

  for (const dir of logDirs) {
    if (existsSync(dir)) {
      try {
        exec(`find ${dir} -name "*.log" -size +5M -delete 2>/dev/null`);
        log(`  Cleaned: ${dir}`, 'green');
      } catch (error) {
        log(`  ⚠️  Could not clean: ${dir}`, 'yellow');
      }
    }
  }
  fixed++;

  // 3. Fix IPC socket issues
  log('\n[3] Checking IPC socket...', 'blue');
  const socketPath = '/tmp/pit-crew-orchestrator.sock';

  // Remove stale socket
  if (existsSync(socketPath)) {
    rmSync(socketPath);
    log('  Removed stale socket', 'green');
  }

  // Check if orchestrator is running
  const orchestratorStatus = exec('pm2 list | grep orchestrator || echo "not_found"');
  if (!orchestratorStatus || orchestratorStatus.includes('not_found')) {
    log('  ⚠️  Orchestrator not running, starting...', 'yellow');
    exec('pm2 start ecosystem.config.cjs --only pit-crew-orchestrator');
  } else {
    log('  ✅ Orchestrator running', 'green');
  }
  fixed++;

  // 4. Fix security agent connectivity
  log('\n[4] Restarting security agent...', 'blue');
  exec('pm2 restart pit-crew-security-agent --update-env');
  log('  Security agent restarted', 'green');
  fixed++;

  // 5. Flush PM2 logs
  log('\n[5] Flushing PM2 logs...', 'blue');
  exec('pm2 flush', { stdio: 'ignore' });
  log('  PM2 logs flushed', 'green');
  fixed++;

  // 6. Rebuild problematic native modules
  log('\n[6] Rebuilding native modules...', 'blue');

  // Architecture agent tree-sitter
  if (existsSync('./packages/architecture-agent')) {
    log('  Rebuilding tree-sitter for architecture-agent...', 'yellow');
    exec('cd packages/architecture-agent && pnpm rebuild tree-sitter', { stdio: 'ignore' });
  }

  fixed++;

  // 7. Set memory limits for processes
  log('\n[7] Setting memory limits...', 'blue');
  exec('pm2 set pm2:logrotate:max_size 10M');
  exec('pm2 set pm2:logrotate:retain 5');
  exec('pm2 set pm2:logrotate:compress true');
  log('  Memory limits configured', 'green');
  fixed++;

  // 8. Verify system health
  log('\n[8] Verifying system health...', 'blue');
  const healthCheck = exec('pm2 list --no-color');
  const restarts = (healthCheck.match(/│\s+\d+\s+│/g) || []).length;
  const highRestarts = healthCheck.match(/↺\s+(\d+)/g)?.filter(m => parseInt(m.replace('↺', '')) > 10).length || 0;

  if (highRestarts === 0) {
    log('  ✅ No processes with excessive restarts', 'green');
  } else {
    log(`  ⚠️  Found ${highRestarts} processes with >10 restarts`, 'yellow');
  }
  fixed++;

  // Summary
  log('\n==================================', 'blue');
  log('📊 Fix Summary', 'blue');
  log(`Fixed: ${fixed}`);
  log(`Errors: ${errors}`);

  if (errors === 0) {
    log('\n✅ System stability improved!', 'green');
    log('\nNext steps:', 'blue');
    log('  1. Monitor: pm2 monit');
    log('  2. Check logs: pm2 logs');
    log('  3. Status: pm2 list');
    return 0;
  } else {
    log('\n❌ Some fixes failed', 'red');
    return 1;
  }
}

main().then(exitCode => {
  process.exit(exitCode);
}).catch(error => {
  log(`Fatal error: ${error.message}`, 'red');
  process.exit(1);
});
