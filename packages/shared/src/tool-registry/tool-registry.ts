/**
 * Tool Registry - Centralized Tool Configuration Management
 *
 * Provides a centralized registry for all tool configurations across agents,
 * eliminating duplicated configurations and providing single source of truth.
 */

import { z } from "zod";
import winston from "winston";

/**
 * Tool configuration interface
 */
export const ToolConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: z.enum([
    "security",
    "quality",
    "documentation",
    "architecture",
    "general",
  ]),
  command: z.string(),
  args: z.array(z.string()).default([]),
  timeout: z.number().positive().default(30000), // 30 seconds
  maxRetries: z.number().min(0).max(5).default(3),
  allowedAgents: z.array(z.string()),
  requiredFiles: z.array(z.string()).default([]),
  outputFile: z.string().optional(),
  outputPath: z.string().optional(),
  environment: z.record(z.string()).default({}),
  enabled: z.boolean().default(true),
  version: z.string().default("1.0.0"),
  dependencies: z.array(z.string()).default([]),
  costMultiplier: z.number().min(0.1).max(5).default(1.0),
  memoryMultiplier: z.number().min(0.5).max(3).default(1.0),
});

export type ToolConfig = z.infer<typeof ToolConfigSchema>;

/**
 * Tool Registry configuration
 */
export const ToolRegistryConfigSchema = z.object({
  enableValidation: z.boolean().default(true),
  enableMetrics: z.boolean().default(true),
  enableFallback: z.boolean().default(true),
  defaultTimeout: z.number().positive().default(30000),
  maxConcurrentTools: z.number().min(1).max(20).default(10),
});

export type ToolRegistryConfig = z.infer<typeof ToolRegistryConfigSchema>;

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  executionTime: number;
  memoryUsage: number;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Tool Registry
 * Centralized registry for managing tool configurations across all agents
 */
export class ToolRegistry {
  private logger: winston.Logger;
  private config: ToolRegistryConfig;
  private tools: Map<string, ToolConfig> = new Map();
  private toolMetrics: Map<
    string,
    {
      executions: number;
      successRate: number;
      avgExecutionTime: number;
      avgMemoryUsage: number;
      lastExecution: Date;
    }
  > = new Map();

