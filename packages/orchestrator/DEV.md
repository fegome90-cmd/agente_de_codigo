# Pit Crew Orchestrator - Developer Documentation

## 📋 Overview

Pit Crew Orchestrator is a LangGraph-based multi-agent orchestration system for code analysis and review. It manages multiple specialized agents (security, architecture, quality, documentation, PR reviewer) through a socket-based IPC system.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Orchestrator (PM2)                   │
│  - Main entry: dist/index.js                           │
│  - Socket server: /tmp/pit-crew-orchestrator.sock      │
│  - Manages: AgentRegistry, PitCrewGraph                │
└─────────────────────┬───────────────────────────────────┘
                      │
                      │ IPC (Unix Socket)
                      │
┌─────────────────────▼───────────────────────────────────┐
│              Registered Agents                          │
│  - security-agent                                       │
│  - architecture-agent                                   │
│  - quality-agent                                        │
│  - documentation-agent                                  │
│  - pr-reviewer-agent                                    │
└─────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

```bash
# Install dependencies
cd packages/orchestrator
npm install

# Build TypeScript to ESM
npm run build
```

### Environment Variables

Required in `ecosystem.config.cjs`:

```javascript
env: {
  NODE_ENV: 'development',
  OBS_PATH: '../../obs',           // Relative to /packages/orchestrator
  PIT_CREW_SOCKET_PATH: '/tmp/pit-crew-orchestrator.sock',
  LOG_LEVEL: 'info',               // Optional: debug, info, warn, error
  MAX_CONCURRENT_AGENTS: '5'       // Optional
}
```

### Running

#### Development (Manual)

```bash
# From packages/orchestrator directory
OBS_PATH=../../obs node dist/index.js
```

#### Production (PM2)

```bash
# Start
pm2 start ecosystem.config.cjs

# Restart
pm2 restart pit-crew-orchestrator

# View logs
pm2 logs pit-crew-orchestrator --lines 50 --nostream

# Check status
pm2 show pit-crew-orchestrator

# Update environment variables
pm2 restart pit-crew-orchestrator --update-env
```

## 📁 Directory Structure

```
packages/orchestrator/
├── dist/                    # Compiled ESM JavaScript
├── src/                     # TypeScript source
├── logs/                    # Log files (PM2 + Winston)
│   ├── orchestrator.log     # Winston file transport
│   ├── out.log             # PM2 stdout
│   ├── err.log             # PM2 stderr
│   └── combined.log        # PM2 combined
├── obs/                     # Observation path (if relative)
│   └── triggers/           # Manual trigger files
├── ecosystem.config.cjs    # PM2 configuration
└── DEV.md                  # This file
```

```
/obs/                         # Actual observation directory
├── triggers/                 # Git event triggers (*.json)
│   ├── manual-*.json
│   └── git-push-*.json
├── reports/                  # Generated analysis reports
├── artifacts/               # Temporary files
└── memory/                  # L2/L3 memory stores
    ├── L2/
    └── L3/
```

## 🔧 Triggers

### Manual Trigger Format

Create JSON files in `/obs/triggers/`:

```json
{
  "type": "manual_review",
  "git_event": {
    "repo": "repository-name",
    "branch": "feature-branch",
    "commit": "abc123def456",
    "files": ["src/index.js", "package.json"],
    "loc_changed": 42,
    "timestamp": "2025-11-02T12:30:00Z"
  }
}
```

### File Watcher

The orchestrator automatically:
1. Watches `obs/triggers/*.json` for new files
2. Processes events matching `"type": "manual_review"`
3. Deletes trigger file after processing

### Testing Manual Trigger

```bash
# Create trigger
TS=$(date +%s)
cat > /obs/triggers/manual-$TS.json <<'EOF'
{
  "type": "manual_review",
  "git_event": {
    "repo": "test-repo",
    "branch": "main",
    "commit": "abc123",
    "files": ["src/index.js"],
    "loc_changed": 42,
    "timestamp": "2025-11-02T12:30:00Z"
  }
}
EOF

# Monitor logs
pm2 logs pit-crew-orchestrator --lines 100 --nostream
```

## 📊 Logging

### Winston Logger (Application)

- **Console**: Colored, human-readable output
- **File**: `./logs/orchestrator.log` (10MB max, 5 rotate files)
- **Format**: `{timestamp} [{level}]: {message} {metadata}`

### PM2 Logging (Process)

- **out.log**: stdout capture
- **err.log**: stderr capture
- **combined.log**: combined stdout/stderr

### Troubleshooting Empty Logs

**Issue**: Log files are 0 bytes despite application running

**Possible Causes**:
1. **PM2 exec_mode**: `cluster` mode may have logging issues
2. **Winston transport**: File path may be incorrect for PM2 context
3. **stdout/stderr**: Winston writes to transport files, not stdout

**Solutions**:
1. Check `exec_mode: 'fork'` instead of `'cluster'`
2. Verify Winston file path: `./logs/orchestrator.log`
3. Check PM2 log configuration in `ecosystem.config.cjs`
4. Run manually to verify: `OBS_PATH=../../obs node dist/index.js`

## 🐛 Known Issues

### 1. Missing OBS_PATH Environment Variable

**Error**: `Missing required environment variables: OBS_PATH`

**Fix**: Add to `ecosystem.config.cjs`:
```javascript
env: {
  OBS_PATH: '../../obs',
  // ... other vars
}
```

Then restart:
```bash
pm2 restart pit-crew-orchestrator --update-env
```

### 2. Logs Not Captured by PM2

