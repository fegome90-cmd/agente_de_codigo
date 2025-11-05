# PR Reviewer Agent

A meta-agent that synthesizes findings from security, quality, architecture, and documentation agents to provide comprehensive PR reviews with actionable recommendations.

## Overview

The PR Reviewer Agent acts as the "F1 Pit Stop" team coordinator, collecting and analyzing results from specialized agents to provide a unified assessment of pull requests. It implements sophisticated scoring algorithms, quality gates validation, and generates detailed markdown reports.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Security      │    │     Quality      │    │   Architecture  │
│     Agent       │    │      Agent       │    │      Agent      │
└─────────┬───────┘    └─────────┬────────┘    └─────────┬───────┘
          │                      │                       │
          └──────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │     PR Reviewer Agent     │
                    │      (Meta-Agent)        │
                    └─────────────┬─────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │      Orchestrator         │
                    └───────────────────────────┘
```

## Features

### Core Capabilities

- **Multi-Agent Synthesis**: Combines findings from security, quality, architecture, and documentation agents
- **Intelligent Scoring**: Weighted scoring algorithm with configurable thresholds
- **Decision Engine**: Automated approve/request_changes/needs_work decisions
- **Quality Gates**: Zero-tolerance checks for critical issues
- **Markdown Reports**: Comprehensive, human-readable review reports
- **Checklist Generation**: Actionable checklist with priorities and assignments
- **Recommendation System**: Categorized recommendations with effort estimates

### Scoring Algorithm

The agent uses a weighted scoring system:

```yaml
weights:
  security: 35%      # Critical for production safety
  quality: 30%       # Code maintainability
  architecture: 20%  # System design integrity
  documentation: 15% # Knowledge transfer

severity_penalties:
  critical: 40 points
  high: 30 points
  medium: 20 points
  low: 10 points
```

### Decision Logic

```yaml
decision_criteria:
  approve:
    score >= 80
    no critical issues
    max 3 high issues

  request_changes:
    any critical issues
    score <= 60
    > 3 high issues

  needs_work:
    60 < score < 80
    needs improvements
```

## Installation

```bash
# From the root of the pit-crew project
cd packages/agents/pr-reviewer
npm install
npm run build
```

## Usage

### Development Mode

```bash
# Set environment variables
export SOCKET_PATH=/tmp/pit-crew-orchestrator.sock

# Start the agent
npm run dev
```

### Production Mode

```bash
npm start
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/index.js"]
```

## Configuration

The agent accepts configuration through task data:

```typescript
interface SynthesisConfig {
  scoring: {
    critical_weight: number;
    high_weight: number;
    medium_weight: number;
    low_weight: number;
  };
  thresholds: {
    approve_min_score: number;
    request_changes_max_score: number;
    max_critical_issues: number;
    max_high_issues: number;
  };
  quality_gates: {
    zero_errors_tolerance: boolean;
    security_blocking: boolean;
    documentation_required: boolean;
    architecture_compliance: boolean;
  };
  output: {
    include_agent_details: boolean;
    include_recommendations: boolean;
    include_checklist: boolean;
    markdown_format: boolean;
  };
}
```

## Input/Output

### Input Task Data

```typescript
interface PRReviewerTaskData {
  scope: string[];
  context: {
    repo_root: string;
    diff?: string;
    commit_hash?: string;
    branch?: string;
    pr_number?: number;
    pr_metadata?: PRMetadata;
  };
  output?: string;
  config?: Partial<SynthesisConfig>;
  agent_reports: {
    security_report_path?: string;
    quality_report_path?: string;
    architecture_report_path?: string;
    documentation_report_path?: string;
  };
}
```

### Output Report

```typescript
interface PRReviewReport {
  run_id: string;
  timestamp: string;
  agent: 'pr_reviewer';
  pr_metadata: PRMetadata;
  synthesis: {
    overall_score: number;
    decision: 'approve' | 'request_changes' | 'needs_work';
    summary: string;
    critical_issues: AgentFinding[];
    medium_issues: AgentFinding[];
    info_items: InfoItem[];
  };
  checklist: ChecklistItem[];
  metrics: {
    security_findings: number;
    quality_issues: number;
    architecture_violations: number;
    documentation_gaps: number;
    total_tokens_used: number;
    analysis_duration_ms: number;
  };
  recommendations: Recommendation[];
}
```

## Example Usage

### Task Assignment

```json
{
  "task_id": "pr-review-abc123",
  "agent": "pr_reviewer",
  "scope": ["src/**/*.ts"],
  "context": {
    "repo_root": "/path/to/repo",
    "pr_number": 42,
    "pr_metadata": {
      "number": 42,
      "title": "Add user authentication",
      "author": "developer@example.com",
      "base_branch": "main",
      "head_branch": "feature/auth",
      "changed_files": 15,
      "lines_added": 342,
      "lines_removed": 28
    }
  },
  "output": "/tmp/pr-review-report.json",
  "config": {
    "thresholds": {
      "approve_min_score": 85,
      "max_critical_issues": 0
    }
  },
  "agent_reports": {
    "security_report_path": "/tmp/security-report.sarif",
    "quality_report_path": "/tmp/quality-report.json",
    "architecture_report_path": "/tmp/architecture-report.json",
    "documentation_report_path": "/tmp/documentation-report.json"
  }
}
```

### Sample Output

```markdown
# PR Review Report

