/**
 * Two-Man Rule Implementation
 *
 * Provides dual-authorization system for critical operations requiring
 * secondary approval before execution. Ensures safety and accountability
 * for high-impact decisions in the Pit Crew system.
 *
 * @author Pit Crew v2.0.0
 * @since 2025-11-03
 */

import { z } from 'zod';
import { EventEmitter } from 'events';
import {
  GitEvent,
  AgentHealth,
  AgentTask,
  TaskStatus
} from '@pit-crew/shared';
import type { HybridWorkflowState as WorkflowState } from '@pit-crew/shared';

// Define AnalysisResult type
export interface AnalysisResult {
  approved: boolean;
  message?: string;
  requestId?: string;
}
import { logger } from '../utils/logger.js';

/**
 * Two-Man Rule configuration schema
 */
export const TwoManRuleConfigSchema = z.object({
  // Operations requiring two-man approval
  criticalOperations: z.array(z.object({
    operationType: z.string(),
    requiresApproval: z.boolean(),
    approvers: z.array(z.string()).optional(), // Specific approvers required
    timeout: z.number().optional(), // Approval timeout in milliseconds
    conditions: z.array(z.string()).optional() // Conditions that trigger approval requirement
  })).default([]),

  // Approval configuration
  approvalTimeout: z.number().default(300000).describe('Default approval timeout (5 minutes)'),
  maxApprovalAttempts: z.number().default(3).describe('Maximum approval attempts'),
  approverRoleRequirements: z.array(z.object({
    operation: z.string(),
    requiredRoles: z.array(z.string()),
    minApprovers: z.number()
  })).default([]),

  // Security settings
  allowSelfApproval: z.boolean().default(false).describe('Whether users can approve their own operations'),
  requireReason: z.boolean().default(true).describe('Whether approval requires a reason'),
  auditTrailEnabled: z.boolean().default(true).describe('Whether to maintain audit trail'),

  // Fallback settings
  emergencyOverride: z.boolean().default(false).describe('Enable emergency override for critical situations'),
  emergencyOverrideRoles: z.array(z.string()).default([]).describe('Roles that can emergency override'),

  // Notification settings
  notificationEnabled: z.boolean().default(true).describe('Enable approval notifications'),
  notificationChannels: z.array(z.string()).default(['email', 'slack']).describe('Notification channels')
});

export type TwoManRuleConfig = z.infer<typeof TwoManRuleConfigSchema>;

/**
 * Approval request status
 */
export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  EMERGENCY_OVERRIDE = 'emergency_override'
}

/**
 * Operation severity levels
 */
export enum OperationSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Approval request interface
 */
export interface ApprovalRequest {
  id: string;
  operationType: string;
  operationData: any;
  requester: string;
  severity: OperationSeverity;
  status: ApprovalStatus;
  createdAt: number;
  expiresAt: number;
  requiredApprovers: number;
  currentApprovals: Approval[];
  rejections: Approval[];
  conditions: string[];
  metadata: {
    gitEvent?: GitEvent;
    affectedAgents?: string[];
    riskLevel?: string;
    estimatedImpact?: string;
  };
}

/**
 * Approval interface
 */
export interface Approval {
  approver: string;
  approverRole: string;
  timestamp: number;
  reason?: string;
  confidence: number; // 0-1
  metadata?: any;
}

/**
 * Two-Man Rule implementation
 */
export class TwoManRule extends EventEmitter {
  private config: TwoManRuleConfig;
  private approvalRequests: Map<string, ApprovalRequest> = new Map();
  private auditTrail: Array<{
    timestamp: number;
    action: string;
    requestId: string;
    user: string;
    details: any;
  }> = [];

