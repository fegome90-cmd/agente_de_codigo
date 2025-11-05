/**
 * Simplified Two-Man Rule Integration
 *
 * Basic implementation to fix compilation issues
 *
 * @author Pit Crew v2.0.0
 * @since 2025-11-03
 */

import {
  GitEvent,
  AgentHealth,
  AgentTask,
  TaskStatus
} from '@pit-crew/shared';
import type { HybridWorkflowState as WorkflowState } from '@pit-crew/shared';
import { TwoManRule } from './two-man-rule-simple.js';
import { ApprovalStatus, OperationSeverity } from './two-man-rule-simple.js';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';

// Type definitions
interface TwoManRuleIntegrationConfig {
  enableWorkflowApproval: boolean;
  enableAgentApproval: boolean;
  enableConfigurationApproval: boolean;
  autoApproveLowRisk: boolean;
  autoApproveTestEnvironments: boolean;
  maxWaitTime: number;
  checkInterval: number;
  preApprovalHook?: (operation: any) => Promise<boolean>;
  postApprovalHook?: (request: any) => Promise<void>;
  rejectionHook?: (request: any) => Promise<void>;
}

enum CriticalOperationType {
  AGENT_DEPLOYMENT = 'agent_deployment',
  WORKFLOW_OVERRIDE = 'workflow_override',
  SECURITY_BYPASS = 'security_bypass',
  SYSTEM_SHUTDOWN = 'system_shutdown',
  CONFIGURATION_CHANGE = 'configuration_change',
  CRITICAL_SECURITY_FIX = 'critical_security_fix',
  PRODUCTION_DEPLOYMENT = 'production_deployment',
  EMERGENCY_MAINTENANCE = 'emergency_maintenance'
}

interface CriticalOperation {
  type: CriticalOperationType;
  data: any;
  requester: string;
  environment: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  affectedComponents: string[];
  estimatedImpact: string;
  rollbackPlan?: string;
}

/**
 * Simplified Two-Man Rule integration manager
 */