**PR #42:** Add user authentication
**Author:** developer@example.com
**Overall Score:** 78/100
**Decision:** ⚠️ Needs Work

## Summary

PR Review completed for #42: "Add user authentication".

**Overall Score: 78/100**

**Issues Found:** 8 total
- Critical: 1
- High: 2
- Medium: 3
- Low: 2

**Agent Contributions:**
- Security: 2 issues
- Quality: 3 issues
- Architecture: 2 issues
- Documentation: 1 issue

**Recommendation:** Needs work - Address recommended improvements before merge

## 🚨 Critical Issues

### hardcoded-secret
**Agent:** security
**File:** src/auth/config.ts:15
**Description:** Hardcoded secret detected in source code
**Fix Suggestion:** Move hardcoded secrets to environment variables or secure vault

## Checklist

⏳ 🔴 Critical **Fix 1 security issue(s)**
   - *Assignee:* developer@example.com
   - *Due:* 2024-01-16

⏳ 🟡 Medium **Address 3 code quality issue(s)**
   - *Assignee:* developer@example.com

✅ 🟢 Medium **Review and test all changes**
   - *Assignee:* developer@example.com

## Recommendations

### Security (🔴 Immediate)
Address 1 critical security vulnerabilities before merging
**Estimated Effort:** 2 hours

### Code Quality (🟡 Short-term)
Refactor code to address 2 high-priority quality issues
**Estimated Effort:** 2 hours
```

## Integration with Orchestrator

The PR Reviewer Agent integrates with the Pit Crew orchestrator through Unix socket communication:

1. **Registration**: Agent registers capabilities with orchestrator
2. **Task Assignment**: Receives synthesis tasks with agent report paths
3. **Report Loading**: Loads and validates reports from other agents
4. **Synthesis**: Performs comprehensive analysis and scoring
5. **Response**: Returns structured review report to orchestrator

## Development

### Project Structure

```
src/
├── index.ts                 # Main entry point
├── types.ts                 # Type definitions
├── socket-client.ts         # Base socket client
├── pr-reviewer-agent.ts     # Main agent implementation
└── utils/
    ├── scoring.ts           # Scoring algorithms
    ├── synthesis.ts         # Synthesis logic
    └── markdown.ts          # Report generation
```

### Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

### Building

```bash
# Clean build
npm run clean

# TypeScript compilation
npm run build

# Type checking
npm run typecheck
```

## Configuration Examples

### Strict Security Configuration

```json
{
  "quality_gates": {
    "zero_errors_tolerance": true,
    "security_blocking": true,
    "architecture_compliance": true,
    "documentation_required": true
  },
  "thresholds": {
    "approve_min_score": 90,
    "max_critical_issues": 0,
    "max_high_issues": 1
  }
}
```

### Lenient Development Configuration

```json
{
  "quality_gates": {
    "zero_errors_tolerance": false,
    "security_blocking": true,
    "architecture_compliance": false,
    "documentation_required": false
  },
  "thresholds": {
    "approve_min_score": 70,
    "max_critical_issues": 0,
    "max_high_issues": 5
  }
}
```

## Monitoring and Observability

The agent provides detailed logging and metrics:

- **Task completion time**: Track synthesis duration
- **Agent contribution metrics**: Monitor agent effectiveness
- **Score distributions**: Analyze quality trends
- **Decision patterns**: Understand approval/rejection patterns

### Health Checks

```bash
# Check agent health
curl http://localhost:3000/health

# Get agent metrics
curl http://localhost:3000/metrics
```

## Troubleshooting

### Common Issues

1. **Missing Agent Reports**
   ```
   WARNING: No valid agent reports found for synthesis
   ```
   - Ensure all agent report paths are correct
   - Verify reports exist and are valid JSON

2. **Socket Connection Issues**
   ```
   ERROR: Failed to connect to orchestrator
   ```
   - Check orchestrator is running
   - Verify socket path is correct
   - Check permissions

3. **Scoring Errors**
   ```
   ERROR: Invalid severity configuration
   ```
   - Verify scoring weights are positive numbers
   - Check threshold values are within valid ranges

### Debug Mode

```bash
# Enable debug logging
DEBUG=pr-reviewer:* npm start

# Verbose mode
VERBOSE=true npm start
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Development Guidelines

- Follow TypeScript strict mode
- Add comprehensive tests
- Update documentation
- Use semantic versioning
- Follow conventional commits

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/pit-crew/pr-reviewer-agent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/pit-crew/pr-reviewer-agent/discussions)
- **Documentation**: [Pit Crew Docs](https://docs.pit-crew.dev)