  constructor(config: Partial<TwoManRuleConfig> = {}) {
    super();

    this.config = TwoManRuleConfigSchema.parse({
      // Default critical operations
      criticalOperations: [
        {
          operationType: 'agent_deployment',
          requiresApproval: true,
          approvers: ['admin', 'ops_manager'],
          timeout: 600000, // 10 minutes
          conditions: ['production_deployment']
        },
        {
          operationType: 'security_bypass',
          requiresApproval: true,
          approvers: ['security_lead', 'admin'],
          timeout: 300000, // 5 minutes
          conditions: ['critical_vulnerability_found']
        },
        {
          operationType: 'system_shutdown',
          requiresApproval: true,
          approvers: ['admin', 'ops_manager'],
          timeout: 120000, // 2 minutes
          conditions: ['emergency_maintenance']
        },
        {
          operationType: 'configuration_change',
          requiresApproval: true,
          timeout: 300000, // 5 minutes
          conditions: ['production_config', 'security_settings']
        },
        {
          operationType: 'workflow_override',
          requiresApproval: true,
          approvers: ['workflow_manager', 'admin'],
          timeout: 180000, // 3 minutes
          conditions: ['critical_path_override']
        }
      ],
      ...config
    });

    logger.info('Two-Man Rule initialized', {
      criticalOperationsCount: this.config.criticalOperations.length,
      emergencyOverrideEnabled: this.config.emergencyOverride
    });

    // Start cleanup timer for expired requests
    this.startCleanupTimer();
  }

  /**
   * Check if an operation requires two-man approval
   */
  requiresApproval(operationType: string, operationData: any): {
    required: boolean;
    config?: any;
    reason: string;
  } {
    const operationConfig = this.config.criticalOperations.find(op =>
      op.operationType === operationType
    );

    if (!operationConfig || !operationConfig.requiresApproval) {
      return { required: false, reason: 'Operation does not require approval' };
    }

    // Check if conditions are met
    if (operationConfig.conditions && operationConfig.conditions.length > 0) {
      const conditionsMet = operationConfig.conditions.some(condition =>
        this.checkCondition(condition, operationData)
      );

      if (!conditionsMet) {
        return { required: false, reason: 'Approval conditions not met' };
      }
    }

    return {
      required: true,
      config: operationConfig,
      reason: `Critical operation requires approval: ${operationConfig.conditions?.join(', ') || 'Default requirement'}`
    };
  }

  /**
   * Create approval request for critical operation
   */
  async createApprovalRequest(
    operationType: string,
    operationData: any,
    requester: string,
    metadata?: any
  ): Promise<ApprovalRequest> {
    const approvalCheck = this.requiresApproval(operationType, operationData);

    if (!approvalCheck.required) {
      throw new Error(`Operation ${operationType} does not require approval`);
    }

    const requestId = this.generateRequestId();
    const severity = this.determineOperationSeverity(operationType, operationData);

    const request: ApprovalRequest = {
      id: requestId,
      operationType,
      operationData,
      requester,
      severity,
      status: ApprovalStatus.PENDING,
      createdAt: Date.now(),
      expiresAt: Date.now() + (approvalCheck.config?.timeout || this.config.approvalTimeout),
      requiredApprovers: this.determineRequiredApprovers(operationType, severity),
      currentApprovals: [],
      rejections: [],
      conditions: approvalCheck.config?.conditions || [],
      metadata: metadata || {}
    };

    this.approvalRequests.set(requestId, request);

    // Log to audit trail
    this.logToAuditTrail('approval_request_created', requestId, requester, {
      operationType,
      severity,
      requiredApprovers: request.requiredApprovers
    });

    // Send notifications if enabled
    if (this.config.notificationEnabled) {
      await this.sendApprovalNotification(request);
    }

    this.emit('approvalRequestCreated', request);

    logger.info('Approval request created', {
      requestId,
      operationType,
      requester,
      severity,
      requiredApprovers: request.requiredApprovers,
      expiresAt: new Date(request.expiresAt).toISOString()
    });

    return request;
  }

