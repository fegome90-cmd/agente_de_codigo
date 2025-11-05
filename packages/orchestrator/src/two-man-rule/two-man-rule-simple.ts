/**
 * Simplified Two-Man Rule Implementation
 *
 * Basic implementation to fix compilation issues
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
import { logger } from '../utils/logger.js';

// Type definitions
enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  EMERGENCY_OVERRIDE = 'emergency_override'
}

enum OperationSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

interface ApprovalRequest {
  id: string;
  operationType: string;
  operationData: any;
  requester: string;
  severity: OperationSeverity;
  status: ApprovalStatus;
  createdAt: number;
  expiresAt: number;
  requiredApprovers: number;
  currentApprovals: Array<{
    approver: string;
    approverRole: string;
    timestamp: number;
    reason?: string;
    confidence: number;
  }>;
  rejections: Array<{
    approver: string;
    approverRole: string;
    timestamp: number;
    reason: string;
    confidence: number;
  }>;
  conditions: string[];
  metadata?: any;
}

interface TwoManRuleConfig {
  criticalOperations: Array<{
    operationType: string;
    requiresApproval: boolean;
    approvers?: string[];
    timeout?: number;
    conditions?: string[];
  }>;
  approvalTimeout: number;
  maxApprovalAttempts: number;
  approverRoleRequirements: Array<{
    operation: string;
    requiredRoles: string[];
    minApprovers: number;
  }>;
  allowSelfApproval: boolean;
  requireReason: boolean;
  auditTrailEnabled: boolean;
  emergencyOverride: boolean;
  emergencyOverrideRoles: string[];
  notificationEnabled: boolean;
  notificationChannels: string[];
}

/**
 * Simplified Two-Man Rule implementation
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

    this.config = {
      criticalOperations: [
        {
          operationType: 'agent_deployment',
          requiresApproval: true,
          approvers: ['admin', 'ops_manager'],
          timeout: 600000, // 10 minutes
          conditions: ['production_deployment']
        },
        {
          operationType: 'workflow_override',
          requiresApproval: true,
          approvers: ['workflow_manager', 'admin'],
          timeout: 300000, // 5 minutes
          conditions: ['critical_path_override']
        }
      ],
      approvalTimeout: 300000,
      maxApprovalAttempts: 3,
      approverRoleRequirements: [],
      allowSelfApproval: false,
      requireReason: true,
      auditTrailEnabled: true,
      emergencyOverride: false,
      emergencyOverrideRoles: [],
      notificationEnabled: true,
      notificationChannels: ['email', 'slack'],
      ...config
    };

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
      metadata
    };

    this.approvalRequests.set(requestId, request);

    // Log to audit trail
    this.logToAuditTrail('approval_request_created', requestId, requester, {
      operationType,
      severity,
      requiredApprovers: request.requiredApprovers
    });

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
    const approval = {
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
    const rejection = {
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
    const highSeverityOperations = ['workflow_override'];
    const mediumSeverityOperations = ['agent_deployment'];

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
      case 'critical_path_override':
        return operationData.pathType === 'critical';
      default:
        return false;
    }
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

// Export enums
export { ApprovalStatus, OperationSeverity };
