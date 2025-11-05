/**
 * Supervisor Agent - Validation and Routing Intelligence
 *
 * Main entry point for the Supervisor Agent that validates agent health
 * and routes tasks to appropriate agents based on skills, priorities, and context.
 */

export { SupervisorAgent } from './supervisor.js';
export type { SupervisorDecision, SupervisorAgentConfig } from './supervisor.js';

// Validators
export { HealthValidator } from './validators/health-validator.js';
export type { HealthValidationConfig, HealthValidationResult } from './validators/health-validator.js';

export { RoutingValidator } from './validators/routing-validator.js';
export type { RoutingValidationConfig, RoutingValidationResult, RoutingPlan } from './validators/routing-validator.js';

// Routers
export { SkillRouter } from './routers/skill-router.js';
export type { SkillRoutingConfig } from './routers/skill-router.js';

export { PriorityRouter } from './routers/priority-router.js';
export type { PriorityRoutingConfig, PriorityRoutingResult } from './routers/priority-router.js';

// Version
export const VERSION = '1.0.0';
