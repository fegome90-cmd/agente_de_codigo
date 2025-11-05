# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Agente de Código** is a multi-agent F1 Pit Stop architecture system for comprehensive code review, security analysis, and quality assurance. The system integrates LangGraph orchestration with multiple specialized agents (Security, Quality, Documentation, Architecture) and provides SARIF 2.1.0 compliant reporting.

**Current Status**: ✅ Production Ready (2025-11-03)
- Full agent ecosystem: 5/5 agents operational + 1 meta-agent
- TypeScript compilation: 100% success (7/7 packages)
- CLI interface: Fully functional
- End-to-end workflows: Verified and tested
- **FASE 1-4 Complete**: Memory optimization (51.7GB → 53MB), Performance tuning, Agent validation, Architecture Agent fix
- **BREAKTHROUGH**: Tree-sitter issue resolved (2025-11-03)
- **NEXT**: Pipeline E2E SARIF (v2.2.0) - Fail-safe infrastructure planned

## High-Level Architecture

The system follows a **F1 Pit Stop** architecture with an orchestrator coordinating specialized agents:

```
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator (LangGraph)                    │
│  - State management via StateGraph                           │
│  - Socket.IO IPC for agent communication                     │
│  - PM2 process management                                    │
│  - Dynamic agent routing                                     │
└────────────┬──────────────────────────┬──────────────────────┘
             │                          │
    ┌────────▼──────────┐      ┌────────▼──────────┐
    │   Agent Plugins   │      │   Shared Types    │
    │                  │      │                  │
    │ • Security       │      │ • Zod schemas    │
    │ • Quality        │      │ • SARIF types    │
    │ • Documentation  │      │ • Agent APIs     │
    │ • Architecture   │      │ • IPC protocols  │
    └────────┬─────────┘      └────────┬─────────┘
             │                        │
    ┌────────▼──────────┐      ┌──────▼───────┐
    │  External Tools   │      │   CLI I/F    │
    │                  │      │              │
    │ • Semgrep        │      │ • Review     │
    │ • Gitleaks       │      │ • Security   │
    │ • ESLint/Ruff    │      │ • Quality    │
    │ • OpenAPI Parser │      │ • Status     │
    └──────────────────┘      └──────────────┘
```

### Key Components