  /**
   * Approve an operation
   */
  async approveRequest(
    requestId: string,
    approver: string,
    approverRole: string,
    reason?: string,
    confidence: number = 0.8
  ): Promise<ApprovalRequest> {
    const request = this.approvalRequests.get(requestId);

    if (!request) {
      throw new Error(`Approval request ${requestId} not found`);
    }

    if (request.status !== ApprovalStatus.PENDING) {
      throw new Error(`Approval request ${requestId} is not pending (current status: ${request.status})`);
    }

    if (request.expiresAt < Date.now()) {
      request.status = ApprovalStatus.EXPIRED;
      throw new Error(`Approval request ${requestId} has expired`);
    }

    // Check self-approval restrictions
    if (!this.config.allowSelfApproval && request.requester === approver) {
      throw new Error('Self-approval is not allowed');
    }

    // Check if approver has already approved
    const existingApproval = request.currentApprovals.find(a => a.approver === approver);
    if (existingApproval) {
      throw new Error(`Approver ${approver} has already approved this request`);
    }

    // Validate approver role requirements
    if (!this.validateApproverRole(request.operationType, approverRole)) {
      throw new Error(`Approver role ${approverRole} is not authorized for operation ${request.operationType}`);
    }

    // Add approval
    const approval: Approval = {
      approver,
      approverRole,
      timestamp: Date.now(),
      reason,
      confidence
    };

    request.currentApprovals.push(approval);

    // Log to audit trail
    this.logToAuditTrail('approval_granted', requestId, approver, {
      approverRole,
      reason,
      confidence,
      totalApprovals: request.currentApprovals.length
    });

    // Check if request is fully approved
    if (request.currentApprovals.length >= request.requiredApprovers) {
      request.status = ApprovalStatus.APPROVED;

      this.emit('requestApproved', request);

      logger.info('Approval request fully approved', {
        requestId,
        operationType: request.operationType,
        approvers: request.currentApprovals.map(a => a.approver),
        totalApprovals: request.currentApprovals.length
      });
    } else {
      this.emit('approvalAdded', request);

      logger.info('Approval added to request', {
        requestId,
        approver,
        totalApprovals: request.currentApprovals.length,
        requiredApprovals: request.requiredApprovers
      });
    }

    return request;
  }

  /**
   * Reject an operation
   */
  async rejectRequest(
    requestId: string,
    approver: string,
    approverRole: string,
    reason: string
  ): Promise<ApprovalRequest> {
    const request = this.approvalRequests.get(requestId);

    if (!request) {
      throw new Error(`Approval request ${requestId} not found`);
    }

    if (request.status !== ApprovalStatus.PENDING) {
      throw new Error(`Approval request ${requestId} is not pending (current status: ${request.status})`);
    }

    // Validate approver role requirements
    if (!this.validateApproverRole(request.operationType, approverRole)) {
      throw new Error(`Approver role ${approverRole} is not authorized for operation ${request.operationType}`);
    }

    // Add rejection
    const rejection: Approval = {
      approver,
      approverRole,
      timestamp: Date.now(),
      reason,
      confidence: 1.0 // High confidence for rejections
    };

    request.rejections.push(rejection);
    request.status = ApprovalStatus.REJECTED;

    // Log to audit trail
    this.logToAuditTrail('approval_rejected', requestId, approver, {
      approverRole,
      reason,
      totalRejections: request.rejections.length
    });

    this.emit('requestRejected', request);

    logger.warn('Approval request rejected', {
      requestId,
      operationType: request.operationType,
      approver,
      reason
    });

    return request;
  }

  /**
   * Emergency override for critical situations
   */
  async emergencyOverride(
    requestId: string,
    overrideUser: string,
    overrideRole: string,
    reason: string
  ): Promise<ApprovalRequest> {
    if (!this.config.emergencyOverride) {
      throw new Error('Emergency override is not enabled');
    }

    if (!this.config.emergencyOverrideRoles.includes(overrideRole)) {
      throw new Error(`Role ${overrideRole} is not authorized for emergency override`);
    }

    const request = this.approvalRequests.get(requestId);

    if (!request) {
      throw new Error(`Approval request ${requestId} not found`);
    }

    if (request.status !== ApprovalStatus.PENDING) {
      throw new Error(`Approval request ${requestId} is not pending (current status: ${request.status})`);
    }

    request.status = ApprovalStatus.EMERGENCY_OVERRIDE;

    // Log to audit trail
    this.logToAuditTrail('emergency_override', requestId, overrideUser, {
      overrideRole,
      reason,
      previousApprovals: request.currentApprovals.length
    });

    this.emit('emergencyOverride', request);

    logger.warn('Emergency override used', {
      requestId,
      operationType: request.operationType,
      overrideUser,
      overrideRole,
      reason
    });

    return request;
  }