export class TwoManRuleIntegration extends EventEmitter {
  private twoManRule: TwoManRule;
  private config: TwoManRuleIntegrationConfig;
  private pendingApprovals: Map<string, {
    resolve: (value: boolean) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(config: Partial<TwoManRuleIntegrationConfig> = {}) {
    super();

    this.config = {
      enableWorkflowApproval: true,
      enableAgentApproval: true,
      enableConfigurationApproval: true,
      autoApproveLowRisk: true,
      autoApproveTestEnvironments: true,
      maxWaitTime: 300000, // 5 minutes
      checkInterval: 5000, // 5 seconds
      ...config
    };

    this.twoManRule = new TwoManRule({
      criticalOperations: [
        {
          operationType: CriticalOperationType.WORKFLOW_OVERRIDE,
          requiresApproval: true,
          approvers: ['workflow_manager', 'admin'],
          timeout: 300000, // 5 minutes
          conditions: ['critical_path_override']
        }
      ]
    });

    this.setupEventListeners();

    logger.info('Two-Man Rule integration initialized', { config: this.config });
  }

  /**
   * Check if workflow execution requires approval
   */
  async requiresWorkflowApproval(workflowState: WorkflowState): Promise<{
    required: boolean;
    operation?: CriticalOperation;
    reason: string;
  }> {
    if (!this.config.enableWorkflowApproval) {
      return { required: false, reason: 'Workflow approval is disabled' };
    }

    // Check for critical operations in workflow
    const criticalOperation = this.identifyCriticalWorkflowOperation(workflowState);

    if (!criticalOperation) {
      return { required: false, reason: 'No critical operations detected' };
    }

    // Check for auto-approval conditions
    if (await this.shouldAutoApprove(criticalOperation)) {
      return { required: false, reason: 'Auto-approved due to low risk or test environment' };
    }

    // Check if approval is already required by Two-Man Rule
    const approvalCheck = this.twoManRule.requiresApproval(
      criticalOperation.type,
      criticalOperation.data
    );

    return {
      required: approvalCheck.required,
      operation: criticalOperation,
      reason: approvalCheck.reason
    };
  }

  /**
   * Request approval for workflow execution
   */
  async requestWorkflowApproval(
    workflowState: WorkflowState,
    operation: CriticalOperation
  ): Promise<{ approved: boolean; requestId?: string; message?: string }> {
    try {
      // Execute pre-approval hook if configured
      if (this.config.preApprovalHook) {
        const canProceed = await this.config.preApprovalHook(operation);
        if (!canProceed) {
          return { approved: false, message: 'Pre-approval hook rejected the operation' };
        }
      }

      // Create approval request
      const request = await this.twoManRule.createApprovalRequest(
        operation.type,
        operation.data,
        operation.requester,
        {
          workflowId: this.generateWorkflowId(workflowState),
          gitEvent: workflowState.gitEvent,
          affectedComponents: operation.affectedComponents,
          estimatedImpact: operation.estimatedImpact
        }
      );

      // Wait for approval
      const approved = await this.waitForApproval(request.id);

      if (approved) {
        // Execute post-approval hook if configured
        if (this.config.postApprovalHook) {
          await this.config.postApprovalHook(request);
        }

        logger.info('Workflow approval granted', {
          requestId: request.id,
          operationType: operation.type,
          workflowId: this.generateWorkflowId(workflowState)
        });

        return { approved: true, requestId: request.id };
      } else {
        // Execute rejection hook if configured
        if (this.config.rejectionHook) {
          await this.config.rejectionHook(request);
        }

        logger.warn('Workflow approval rejected or expired', {
          requestId: request.id,
          operationType: operation.type,
          workflowId: this.generateWorkflowId(workflowState)
        });

        return { approved: false, requestId: request.id, message: 'Approval rejected or expired' };
      }

    } catch (error) {
      logger.error('Workflow approval request failed', {
        error: (error as Error).message,
        operationType: operation.type,
        workflowId: this.generateWorkflowId(workflowState)
      });

      return { approved: false, message: `Approval request failed: ${(error as Error).message}` };
    }
  }

  /**
   * Approve a pending request
   */
  async approveRequest(
    requestId: string,
    approver: string,
    approverRole: string,
    reason?: string
  ): Promise<void> {
    await this.twoManRule.approveRequest(requestId, approver, approverRole, reason);

    // Resolve waiting promise
    const pending = this.pendingApprovals.get(requestId);
    if (pending) {
      pending.resolve(true);
      clearTimeout(pending.timeout);
      this.pendingApprovals.delete(requestId);
    }
  }

  /**
   * Reject a pending request
   */
  async rejectRequest(
    requestId: string,
    approver: string,
    approverRole: string,
    reason: string
  ): Promise<void> {
    await this.twoManRule.rejectRequest(requestId, approver, approverRole, reason);

    // Resolve waiting promise
    const pending = this.pendingApprovals.get(requestId);
    if (pending) {
      pending.resolve(false);
      clearTimeout(pending.timeout);
      this.pendingApprovals.delete(requestId);
    }
  }

  /**
   * Get approval status
   */
  getApprovalStatus(requestId: string): {
    status: ApprovalStatus;
    request?: any;
    approved: boolean;
    pending: boolean;
  } {
    const request = this.twoManRule.getRequest(requestId);

    if (!request) {
      return {
        status: ApprovalStatus.CANCELLED,
        approved: false,
        pending: false
      };
    }

    return {
      status: request.status,
      request,
      approved: request.status === ApprovalStatus.APPROVED,
      pending: request.status === ApprovalStatus.PENDING
    };
  }

  /**
   * Get pending approvals for user/role
   */
  getPendingApprovals(user?: string, role?: string): any[] {
    return this.twoManRule.getRequests({
      status: ApprovalStatus.PENDING
    }).filter(request => {
      // TODO: Filter by user/role authorization
      return true;
    });
  }

  /**
   * Get integration metrics
   */
  getMetrics(): any {
    const twoManRuleMetrics = this.twoManRule.getMetrics();

    return {
      ...twoManRuleMetrics,
      integrationMetrics: {
        pendingApprovals: this.pendingApprovals.size,
        workflowApprovalsEnabled: this.config.enableWorkflowApproval,
        agentApprovalsEnabled: this.config.enableAgentApproval,
        autoApprovalEnabled: this.config.autoApproveLowRisk
      }
    };
  }

  // Private helper methods

  private identifyCriticalWorkflowOperation(workflowState: WorkflowState): CriticalOperation | null {
    const { gitEvent } = workflowState;

    // Production deployment
    if (gitEvent.branch === 'main' || gitEvent.branch === 'master') {
      return {
        type: CriticalOperationType.PRODUCTION_DEPLOYMENT,
        data: {
          environment: 'production',
          branch: gitEvent.branch,
          files: gitEvent.files
        },
        requester: 'system',
        environment: 'production',
        riskLevel: 'high',
        affectedComponents: ['application', 'database'],
        estimatedImpact: 'Production deployment affecting all users'
      };
    }

    return null;
  }

  private async shouldAutoApprove(operation: CriticalOperation): Promise<boolean> {
    // Auto-approve low risk operations
    if (this.config.autoApproveLowRisk && operation.riskLevel === 'low') {
      return true;
    }

    // Auto-approve test environments
    if (this.config.autoApproveTestEnvironments && operation.environment === 'test') {
      return true;
    }

    return false;
  }

  private async waitForApproval(requestId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingApprovals.delete(requestId);
        resolve(false); // Timeout = not approved
      }, this.config.maxWaitTime);

      this.pendingApprovals.set(requestId, {
        resolve,
        reject,
        timeout
      });
    });
  }

  private generateWorkflowId(workflowState: WorkflowState): string {
    return `${workflowState.gitEvent.type}-${workflowState.gitEvent.commitHash}`;
  }

  private setupEventListeners(): void {
    this.twoManRule.on('requestApproved', (request) => {
      this.emit('approvalGranted', request);
    });

    this.twoManRule.on('requestRejected', (request) => {
      this.emit('approvalRejected', request);
    });

    this.twoManRule.on('requestExpired', (request) => {
      this.emit('approvalExpired', request);
    });

    this.twoManRule.on('emergencyOverride', (request) => {
      this.emit('emergencyOverride', request);
    });
  }

  /**
   * Destroy integration and cleanup
   */
  public destroy(): void {
    // Clear all pending approvals
    this.pendingApprovals.forEach(({ timeout }) => {
      clearTimeout(timeout);
    });
    this.pendingApprovals.clear();

    this.removeAllListeners();
    this.twoManRule.destroy();

    logger.info('Two-Man Rule integration destroyed');
  }
}