**packages/orchestrator/**
- Main orchestration engine using LangGraph StateGraph
- Socket.IO IPC server for agent communication
- PM2 integration for process monitoring
- Winston logging and metrics collection

**packages/{security,quality,documentation,architecture}-agent/**
- Specialized agents for code analysis
- SARIF 2.1.0 compliant output generation
- Tool-specific analyzers (Semgrep, Gitleaks, ESLint, Ruff, etc.)
- **Status**: Security, Quality, Documentation, Architecture ✅ ALL OPERATIVE (tree-sitter fixed 2025-11-03)

**packages/observability-agent/**
- System monitoring and metrics collection
- Performance tracking and health checks
- Winston logging integration

**packages/pr-reviewer/**
- Meta-agent for cross-agent synthesis
- Intelligent prioritization and assessment logic
- PR review decision engine (Approve/Request Changes/Comment)

**packages/shared/**
- Common TypeScript type definitions
- Zod schema validation
- Cross-package type safety

**packages/cli/**
- ESM-based command-line interface
- Commands: status, quality, security, review
- Agent orchestration via orchestrator API

## Common Development Commands

### Build & Compilation

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter orchestrator build
pnpm --filter quality-agent build

# Clean build artifacts
pnpm clean
```

### Development Server

```bash
# Start orchestrator in dev mode
pnpm dev
# or
pnpm --filter orchestrator dev

# Start orchestrator daemon
pnpm start
```

### Testing

```bash
# Run all tests
pnpm test

# Run specific test suites
pnpm test:unit          # Unit tests only
pnpm test:integration   # Integration tests only
pnpm test:e2e          # End-to-end tests only

# Run tests with coverage
pnpm test:coverage

# Watch mode for development
pnpm test:watch

# Verbose output
pnpm test:verbose
```

### Process Management

```bash
# PM2 operations
pnpm pm2:start          # Start orchestrator with PM2
pnpm pm2:stop
pnpm pm2:restart
pnpm pm2:logs          # View PM2 logs
pnpm pm2:status        # Check PM2 status
```

### Docker Deployment

```bash
# Build and start with Docker
pnpm docker:build       # Build Docker images
pnpm docker:up          # Start all services
pnpm docker:logs        # View container logs
pnpm docker:down        # Stop all services

# Or use docker-compose directly
docker-compose build
docker-compose up -d
docker-compose logs -f
docker-compose down
```

### Code Analysis & Quality

```bash
# Lint all packages
pnpm lint

# Run agents directly via CLI
node packages/cli/dist/index.js status
node packages/cli/dist/index.js quality "packages/quality-agent/src"
node packages/cli/dist/index.js security "src/" --output-dir "reports/"
node packages/cli/dist/index.js review "packages/documentation-agent/src" --timeout 30

# Full system review
pnpm run:full-review

# Test individual agents
python3 packages/agents/security_agent.py --scope src/
python3 packages/agents/quality_agent.py --scope src/ --json

# Validate agent tools
./scripts/validate-agent-tools.sh
```

### Integration Testing

```bash
# Quick integration tests
./scripts/test-orchestrator-simple.sh
./scripts/test-quality-agent-simple.sh

# Full integration suite
./scripts/test-full-integration-simple.sh
./scripts/test-full-integration.sh
```

### Validation

```bash
# Validate system phase 1
./scripts/validate-phase1.sh

# Check production readiness
./scripts/validate-phase1-simple.sh

# Run security tests
./scripts/test-security-agent.sh

# Validate agent tool installations
./scripts/validate-agent-tools.sh

# System health check
./scripts/health-check.sh

# Monitor memory usage
./scripts/monitor-memory.mjs
```

## Testing Strategy

The project uses a multi-layer testing approach:

1. **Unit Tests** (`test/unit/`, `packages/*/tests/`)
   - Individual component testing
   - Fast execution, no external dependencies
   - Use Jest for TypeScript, pytest for Python

2. **Integration Tests** (`test/integration/`)
   - IPC communication testing
   - Agent-to-orchestrator communication
   - Socket.IO integration verification

3. **End-to-End Tests** (`test/e2e/`)
   - Complete workflow testing
   - Multi-agent coordination
   - Real-world scenario simulation

### Test Configuration

- **Orchestrator tests**: Jest with TypeScript support
- **Agent tests**: pytest for Python agents, Jest for TypeScript
- **Coverage threshold**: 80% (enforced in CI)
- **Test timeout**: 60s for E2E, 30s for integration
- **Parallel execution**: Up to 5 concurrent agents

## Environment Configuration

### Required Environment Variables

```bash
# Core System Configuration
OBS_PATH=./obs                          # Observations directory for reports
ANTHROPIC_API_KEY=your_key             # Claude API access
GLM_API_KEY=your_key                   # GLM-4.6 API access

# Agent Configuration
PIT_CREW_SOCKET_PATH=/tmp/pit-crew-orchestrator.sock
MAX_CONCURRENT_AGENTS=5
AGENT_TIMEOUT=300000                   # 5 minutes default
LOG_LEVEL=info

# MemTech Integration (inherited from /Users/felipe/Developer/memtech-universal)
CHROMA_API_KEY=...
MEMTECH_MEMORY_REDIS_URL=...
MEMTECH_MEMORY_DATABASE_URL=...
```

### Quality Gates Configuration

Create `config/quality-gates.yaml`:

```yaml
# Security Analysis Thresholds
security:
  max_critical: 0         # Zero tolerance for critical
  max_high: 1             # Max 1 high-severity issue
  max_medium: 10          # Max 10 medium-severity issues

# Code Quality Thresholds
quality:
  max_errors: 0           # Zero lint errors
  max_warnings: 50        # Max 50 warnings
  max_complexity: 15      # Max cyclomatic complexity

# Architecture Compliance
architecture:
  max_layering_violations: 0    # Clean architecture
  max_dry_violations: 5         # Max 5 code duplication
  min_test_coverage: 80         # 80% minimum coverage
```

## Development Workflow

### 1. Initial Setup

```bash
# Install dependencies
pnpm install

# Verify system readiness
node packages/cli/dist/index.js status
# Expected: "✅ System is ready to run reviews!"

# Run validation suite
./scripts/validate-phase1.sh
```

### 2. Making Changes

```bash
# Create feature branch
git checkout -b feature/new-agent