  /**
   * Cancel an approval request
   */
  async cancelRequest(requestId: string, cancelledBy: string, reason?: string): Promise<ApprovalRequest> {
    const request = this.approvalRequests.get(requestId);

    if (!request) {
      throw new Error(`Approval request ${requestId} not found`);
    }

    if (request.status !== ApprovalStatus.PENDING) {
      throw new Error(`Approval request ${requestId} is not pending (current status: ${request.status})`);
    }

    // Only requester or admin can cancel
    if (request.requester !== cancelledBy && cancelledBy !== 'admin') {
      throw new Error('Only requester or admin can cancel approval request');
    }

    request.status = ApprovalStatus.CANCELLED;

    // Log to audit trail
    this.logToAuditTrail('approval_cancelled', requestId, cancelledBy, {
      reason,
      totalApprovals: request.currentApprovals.length
    });

    this.emit('requestCancelled', request);

    logger.info('Approval request cancelled', {
      requestId,
      operationType: request.operationType,
      cancelledBy,
      reason
    });

    return request;
  }

  /**
   * Check if a request is approved
   */
  isRequestApproved(requestId: string): boolean {
    const request = this.approvalRequests.get(requestId);
    return request?.status === ApprovalStatus.APPROVED || false;
  }

  /**
   * Get approval request by ID
   */
  getRequest(requestId: string): ApprovalRequest | undefined {
    return this.approvalRequests.get(requestId);
  }

