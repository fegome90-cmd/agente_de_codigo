# Supervisor Agent

**Purpose**: Central validation and routing intelligence for the Pit Crew Multi-Agent System.

## Overview

The Supervisor Agent is responsible for:
- Validating agent health and availability
- Calculating optimal routing plans based on skills and context
- Prioritizing agents based on multiple factors (health, load, priority)
- Providing fallback strategies when preferred agents are unavailable

## Architecture

```
SupervisorAgent
├── Validators/
│   ├── HealthValidator      # Validates agent health status
│   └── RoutingValidator     # Validates routing decisions
├── Routers/
│   ├── SkillRouter         # Routes based on agent skills
│   └── PriorityRouter      # Optimizes based on priorities
└── Supervisor.ts           # Main coordinator
```

## Usage

```typescript
import { SupervisorAgent } from '@pit-crew/supervisor-agent';

const supervisor = new SupervisorAgent({
  healthValidation: {
    minimumHealthyAgents: 2,
    maxResponseTime: 5000,
  },
  priorityRouting: {
    maxConcurrentAgents: 5,
  },
});

const decision = await supervisor.validateAndRoute(
  gitEvent,
  availableAgents,
  skillRules
);
```

## Configuration

The supervisor agent accepts configuration for:

- **Health Validation**: Minimum healthy agents, response time thresholds
- **Routing Validation**: Maximum agents per task, cost/duration limits
- **Skill Routing**: Default agents, security patterns, API patterns
- **Priority Routing**: Agent priorities, concurrent limits, fallback strategies

## Decision Process

1. **Health Validation**: Filter available healthy agents
2. **Skill Routing**: Calculate routing based on git event characteristics
3. **Routing Validation**: Validate routing plan against context and constraints
4. **Priority Optimization**: Optimize agent selection based on priorities and load
5. **Final Decision**: Generate confidence score and recommendations

## API

### `validateAndRoute(gitEvent, availableAgents, skillRules)`

Main method that returns a `SupervisorDecision` containing:

- `routingPlan`: Final routing plan with selected agents
- `validationResults`: Results from each validation step
- `recommendations`: Actionable recommendations
- `warnings`: Warning messages
- `errors`: Error messages
- `confidence`: Decision confidence score (0-100)

### `getHealthStatus()`

Returns the health status of the supervisor agent itself.

### `validate()`

Runs internal validation tests to ensure all components are working correctly.

## Integration

The supervisor agent is designed to be integrated into the orchestrator workflow:

```typescript
// In orchestrator
const supervisor = new SupervisorAgent();
const decision = await supervisor.validateAndRoute(gitEvent, agentHealth, skillRules);

// Use decision to spawn agents
for (const agent of decision.routingPlan.agents) {
  await spawnAgent(agent, gitEvent);
}
```

## Logging

The supervisor agent uses Winston for structured logging with:

- Console output for development
- File rotation for production
- JSON format for log analysis
- Different log levels for components

## Testing

The supervisor agent includes comprehensive validation:

```typescript
const validation = await supervisor.validate();
console.log(validation.valid); // true/false
console.log(validation.tests); // detailed test results
```

## Error Handling

The supervisor agent implements graceful degradation:

- Falls back to basic routing if validation fails
- Uses alternative plans when primary plan is invalid
- Provides detailed error reporting and recommendations
- Maintains system stability during failures