# Make changes and build
pnpm build

# Run type checking
pnpm tsc --noEmit

# Run tests
pnpm test:unit

# Verify integration
./scripts/test-orchestrator-simple.sh
```

### 3. Testing Changes

```bash
# Run agent-specific tests
pnpm --filter quality-agent test
./scripts/test-quality-agent-simple.sh

# Test full workflow
./scripts/test-full-integration-simple.sh

# Verify CLI functionality
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js review "test/fixtures/" --timeout 15
```

### 4. Production Verification

```bash
# Build all packages
pnpm build
# Expected: 6/7 packages building successfully

# Verify CLI commands
node packages/cli/dist/index.js status
node packages/cli/dist/index.js quality "packages/quality-agent/src" --timeout 10

# Full system check
pnpm test:orchestrator
pnpm test:integration
```

## TypeScript Configuration

- **Base config**: `tsconfig.base.json` (root)
- **Package configs**: Individual `tsconfig.json` per package
- **Module system**: ESM with `"type": "module"` in package.json
- **Build output**: `dist/` directory per package
- **Type checking**: Strict mode enabled
- **ESM imports**: Require `.js` extension in imports

### Key TypeScript Settings

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

## Project Structure

```
agente-de-codigo/
├── packages/
│   ├── orchestrator/          # Core orchestration engine
│   │   ├── src/
│   │   │   ├── graph/        # LangGraph workflow definitions
│   │   │   ├── ipc/          # Socket.IO IPC server/client
│   │   │   ├── daemon/       # PM2 daemon integration
│   │   │   └── index.ts      # Main entry point
│   │
│   ├── shared/               # Common types and utilities
│   │   ├── src/
│   │   │   ├── types/        # Zod schemas and TypeScript types
│   │   │   ├── sarif/        # SARIF 2.1.0 types
│   │   │   └── utils/        # Shared utilities
│   │
│   ├── security-agent/       # Security analysis
│   ├── quality-agent/        # Code quality analysis
│   ├── documentation-agent/  # Documentation validation
│   ├── architecture-agent/   # Architecture review
│   └── cli/                  # Command-line interface
│
├── scripts/                   # Automation scripts
│   ├── test-*.sh             # Test runners
│   ├── run-agents.sh         # Agent orchestration
│   └── validate-*.sh         # Validation scripts
│
├── obs/                      # Observability and reports
│   ├── reports/              # Analysis reports
│   └── kpi/                  # Metrics and KPIs
│
├── .claude-plugin/           # Claude Code integration
└── configs/                  # Configuration files
```

## Code Standards

### TypeScript

- Use ESM module syntax (`import ... from '...'.js`)
- Strict type checking enabled
- Zod schemas for runtime validation
- Winston for structured logging
- Consistent error handling with typed errors

### Testing

- Unit tests: Jest or pytest
- Integration tests: Test IPC and agent communication
- E2E tests: Complete workflow validation
- Coverage: Minimum 80%
- Test files: `*.test.ts` or `*.spec.ts`

### Agent Development

- Each agent implements standardized interface
- SARIF 2.1.0 compliant output
- Socket.IO client for orchestrator communication
- Tool-specific analyzers wrapped in agent interface
- Graceful degradation on tool failure

### Repository Guidelines

**Monorepo Structure**:
- TypeScript packages: `packages/*/` (orchestrator, agents, shared, cli)
- Python agents: `packages/agents/src/`
- Tests: TS in `packages/*/{test,tests}`; Python in top-level `test/`
- Utilities: `scripts/`; Documentation: `docs/`

**Coding Standards**:
- **TypeScript**: ESLint + Prettier, 2-space indent, `camelCase` vars/functions, `PascalCase` classes/types
- **Python**: Black (88 cols) + isort; Flake8; Mypy (type hints required), `snake_case` functions/modules
- **Commit Style**: Conventional Commits - `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`

**Pull Request Requirements**:
- Include: summary, packages/paths touched, linked issues, before/after notes
- Attach test results/logs (SARIF/coverage when relevant)
- Run validation: `pnpm test:unit` and `pnpm lint` before submitting
- Keep changes focused; respect monorepo boundaries

## Integration Points

### External Tools

**Security Analysis**
- Semgrep: SAST scanning with custom rules
- Gitleaks: Secret detection
- OSV Scanner: Dependency vulnerabilities
- pip-audit, npm audit: Dependency scanning

**Quality Analysis**
- ESLint: JavaScript/TypeScript linting
- Ruff: Python linting and formatting (10x faster than flake8)
- Lizard: Complexity analysis

**Documentation**
- OpenAPI Parser: API specification validation
- @apidevtools/swagger-parser: OpenAPI 3.x validation

**Architecture Analysis**
- Tree-sitter: AST parsing (currently non-functional due to Node version mismatch)

### MemTech Universal Integration

Located at `/Users/felipe/Developer/memtech-universal`:
- Memory persistence layer (Redis + PostgreSQL)
- Chroma vector database for semantic search
- Multi-LLM routing (Claude + GLM-4.6)
- MCP server integration

Environment variables inherited from MemTech:
```bash
CLAUDE_API_KEY=...
CHROMA_API_KEY=...
MEMTECH_MEMORY_REDIS_URL=...
MEMTECH_MEMORY_DATABASE_URL=...
```

## Troubleshooting

### Build Issues

```bash
# Clean install
pnpm clean
rm -rf node_modules
pnpm install