**Symptom**: `out.log`, `err.log`, `combined.log` are 0 bytes

**Current Status**: 🔍 Under investigation

**Workaround**:
- Check Winston logs: `./logs/orchestrator.log`
- Run manually: `OBS_PATH=../../obs node dist/index.js`

### 3. Cluster Mode vs Fork Mode

**Current Config**: `exec_mode: 'cluster'` (single instance)

**Considerations**:
- `cluster`: Better for CPU utilization, but logging may have issues
- `fork`: Simpler, recommended for development

### 4. Socket File Permissions

**Location**: `/tmp/pit-crew-orchestrator.sock`

**Check**:
```bash
ls -la /tmp/pit-crew-orchestrator.sock
# Should show: srwxr-xr-x
```

**Reset if needed**:
```bash
rm -f /tmp/pit-crew-orchestrator.sock
pm2 restart pit-crew-orchestrator
```

## 🧪 Testing

### Test Socket Server

```bash
# Check if socket exists
ls -la /tmp/pit-crew-orchestrator.sock

# Test connectivity (if you have a test client)
# See: src/ipc/socket-server.js
```

### Test Trigger Processing

```bash
# Create a trigger
TS=$(date +%s)
cat > /obs/triggers/manual-$TS.json <<'EOF'
{
  "type": "manual_review",
  "git_event": {
    "repo": "test-repo",
    "branch": "main",
    "commit": "abc123",
    "files": ["src/index.js"],
    "loc_changed": 42,
    "timestamp": "2025-11-02T12:30:00Z"
  }
}
EOF

# Watch for activity
pm2 logs pit-crew-orchestrator --lines 50 --nostream

# Check if trigger was processed (file should be deleted)
ls -la /obs/triggers/manual-$TS.json
# Should return: No such file or directory
```

### Monitor in Real-time

```bash
# PM2 logs (if working)
pm2 logs pit-crew-orchestrator

# Winston file logs
tail -f /packages/orchestrator/logs/orchestrator.log

# Process status
pm2 monit
```

## 🔍 Debugging

### Enable Debug Logging

In `ecosystem.config.cjs`:
```javascript
env: {
  LOG_LEVEL: 'debug',
  // ...
}
```

Restart PM2:
```bash
pm2 restart pit-crew-orchestrator --update-env
```

### Check Process Health

```bash
# PM2 status
pm2 list | grep orchestrator

# Detailed info
pm2 show pit-crew-orchestrator

# Process tree
pm2 show pit-crew-orchestrator | grep -A 20 "status\|uptime\|restarts"

# Memory and CPU
pm2 show pit-crew-orchestrator | grep -E "cpu|mem|heap"
```

### Environment Variables

```bash
# Check current env
pm2 env 5 | grep -E "NODE_ENV|OBS_PATH|SOCKET_PATH"

# View all env
pm2 env 5
```

## 📝 Development Workflow

### Making Changes

1. Edit TypeScript source in `src/`
2. Build: `npm run build`
3. Restart PM2: `pm2 restart pit-crew-orchestrator`
4. Test with manual trigger
5. Check logs

### Quick Iteration

```bash
# Build + Restart
npm run build && pm2 restart pit-crew-orchestrator --update-env

# Check status
pm2 show pit-crew-orchestrator

# Monitor logs
pm2 logs pit-crew-orchestrator --lines 50 --nostream
```

### Testing Changes

```bash
# Test manually first
OBS_PATH=../../obs node dist/index.js

# If working, restart PM2
pm2 restart pit-crew-orchestrator

# Test with trigger
TS=$(date +%s)
cat > /obs/triggers/manual-$TS.json <<'EOF'
{
  "type": "manual_review",
  "git_event": {
    "repo": "test",
    "branch": "main",
    "commit": "test",
    "files": ["test.js"],
    "loc_changed": 1,
    "timestamp": "2025-11-02T12:00:00Z"
  }
}
EOF

# Watch for processing
pm2 logs pit-crew-orchestrator --lines 100 --nostream
```

## 🚦 Process Lifecycle

1. **Start**: Validate environment, create directories
2. **Init**: Start socket server, register agents
3. **Listen**: Watch for triggers (file system + PM2 IPC)
4. **Process**: Handle git events via workflow
5. **Shutdown**: Graceful cleanup on SIGTERM/SIGINT

## 📦 Dependencies

### Production
- `winston`: Logging
- `@pm2/io`: PM2 metrics (optional)
- `chokidar`: File watcher
- `dotenv`: Environment variables

### Build Output
- ESM modules (`.mjs` in dist)
- Compiled from TypeScript
- Source maps: `index.js.map`

## 🔗 Related Files

- `src/index.ts`: Main entry point
- `src/graph/pit-crew-graph.ts`: Workflow orchestration
- `src/ipc/socket-server.ts`: IPC socket management
- `src/ipc/agent-registry.ts`: Agent registration/heartbeat
- `ecosystem.config.cjs`: PM2 configuration

## 📞 Support

### Common Commands

```bash
# Status
pm2 list | grep orchestrator

# Restart
pm2 restart pit-crew-orchestrator

# Logs
pm2 logs pit-crew-orchestrator --lines 50 --nostream

# Environment
pm2 env 5 | grep -E "NODE_ENV|OBS_PATH"

# Manual run
OBS_PATH=../../obs node dist/index.js

# Monitor
pm2 monit
```

---

**Last Updated**: November 2, 2025
**Status**: ✅ Functional (with known logging issues)
**PM2 Process**: pit-crew-orchestrator (id: 5)