  constructor(config: Partial<ToolRegistryConfig> = {}) {
    this.config = ToolRegistryConfigSchema.parse(config);

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || "info",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.prettyPrint(),
      ),
      defaultMeta: { service: "tool-registry" },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),
        new winston.transports.File({
          filename: "./logs/tool-registry.log",
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
      ],
    });

    this.initializeDefaultTools();
    this.logger.info("Tool Registry initialized", {
      toolCount: this.tools.size,
      config: this.config,
    });
  }

  /**
   * Register a new tool
   */
  register(toolConfig: ToolConfig): void {
    // Validate tool configuration
    if (this.config.enableValidation) {
      const validatedConfig = ToolConfigSchema.parse(toolConfig);
      this.tools.set(validatedConfig.name, validatedConfig);
    } else {
      this.tools.set(toolConfig.name, toolConfig);
    }

    // Initialize metrics for new tool
    if (!this.toolMetrics.has(toolConfig.name)) {
      this.toolMetrics.set(toolConfig.name, {
        executions: 0,
        successRate: 0,
        avgExecutionTime: 0,
        avgMemoryUsage: 0,
        lastExecution: new Date(),
      });
    }

    this.logger.info("Tool registered", {
      toolName: toolConfig.name,
      type: toolConfig.type,
    });
  }

  /**
   * Get tool configuration by name
   */
  get(toolName: string): ToolConfig | undefined {
    const tool = this.tools.get(toolName);
    if (!tool) {
      this.logger.warn("Tool not found", { toolName });
    }
    return tool;
  }

  /**
   * Get all tools
   */
  getAll(): ToolConfig[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools for a specific agent
   */
  getToolsForAgent(agentName: string): ToolConfig[] {
    const agentTools = Array.from(this.tools.values()).filter(
      (tool) => tool.allowedAgents.includes(agentName) && tool.enabled,
    );

    this.logger.debug("Retrieved tools for agent", {
      agentName,
      toolCount: agentTools.length,
      toolNames: agentTools.map((t) => t.name),
    });

    return agentTools;
  }

  /**
   * Get tools by type
   */
  getToolsByType(type: ToolConfig["type"]): ToolConfig[] {
    return Array.from(this.tools.values()).filter(
      (tool) => tool.type === type && tool.enabled,
    );
  }

  /**
   * Update tool configuration
   */
  update(toolName: string, updates: Partial<ToolConfig>): boolean {
    const existingTool = this.tools.get(toolName);
    if (!existingTool) {
      this.logger.warn("Cannot update non-existent tool", { toolName });
      return false;
    }

    const updatedTool = { ...existingTool, ...updates };

    if (this.config.enableValidation) {
      const validatedTool = ToolConfigSchema.parse(updatedTool);
      this.tools.set(toolName, validatedTool);
    } else {
      this.tools.set(toolName, updatedTool);
    }

    this.logger.info("Tool updated", { toolName, updates });
    return true;
  }

  /**
   * Remove a tool from registry
   */
  remove(toolName: string): boolean {
    const removed = this.tools.delete(toolName);
    if (removed) {
      this.toolMetrics.delete(toolName);
      this.logger.info("Tool removed", { toolName });
    } else {
      this.logger.warn("Cannot remove non-existent tool", { toolName });
    }
    return removed;
  }

  /**
   * Enable or disable a tool
   */
  setEnabled(toolName: string, enabled: boolean): boolean {
    return this.update(toolName, { enabled });
  }

  /**
   * Check if a tool exists
   */
  has(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /**
   * Get tool metrics
   */
  getMetrics(toolName?: string): Record<string, any> {
    if (toolName) {
      const metrics = this.toolMetrics.get(toolName);
      const tool = this.tools.get(toolName);

      return {
        tool: tool || null,
        metrics: metrics || null,
      };
    }

    // Return all metrics
    const allMetrics: Record<string, any> = {};
    for (const [name, metrics] of this.toolMetrics.entries()) {
      allMetrics[name] = {
        tool: this.tools.get(name),
        metrics,
      };
    }

    return allMetrics;
  }

  /**
   * Update tool execution metrics
   */
  updateMetrics(toolName: string, result: ToolExecutionResult): void {
    if (!this.config.enableMetrics) {
      return;
    }

    const currentMetrics = this.toolMetrics.get(toolName);
    if (!currentMetrics) {
      return;
    }

    // Update running averages
    const newExecutions = currentMetrics.executions + 1;
    const newSuccessRate =
      currentMetrics.successRate === 0
        ? result.success
          ? 1
          : 0
        : (currentMetrics.successRate * currentMetrics.executions +
            (result.success ? 1 : 0)) /
          newExecutions;

    const newAvgExecutionTime =
      currentMetrics.avgExecutionTime === 0
        ? result.executionTime
        : (currentMetrics.avgExecutionTime * currentMetrics.executions +
            result.executionTime) /
          newExecutions;

    const newAvgMemoryUsage =
      currentMetrics.avgMemoryUsage === 0
        ? result.memoryUsage
        : (currentMetrics.avgMemoryUsage * currentMetrics.executions +
            result.memoryUsage) /
          newExecutions;

    this.toolMetrics.set(toolName, {
      executions: newExecutions,
      successRate: newSuccessRate,
      avgExecutionTime: newAvgExecutionTime,
      avgMemoryUsage: newAvgMemoryUsage,
      lastExecution: new Date(),
    });

    this.logger.debug("Tool metrics updated", {
      toolName,
      success: result.success,
      executionTime: result.executionTime,
      newSuccessRate,
      newAvgExecutionTime,
    });
  }

  /**
   * Find alternative tools for a given tool
   */
  findAlternatives(toolName: string, agentName: string): ToolConfig[] {
    const originalTool = this.tools.get(toolName);
    if (!originalTool) {
      return [];
    }

    return Array.from(this.tools.values()).filter(
      (tool) =>
        tool.name !== toolName &&
        tool.type === originalTool.type &&
        tool.allowedAgents.includes(agentName) &&
        tool.enabled,
    );
  }

  /**
   * Validate tool dependencies
   */
  validateDependencies(toolName: string): {
    valid: boolean;
    missingDeps: string[];
  } {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { valid: false, missingDeps: [toolName] };
    }

    const missingDeps: string[] = [];
    for (const dep of tool.dependencies) {
      if (!this.tools.has(dep)) {
        missingDeps.push(dep);
      }
    }

    return {
      valid: missingDeps.length === 0,
      missingDeps,
    };
  }

  /**
   * Get registry statistics
   */
  getStatistics(): {
    totalTools: number;
    enabledTools: number;
    toolsByType: Record<string, number>;
    toolsByAgent: Record<string, number>;
    totalExecutions: number;
    averageSuccessRate: number;
  } {
    const tools = Array.from(this.tools.values());
    const enabledTools = tools.filter((tool) => tool.enabled);

    // Tools by type
    const toolsByType: Record<string, number> = {};
    for (const tool of tools) {
      toolsByType[tool.type] = (toolsByType[tool.type] || 0) + 1;
    }

    // Tools by agent
    const toolsByAgent: Record<string, number> = {};
    for (const tool of tools) {
      for (const agent of tool.allowedAgents) {
        toolsByAgent[agent] = (toolsByAgent[agent] || 0) + 1;
      }
    }

    // Execution statistics
    const allMetrics = Array.from(this.toolMetrics.values());
    const totalExecutions = allMetrics.reduce(
      (sum, metrics) => sum + metrics.executions,
      0,
    );
    const averageSuccessRate =
      allMetrics.length > 0
        ? allMetrics.reduce((sum, metrics) => sum + metrics.successRate, 0) /
          allMetrics.length
        : 0;

    return {
      totalTools: tools.length,
      enabledTools: enabledTools.length,
      toolsByType,
      toolsByAgent,
      totalExecutions,
      averageSuccessRate,
    };
  }

  /**
   * Export registry configuration
   */
  export(): Record<string, ToolConfig> {
    const exported: Record<string, ToolConfig> = {};
    for (const [name, tool] of this.tools.entries()) {
      exported[name] = { ...tool };
    }
    return exported;
  }

  /**
   * Import registry configuration
   */
  import(tools: Record<string, ToolConfig>): void {
    for (const [name, tool] of Object.entries(tools)) {
      this.register({ ...tool, name });
    }
    this.logger.info("Registry imported", {
      toolCount: Object.keys(tools).length,
    });
  }

  /**
   * Initialize default tools
   */
  private initializeDefaultTools(): void {
    // Security tools
    this.register({
      name: "semgrep",
      description: "Static analysis security scanning",
      type: "security",
      command: "semgrep",
      args: ["--config=auto", "--json", "--output=${outputPath}"],
      timeout: 60000,
      allowedAgents: ["security"],
      outputPath: "reports/security-semgrep.json",
      costMultiplier: 1.2,
      memoryMultiplier: 1.5,
    } as ToolConfig);

    this.register({
      name: "gitleaks",
      description: "Secret detection scanning",
      type: "security",
      command: "gitleaks",
      args: [
        "detect",
        "--source=${scope}",
        "--report-path=${outputPath}",
        "--report-format=json",
      ],
      timeout: 30000,
      maxRetries: 3,
      allowedAgents: ["security"],
      requiredFiles: [],
      environment: {},
      enabled: true,
      version: "1.0.0",
      dependencies: [],
      outputPath: "reports/security-gitleaks.json",
      costMultiplier: 1.0,
      memoryMultiplier: 1.2,
    });

    this.register({
      name: "osv-scanner",
      description: "Dependency vulnerability scanning",
      type: "security",
      command: "osv-scanner",
      args: ["--json", "--output=${outputPath}", "scan", "${scope}"],
      timeout: 45000,
      maxRetries: 3,
      allowedAgents: ["security"],
      requiredFiles: [],
      outputPath: "reports/security-osv.json",
      environment: {},
      enabled: true,
      version: "1.0.0",
      dependencies: ["osv-scanner"],
      costMultiplier: 1.1,
      memoryMultiplier: 1.3,
    });

    // Quality tools
    this.register({
      name: "ruff",
      description: "Python linting and formatting",
      type: "quality",
      command: "ruff",
      args: ["check", "--output-format=json", "${scope}"],
      timeout: 15000,
      maxRetries: 3,
      allowedAgents: ["quality"],
      requiredFiles: [],
      environment: {},
      enabled: true,
      version: "1.0.0",
      dependencies: ["ruff"],
      costMultiplier: 0.8,
      memoryMultiplier: 1.0,
    });

    this.register({
      name: "eslint",
      description: "JavaScript/TypeScript linting",
      type: "quality",
      command: "eslint",
      args: ["--format=json", "--output-file=${outputPath}", "${scope}"],
      timeout: 20000,
      maxRetries: 3,
      allowedAgents: ["quality"],
      requiredFiles: [],
      outputPath: "reports/quality-eslint.json",
      environment: {},
      enabled: true,
      version: "1.0.0",
      dependencies: ["eslint"],
      costMultiplier: 0.9,
      memoryMultiplier: 1.1,
    });

    this.register({
      name: "lizard",
      description: "Code complexity analysis",
      type: "quality",
      command: "lizard",
      args: ["-l", "javascript", "-l", "python", "-x", '"*.json"', "${scope}"],
      timeout: 10000,
      maxRetries: 3,
      allowedAgents: ["quality"],
      requiredFiles: [],
      environment: {},
      enabled: true,
      version: "1.0.0",
      dependencies: ["lizard"],
      costMultiplier: 0.7,
      memoryMultiplier: 1.0,
    });

    // Documentation tools
    this.register({
      name: "openapi-parser",
      description: "OpenAPI specification validation",
      type: "documentation",
      command: "swagger-parser",
      args: ["validate", "${scope}"],
      timeout: 15000,
      maxRetries: 3,
      allowedAgents: ["documentation"],
      requiredFiles: [],
      environment: {},
      enabled: true,
      version: "1.0.0",
      dependencies: ["@apidevtools/swagger-parser"],
      costMultiplier: 0.8,
      memoryMultiplier: 1.2,
    });

    // Architecture tools
    this.register({
      name: "tree-sitter",
      description: "AST parsing and structure analysis",
      type: "architecture",
      command: "tree-sitter",
      args: ["parse", "${scope}"],
      timeout: 30000,
      maxRetries: 3,
      allowedAgents: ["architecture"],
      requiredFiles: [],
      environment: {},
      enabled: true,
      version: "1.0.0",
      dependencies: [],
      costMultiplier: 1.0,
      memoryMultiplier: 1.5,
    });

    this.logger.info("Default tools initialized", {
      toolCount: this.tools.size,
      toolNames: Array.from(this.tools.keys()),
    });
  }
}

// Export singleton instance
export const toolRegistry = new ToolRegistry();