# Rebuild specific package
cd packages/orchestrator
rm -rf dist node_modules
pnpm install
pnpm build

# Check TypeScript errors
pnpm tsc --noEmit --project tsconfig.json
```

### Test Failures

```bash
# Run with verbose output
pnpm test --verbose

# Check specific test
pnpm test orchestrator.test.ts

# Debug integration issues
./scripts/test-orchestrator-simple.sh
```

### Runtime Issues

```bash
# Check PM2 status
pnpm pm2:status
pnpm pm2:logs

# Verify orchestrator health
curl http://localhost:8080/health || echo "Orchestrator not running"
# Start orchestrator: pnpm start

# Test CLI connectivity
node packages/cli/dist/index.js status
```

### Common Issues

1. **ESM Module Errors**: Ensure `.js` extension in imports
2. **Type Errors**: Run `pnpm build` to check compilation
3. **Agent Timeouts**: Adjust timeout in CLI commands (default: 300s)
4. **Socket.IO Connection**: Verify orchestrator is running (`pnpm pm2:status`)
5. **PM2 Issues**: Restart with `pnpm pm2:restart`
6. **Architecture Agent Failure**: tree-sitter Node version mismatch (Node v22 vs compiled v20)
   - Solution: Rebuild tree-sitter native modules for current Node version
7. **Memory Leaks**: Fixed in FASE 1 - system now uses ~53MB instead of 51.7GB
8. **Tool Compatibility**: Some tools (Semgrep, Gitleaks, OSV Scanner) need updated flag formats

## Extending the System

### Adding a New Agent

**Step 1: Create Agent Package**
```bash
mkdir -p packages/new-agent/src
cd packages/new-agent
```

**Step 2: Implement Socket Client**

Python agent example:
```python
from agents.src.ipc.socket_client import SocketClient

class NewAgent(SocketClient):
    def __init__(self):
        super().__init__(socket_path, 'new-agent')
        
    async def analyze(self, scope: str) -> dict:
        # Implement your analysis logic here
        return {"findings": [], "metrics": {}}
```

TypeScript agent example:
```typescript
import { SocketClient } from '../shared/dist/index.js';

export class NewAgent extends SocketClient {
  constructor() {
    super('new-agent');
  }

  async analyze(scope: string): Promise<AnalysisResult> {
    // Implement analysis logic
    return { findings: [], metrics: {} };
  }
}
```

**Step 3: Update Orchestrator Configuration**

1. Add agent to `packages/orchestrator/ecosystem.config.cjs`:
```javascript
module.exports = {
  apps: [
    // ... existing agents
    {
      name: 'new-agent',
      script: 'packages/new-agent/dist/index.js',
      cwd: '/path/to/project',
      instances: 1,
      exec_mode: 'fork'
    }
  ]
};
```

2. Update skill routing in `packages/orchestrator/src/graph/pit-crew-graph.ts`:
```typescript
export const pitCrewGraph = {
  nodes: {
    // ... existing nodes
    newAgent: {
      agent: 'new-agent',
      tools: ['your-tool-1', 'your-tool-2']
    }
  }
};
```

**Step 4: Add CLI Command**

Update `packages/cli/src/commands/review.ts`:
```typescript
export const reviewCommand = {
  command: 'review <scope>',
  describe: 'Run all agents including new-agent',
  handler: async (scope: string) => {
    const results = await orchestrate([...agents, 'new-agent'], scope);
    // Handle results
  }
};
```

**Step 5: Add Tests**

```bash
# Unit tests
mkdir -p packages/new-agent/tests
touch packages/new-agent/tests/index.test.ts