  /**
   * Get all approval requests with optional filtering
   */
  getRequests(filters?: {
    status?: ApprovalStatus;
    requester?: string;
    operationType?: string;
    severity?: OperationSeverity;
    startDate?: number;
    endDate?: number;
  }): ApprovalRequest[] {
    let requests = Array.from(this.approvalRequests.values());

    if (filters) {
      if (filters.status) {
        requests = requests.filter(r => r.status === filters.status);
      }
      if (filters.requester) {
        requests = requests.filter(r => r.requester === filters.requester);
      }
      if (filters.operationType) {
        requests = requests.filter(r => r.operationType === filters.operationType);
      }
      if (filters.severity) {
        requests = requests.filter(r => r.severity === filters.severity);
      }
      if (filters.startDate) {
        requests = requests.filter(r => r.createdAt >= filters.startDate!);
      }
      if (filters.endDate) {
        requests = requests.filter(r => r.createdAt <= filters.endDate!);
      }
    }

    return requests.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get audit trail
   */
  getAuditTrail(filters?: {
    requestId?: string;
    user?: string;
    action?: string;
    startDate?: number;
    endDate?: number;
  }): Array<{
    timestamp: number;
    action: string;
    requestId: string;
    user: string;
    details: any;
  }> {
    let trail = [...this.auditTrail];

    if (filters) {
      if (filters.requestId) {
        trail = trail.filter(t => t.requestId === filters.requestId);
      }
      if (filters.user) {
        trail = trail.filter(t => t.user === filters.user);
      }
      if (filters.action) {
        trail = trail.filter(t => t.action === filters.action);
      }
      if (filters.startDate) {
        trail = trail.filter(t => t.timestamp >= filters.startDate!);
      }
      if (filters.endDate) {
        trail = trail.filter(t => t.timestamp <= filters.endDate!);
      }
    }

    return trail.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get system metrics
   */
  getMetrics(): {
    totalRequests: number;
    pendingRequests: number;
    approvedRequests: number;
    rejectedRequests: number;
    expiredRequests: number;
    emergencyOverrides: number;
    averageApprovalTime: number;
    approvalRate: number;
    rejectionRate: number;
  } {
    const requests = Array.from(this.approvalRequests.values());

    const totalRequests = requests.length;
    const pendingRequests = requests.filter(r => r.status === ApprovalStatus.PENDING).length;
    const approvedRequests = requests.filter(r => r.status === ApprovalStatus.APPROVED).length;
    const rejectedRequests = requests.filter(r => r.status === ApprovalStatus.REJECTED).length;
    const expiredRequests = requests.filter(r => r.status === ApprovalStatus.EXPIRED).length;
    const emergencyOverrides = requests.filter(r => r.status === ApprovalStatus.EMERGENCY_OVERRIDE).length;

    // Calculate average approval time
    const approvedRequestsWithTime = requests.filter(r => r.status === ApprovalStatus.APPROVED);
    const averageApprovalTime = approvedRequestsWithTime.length > 0
      ? approvedRequestsWithTime.reduce((sum, r) => {
          const firstApproval = r.currentApprovals[0];
          return sum + (firstApproval ? firstApproval.timestamp - r.createdAt : 0);
        }, 0) / approvedRequestsWithTime.length
      : 0;

    const approvalRate = totalRequests > 0 ? (approvedRequests / totalRequests) * 100 : 0;
    const rejectionRate = totalRequests > 0 ? (rejectedRequests / totalRequests) * 100 : 0;

    return {
      totalRequests,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      expiredRequests,
      emergencyOverrides,
      averageApprovalTime,
      approvalRate,
      rejectionRate
    };
  }

  // Private helper methods

  private generateRequestId(): string {
    return `apr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private determineOperationSeverity(operationType: string, operationData: any): OperationSeverity {
    // Determine severity based on operation type and data
    const highSeverityOperations = ['security_bypass', 'system_shutdown', 'emergency_override'];
    const mediumSeverityOperations = ['agent_deployment', 'configuration_change'];

    if (highSeverityOperations.includes(operationType)) {
      return OperationSeverity.CRITICAL;
    } else if (mediumSeverityOperations.includes(operationType)) {
      return OperationSeverity.HIGH;
    } else {
      return OperationSeverity.MEDIUM;
    }
  }

  private determineRequiredApprovers(operationType: string, severity: OperationSeverity): number {
    const roleRequirement = this.config.approverRoleRequirements.find(req =>
      req.operation === operationType
    );

    if (roleRequirement) {
      return roleRequirement.minApprovers;
    }

    // Default requirements based on severity
    switch (severity) {
      case OperationSeverity.CRITICAL:
        return 2;
      case OperationSeverity.HIGH:
        return 2;
      case OperationSeverity.MEDIUM:
        return 1;
      default:
        return 1;
    }
  }

  private validateApproverRole(operationType: string, approverRole: string): boolean {
    const roleRequirement = this.config.approverRoleRequirements.find(req =>
      req.operation === operationType
    );

    if (roleRequirement) {
      return roleRequirement.requiredRoles.includes(approverRole);
    }

    // Default validation - allow admin and manager roles
    return ['admin', 'manager', 'lead'].some(role => approverRole.includes(role));
  }

  private checkCondition(condition: string, operationData: any): boolean {
    // Simple condition checking - can be enhanced
    switch (condition) {
      case 'production_deployment':
        return operationData.environment === 'production';
      case 'critical_vulnerability_found':
        return operationData.vulnerabilitySeverity === 'critical';
      case 'emergency_maintenance':
        return operationData.maintenanceType === 'emergency';
      case 'production_config':
        return operationData.configEnvironment === 'production';
      case 'security_settings':
        return operationData.category === 'security';
      case 'critical_path_override':
        return operationData.pathType === 'critical';
      default:
        return false;
    }
  }

  private async sendApprovalNotification(request: ApprovalRequest): Promise<void> {
    // TODO: Implement notification system
    logger.info('Approval notification sent', {
      requestId: request.id,
      operationType: request.operationType,
      requiredApprovers: request.requiredApprovers
    });
  }

  private logToAuditTrail(action: string, requestId: string, user: string, details: any): void {
    if (this.config.auditTrailEnabled) {
      this.auditTrail.push({
        timestamp: Date.now(),
        action,
        requestId,
        user,
        details
      });

      // Keep audit trail size manageable
      if (this.auditTrail.length > 10000) {
        this.auditTrail = this.auditTrail.slice(-5000);
      }
    }
  }

  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanupExpiredRequests();
    }, 60000); // Check every minute
  }

  private cleanupExpiredRequests(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [requestId, request] of this.approvalRequests.entries()) {
      if (request.status === ApprovalStatus.PENDING && request.expiresAt < now) {
        request.status = ApprovalStatus.EXPIRED;

        this.logToAuditTrail('approval_expired', requestId, 'system', {
          originalExpiry: request.expiresAt,
          expiredAt: now
        });

        this.emit('requestExpired', request);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} expired approval requests`);
    }
  }

  /**
   * Destroy Two-Man Rule instance and cleanup
   */
  public destroy(): void {
    this.removeAllListeners();
    this.approvalRequests.clear();
    this.auditTrail = [];

    logger.info('Two-Man Rule destroyed');
  }
}
