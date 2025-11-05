#!/usr/bin/env node

/**
 * Memory & Stability Monitor
 * Real-time monitoring with alerts for memory leaks and crash loops
 */

import { execSync } from 'node:child_process';
import { existsSync, appendFileSync, mkdirSync, readFileSync } from 'node:fs';

const ALERT_THRESHOLD_MB = 200;  // Alert if process exceeds 200MB
const CRITICAL_THRESHOLD_MB = 500;  // Critical alert at 500MB
const CRASH_LOOP_THRESHOLD = 15;  // Alert if restarts exceed 15
const MONITOR_INTERVAL = 30000;  // 30 seconds

const ALERTS_LOG = './logs/alerts.log';
const METRICS_LOG = './logs/metrics.jsonl';

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  console.log(logMessage);

  // Append to alerts log if WARNING or ERROR
  if (['WARNING', 'ERROR', 'CRITICAL'].includes(level)) {
    ensureLogDirectory();
    appendFileSync(ALERTS_LOG, logMessage + '\n');
  }
}

function ensureLogDirectory() {
  const logDir = './logs';
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
}

function getProcessList() {
  try {
    const output = execSync('pm2 list --no-color', { encoding: 'utf8' });
    return output;
  } catch (error) {
    log(`Failed to get PM2 status: ${error.message}`, 'ERROR');
    return null;
  }
}

function parseMemory(memoryStr) {
  // Extract memory from strings like "15.3mb", "1.2GB"
  const match = memoryStr.toLowerCase().match(/([\d.]+)\s*(mb|gb)/);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2];

  return unit === 'gb' ? value * 1024 : value;
}

function checkForIssues(pm2Output) {
  const lines = pm2Output.split('\n');
  const issues = [];

  for (const line of lines) {
    // Skip header and separator lines
    if (!line.includes('│') || line.includes('name')) continue;

    const parts = line.split('│').map(p => p.trim()).filter(p => p);
    if (parts.length < 8) continue;

    // PM2 list columns: id, name, mode, ↺, status, cpu, memory, user
    const name = parts[1];
    const restartsStr = parts[4];
    const memoryStr = parts[7];

    // Parse restarts
    const restarts = parseInt(restartsStr) || 0;

    // Parse memory
    const memoryMB = parseMemory(memoryStr);

    // Check for issues
    if (memoryMB > ALERT_THRESHOLD_MB) {
      const severity = memoryMB > CRITICAL_THRESHOLD_MB ? 'CRITICAL' : 'WARNING';
      issues.push({
        type: 'memory',
        severity,
        name,
        value: `${memoryMB.toFixed(1)}MB`,
        threshold: `${ALERT_THRESHOLD_MB}MB`
      });
    }

    if (restarts > CRASH_LOOP_THRESHOLD) {
      issues.push({
        type: 'crash_loop',
        severity: 'WARNING',
        name,
        value: restarts,
        threshold: CRASH_LOOP_THRESHOLD
      });
    }
  }

  return issues;
}

function recordMetrics(pm2Output) {
  const lines = pm2Output.split('\n');
  const processes = [];

  for (const line of lines) {
    if (!line.includes('│') || line.includes('name')) continue;

    const parts = line.split('│').map(p => p.trim()).filter(p => p);
    if (parts.length < 8) continue;

    const name = parts[1];
    const restarts = parseInt(parts[4]) || 0;
    const memoryMB = parseMemory(parts[7]);
    const uptime = parts[5];

    processes.push({
      name,
      restarts,
      memory_mb: memoryMB,
      uptime
    });
  }

  // Write metrics to JSONL file
  ensureLogDirectory();
  const metrics = {
    timestamp: new Date().toISOString(),
    processes,
    total_memory: processes.reduce((sum, p) => sum + p.memory_mb, 0),
    total_restarts: processes.reduce((sum, p) => sum + p.restarts, 0)
  };

  appendFileSync(METRICS_LOG, JSON.stringify(metrics) + '\n');
}

function sendAlert(issue) {
  const timestamp = new Date().toISOString();

  if (issue.type === 'memory') {
    log(`${issue.name}: High memory usage (${issue.value} > ${issue.threshold})`, issue.severity);
  } else if (issue.type === 'crash_loop') {
    log(`${issue.name}: Crash loop detected (${issue.value} restarts > ${issue.threshold})`, 'WARNING');
  }
}

async function monitor() {
  log('🚀 Starting Memory & Stability Monitor');
  log(`Monitoring interval: ${MONITOR_INTERVAL / 1000}s`);
  log(`Memory threshold: ${ALERT_THRESHOLD_MB}MB`);
  log(`Crash loop threshold: ${CRASH_LOOP_THRESHOLD} restarts\n`);

  while (true) {
    try {
      const pm2Output = getProcessList();
      if (!pm2Output) {
        await new Promise(resolve => setTimeout(resolve, MONITOR_INTERVAL));
        continue;
      }

      // Check for issues
      const issues = checkForIssues(pm2Output);

      // Record metrics
      recordMetrics(pm2Output);

      // Send alerts
      for (const issue of issues) {
        sendAlert(issue);
      }

      // Log summary
      const totalMemory = issues.reduce((sum, issue) => {
        if (issue.type === 'memory') {
          return sum + parseFloat(issue.value);
        }
        return sum;
      }, 0);

      if (issues.length === 0) {
        log('✅ All processes healthy');
      } else {
        log(`⚠️  Found ${issues.length} issue(s)`);
      }

    } catch (error) {
      log(`Monitor error: ${error.message}`, 'ERROR');
    }

    await new Promise(resolve => setTimeout(resolve, MONITOR_INTERVAL));
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('🛑 Monitor stopped', 'WARNING');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('🛑 Monitor stopped', 'WARNING');
  process.exit(0);
});

if (existsSync('./logs/metrics.jsonl')) {
  const lastLine = readFileSync('./logs/metrics.jsonl', 'utf8').trim().split('\n').pop();
  if (lastLine) {
    const metrics = JSON.parse(lastLine);
    log(`📊 Last check: ${metrics.total_memory.toFixed(1)}MB total, ${metrics.total_restarts} total restarts`);
  }
}

// Start monitoring
monitor().catch(error => {
  log(`Fatal error: ${error.message}`, 'CRITICAL');
  process.exit(1);
});