# Integration tests  
mkdir -p test/integration/test-new-agent/
touch test/integration/test-new-agent/communication.test.ts
```

**Step 6: Validation**

```bash
# Build and test
pnpm build
pnpm test:unit

# Run integration test
./scripts/test-orchestrator-simple.sh

# Verify CLI integration
node packages/cli/dist/index.js new-agent src/
```

### Best Practices for New Agents

1. **Graceful Degradation**: Always handle tool failures gracefully
2. **SARIF Compliance**: Ensure output follows SARIF 2.1.0 specification
3. **Timeout Handling**: Set appropriate timeouts for your analysis type
4. **Memory Management**: Clean up resources after analysis
5. **Logging**: Use Winston for structured logging
6. **Error Types**: Use typed errors from `@types/node:errors`

## Performance Considerations

### Optimization Tips

1. **Agent Timeouts**: Set appropriate timeouts (10-30s for CLI, 300s for full review)
2. **Concurrent Agents**: Limit to 5 max concurrent agents
3. **Build Optimization**: Use `pnpm build` for incremental builds
4. **Test Parallelization**: Leverage Jest's parallel test execution
5. **Memory Management**: System optimized (FASE 1) - now uses ~53MB instead of 51.7GB
6. **Network Optimization**: Heartbeat interval increased to 30s (83% traffic reduction)
7. **Connection Resilience**: Exponential backoff (2s → 60s) prevents connection floods
8. **Quality Agent**: All tools available but may need timeout tuning for large projects

### Monitoring

```bash
# PM2 monitoring
pnpm pm2:status
pnpm pm2:logs

# Orchestrator metrics
curl http://localhost:8080/metrics

# Test performance
time pnpm test:unit
```

## Useful References

### Documentation
- **System Review Report**: `SYSTEM_REVIEW_REPORT.md`
- **Architecture Analysis**: `ARCHITECTURE_ANALYSIS.md`
- **Agent Documentation**: `AGENTS.md`

### Configuration Files
- **Package configs**: `packages/*/package.json`
- **TypeScript configs**: `tsconfig.base.json`, `packages/*/tsconfig.json`
- **Workspace config**: `pnpm-workspace.yaml`

### Test Fixtures
- **Sample projects**: `test/fixtures/sample-projects/`
- **Test data**: `test_data/`

## Key Scripts Reference

| Script | Purpose |
|--------|---------|
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm dev` | Start dev server |
| `pnpm pm2:start` | Start with PM2 |
| `./scripts/validate-phase1.sh` | Validate system |
| `./scripts/test-full-integration-simple.sh` | Run integration tests |
| `node packages/cli/dist/index.js status` | Check system status |

## Current System Status (2025-11-02) - FASE 3 COMPLETE

**Production Ready** ✅

### FASE 1-3 Achievements (Major Improvements)
- ✅ **Memory Leak Fixed**: 51.7GB → 53MB (1000x improvement)
- ✅ **Performance Optimized**: 83% reduction in heartbeat network traffic
- ✅ **System Stability**: 46+ minutes uptime, 0 restarts
- ✅ **Connection Resilience**: Exponential backoff prevents floods
- ✅ **TypeScript Strict Mode**: Enabled across all 7 packages
- ✅ **Linting Configured**: Ruff (Python) + ESLint (TypeScript)

### Agent Status (5/5 Operative) - Updated 2025-11-03
- ✅ **Security Agent**: Fully functional - Generated SARIF report in 0.74s (85 files)
- ✅ **Quality Agent**: Tools available - Ruff + ESLint + Lizard (100% operativity)
- ✅ **Documentation Agent**: OpenAPI validation integrated (100% operativity)
- ✅ **PR Reviewer Agent**: Meta-agent for cross-agent synthesis (100% operativity)
- ✅ **Architecture Agent**: **FIXED** - tree-sitter compilation successful for Node v24.10.0
- ✅ **Observability Agent**: System monitoring and metrics collection

### Infrastructure Status
- ✅ **Orchestrator**: 100% TypeScript compilation
- ✅ **CLI Interface**: All commands functional
- ✅ **Shared Types**: Cross-package type safety verified
- ✅ **IPC Communication**: Socket.IO fully operational
- ✅ **PM2 Integration**: Process management stable

### Performance Metrics

**Current Benchmarks (Production)**
- **Security Analysis**: 0.76s for 85 files (target: <20s) ✅
- **Quality Analysis**: <5s for typical codebase ✅
- **Documentation Parsing**: <1s for OpenAPI specs ✅
- **Memory Usage**: ~53MB per agent (1000x improvement from 51.7GB) ✅
- **Throughput**: 1159+ ops/sec maintained ✅
- **Recovery Time**: <30s after agent failure ✅
- **System Uptime**: 46+ minutes with 0 restarts ✅
- **Network Efficiency**: 83% reduction in heartbeat traffic ✅

**Target Thresholds**
- **Security Agent**: <20s for 1000 files
- **Quality Agent**: <15s for 1000 files  
- **Documentation Agent**: <5s for 100 API specs
- **Architecture Agent**: <30s (fully operational)
- **Concurrent Agents**: Max 5 agents in parallel
- **System Memory**: <100MB total for all agents

**Last Updated**: 2025-11-03 17:20:00 UTC
**System Readiness**: 100% (Production Ready)
**Agent Coverage**: 100% (5/5 core agents + 1 meta-agent implemented)

### NEXT PHASE: Pipeline E2E SARIF (v2.2.0)
**Planned Infrastructure**: Fail-safe pipeline que garantice validez de esquema, semántica consistente, merges deterministas, baselines robustas y observabilidad total.

**Objectives SMART (90 días)**:
1. **Conformidad**: 100% SARIF validación esquema + 30+ reglas semánticas
2. **Determinismo**: diffs idénticos (tolerancia ±0), flake rate <0.5%
3. **Merges/Dedupe**: false-duplicates <1%, false-omissions <1%
4. **Baselines**: fingerprint estable, churn semanal <5%
5. **Observabilidad**: SLA generación <5 min, métricas por etapa

**Architecture (6 Capas)**: Ingesta → Semántica → Fingerprinting → Merge/Dedupe → Publicación → Observabilidad

## Quick Reference Guide

### Most Common Commands

**Setup & Validation**
```bash
pnpm install                    # Install dependencies
pnpm build                      # Build all packages
node packages/cli/dist/index.js status  # Verify system health
./scripts/validate-phase1.sh    # Run full validation suite
```

**Development**
```bash
pnpm dev                        # Start orchestrator in dev mode
pnpm test:unit                  # Run unit tests
pnpm lint                       # Lint all packages
pnpm --filter quality-agent build  # Build specific package
```

**Analysis & Testing**
```bash
# Quick security check
node packages/cli/dist/index.js security src/

# Full review with all agents
node packages/cli/dist/index.js review src/

# Test individual agents
python3 packages/agents/security_agent.py --scope src/
./scripts/test-full-integration-simple.sh
```

**Process Management**
```bash
pnpm pm2:start          # Start all agents via PM2
pnpm pm2:status         # Check status
pnpm pm2:logs           # View logs
pnpm pm2:restart        # Restart agents
```

### Emergency Troubleshooting

```bash
# Complete reset
pnpm clean && rm -rf node_modules && pnpm install && pnpm build

# Check orchestrator health
curl http://localhost:8080/health || echo "Run: pnpm pm2:start"

# Fix socket issues
rm -f /tmp/pit-crew*.sock && pnpm pm2:restart

# Monitor memory usage
./scripts/monitor-memory.mjs

# View real-time logs
pnpm pm2:logs --lines 100 --nostream
```

### Agent Status Quick Check

```bash
# Check all agents
pnpm pm2:status

# Test each agent individually
python3 packages/agents/security_agent.py --scope src/ --json
python3 packages/agents/quality_agent.py --scope src/ --json
node packages/cli/dist/index.js documentation packages/documentation-agent/src

# Architecture agent (FIXED 2025-11-03)
# ✅ Tree-sitter compiled successfully for Node v24.10.0
# ✅ All language parsers operational (JS/TS/Python)
```
