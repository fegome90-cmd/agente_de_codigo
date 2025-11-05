/**
 * LLM-Powered Refactor Suggestions Engine
 * Generates actionable architectural refactor recommendations using AI
 */

import { logger } from './utils/logger.js';
import type {
  Finding,
  LayeringViolation,
  ImportBoundaryViolation,
  DRYViolation,
  RefactorRecommendation
} from './types.js';

/**
 * Refactor suggestion context
 */
export interface RefactorContext {
  violations: Finding[];
  projectInfo: {
    name: string;
    language: string[];
    framework?: string[];
    architecture: 'mvc' | 'layered' | 'microservices' | 'monolith' | 'unknown';
    size: 'small' | 'medium' | 'large' | 'enterprise';
  };
  codeContext: {
    filePath: string;
    sourceCode?: string;
    imports: string[];
    exports: string[];
    dependencies: string[];
  };
  preferences: {
    maxSuggestions: number;
    includeCodeExamples: boolean;
    effortEstimation: boolean;
    riskAssessment: boolean;
  };
}

/**
 * LLM integration interface
 */
interface LLMProvider {
  name: string;
  model: string;
  generateSuggestions(context: RefactorContext): Promise<RefactorRecommendation[]>;
  isAvailable(): boolean;
}

/**
 * Refactor suggestion templates
 */
interface RefactorTemplate {
  id: string;
  name: string;
  description: string;
  applicableViolations: string[];
  template: string;
  variables: string[];
  effortEstimate: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Refactor Suggester Class
 */
export class RefactorSuggester {
  private llmProviders: Map<string, LLMProvider> = new Map();
  private templates: Map<string, RefactorTemplate> = new Map();
  private cache: Map<string, RefactorRecommendation[]> = new Map();

  constructor() {
    this.initializeTemplates();
    this.initializeLLMProviders();
  }

  /**
   * Generate refactor suggestions for architectural violations
   */
  async generateSuggestions(context: RefactorContext): Promise<RefactorRecommendation[]> {
    logger.info(`🤖 Generating refactor suggestions for ${context.violations.length} violations`);

    const cacheKey = this.generateCacheKey(context);
    if (this.cache.has(cacheKey)) {
      logger.debug('Using cached refactor suggestions');
      return this.cache.get(cacheKey)!;
    }

    const recommendations: RefactorRecommendation[] = [];

    // Group violations by type for better analysis
    const groupedViolations = this.groupViolationsByType(context.violations);

    for (const [violationType, violations] of groupedViolations) {
      const typeRecommendations = await this.generateSuggestionsForType(
        violationType,
        violations,
        context
      );
      recommendations.push(...typeRecommendations);
    }

    // Apply template-based suggestions
    const templateRecommendations = this.applyTemplateSuggestions(context);
    recommendations.push(...templateRecommendations);

    // Sort by priority and limit results
    const sortedRecommendations = recommendations
      .sort((a, b) => this.calculatePriority(a, context) - this.calculatePriority(b, context))
      .slice(0, context.preferences.maxSuggestions);

    // Cache results
    this.cache.set(cacheKey, sortedRecommendations);

    logger.info(`✅ Generated ${sortedRecommendations.length} refactor suggestions`);
    return sortedRecommendations;
  }

  /**
   * Generate suggestions for specific violation types
   */
  private async generateSuggestionsForType(
    violationType: string,
    violations: Finding[],
    context: RefactorContext
  ): Promise<RefactorRecommendation[]> {
    const recommendations: RefactorRecommendation[] = [];

    switch (violationType) {
      case 'LAYERING_VIOLATION':
        recommendations.push(...await this.generateLayeringRefactors(violations as LayeringViolation[], context));
        break;

      case 'IMPORT_BOUNDARY_VIOLATION':
        recommendations.push(...await this.generateImportBoundaryRefactors(violations as ImportBoundaryViolation[], context));
        break;

      case 'DRY_VIOLATION':
        recommendations.push(...await this.generateDRYRefactors(violations as DRYViolation[], context));
        break;

      default:
        recommendations.push(...this.generateGenericRefactors(violations, context));
    }

    return recommendations;
  }

  /**
   * Generate layering violation refactor suggestions
   */
  private async generateLayeringRefactors(
    violations: LayeringViolation[],
    context: RefactorContext
  ): Promise<RefactorRecommendation[]> {
    const recommendations: RefactorRecommendation[] = [];

    for (const violation of violations) {
      // Dependency Injection pattern
      if (violation.fromLayer === 'infrastructure' && violation.toLayer === 'presentation') {
        recommendations.push({
          id: `dependency-injection-${Date.now()}`,
          type: 'introduce_interface',
          title: 'Implement Dependency Inversion Principle',
          description: `Extract infrastructure dependencies from ${violation.fromLayer} layer and use dependency injection to decouple from ${violation.toLayer} layer.`,
          rationale: 'Infrastructure should not depend on presentation. Use interfaces to invert the dependency direction.',
          files: [violation.filePath],
          estimatedEffort: 'high',
          impact: 'high',
          steps: [
            'Create an interface in the business layer',
            'Implement the interface in the infrastructure layer',
            'Inject the dependency through constructor or method parameters',
            'Update the presentation layer to use the interface',
            'Remove direct import from infrastructure to presentation'
          ],
          beforeCode: `// Current: Infrastructure importing from Presentation
import { UserComponent } from '../components/UserComponent.js';
export class DatabaseService {
  constructor() {
    this.component = new UserComponent();
  }
}`,
          afterCode: `// Refactored: Using dependency injection
export interface IUserComponent {
  render(): string;
}

export class DatabaseService {
  constructor(private userComponent: IUserComponent) {
    // Component injected from outside
  }
}`
        });
      }

      // Extract Service pattern
      if (violation.fromLayer === 'presentation' && violation.toLayer === 'infrastructure') {
        recommendations.push({
          id: `extract-service-${Date.now()}`,
          type: 'extract_method',
          title: 'Extract Service Layer',
          description: `Move direct infrastructure access from presentation layer to a dedicated service in the business layer.`,
          rationale: 'Presentation components should not directly access infrastructure. Create a service to mediate access.',
          files: [violation.filePath],
          estimatedEffort: 'medium',
          impact: 'medium',
          steps: [
            'Create a service class in the business layer',
            'Move infrastructure logic to the service',
            'Inject the service into the presentation component',
            'Update component to use service methods',
            'Remove direct infrastructure imports'
          ],
          beforeCode: `// Current: Direct infrastructure access
import { DatabaseService } from '../infrastructure/DatabaseService.js';
export class UserComponent {
  constructor() {
    this.db = new DatabaseService();
  }
}`,
          afterCode: `// Refactored: Service layer mediation
import { UserService } from '../services/UserService.js';
export class UserComponent {
  constructor(private userService: UserService) {
    // Service handles infrastructure access
  }
}`
        });
      }

      // Move to appropriate layer
      recommendations.push({
        id: `move-class-${Date.now()}`,
        type: 'move_class',
        title: `Move Class to ${violation.toLayer} Layer`,
        description: `Relocate the class or module from ${violation.fromLayer} to ${violation.toLayer} to resolve layering violation.`,
        rationale: `The current location violates architectural boundaries. Moving to the target layer aligns with proper separation of concerns.`,
        files: [violation.filePath],
        estimatedEffort: violation.refactorEffort || 'medium',
        impact: violation.architecturalImpact || 'medium',
        steps: [
          `Identify the class/module causing the violation`,
          `Create corresponding directory structure in ${violation.toLayer} layer`,
          `Move the class to the new location`,
          `Update all import statements referencing this class`,
          `Update any configuration files or dependency injection setup`,
          `Run tests to ensure functionality is preserved`
        ]
      });
    }

    return recommendations;
  }

  /**
   * Generate import boundary violation refactor suggestions
   */
  private async generateImportBoundaryRefactors(
    violations: ImportBoundaryViolation[],
    context: RefactorContext
  ): Promise<RefactorRecommendation[]> {
    const recommendations: RefactorRecommendation[] = [];

    for (const violation of violations) {
      if (violation.violationType === 'external_dependency') {
        recommendations.push({
          id: `replace-dependency-${Date.now()}`,
          type: 'remove_duplicate',
          title: `Replace Forbidden Dependency: ${violation.importModule}`,
          description: `Replace the forbidden external dependency '${violation.importModule}' with an approved alternative.`,
          rationale: `The dependency '${violation.importModule}' violates project guidelines. Use approved libraries or implement native functionality.`,
          files: [violation.filePath],
          estimatedEffort: 'medium',
          impact: 'medium',
          steps: [
            'Research approved alternatives for the forbidden dependency',
            'Identify all usage of the forbidden dependency in the codebase',
            'Implement replacement functionality using approved libraries',
            'Update import statements throughout the project',
            'Update package.json to remove forbidden dependency',
            'Run comprehensive tests to ensure behavior is preserved'
          ]
        });
      }
    }

    return recommendations;
  }

  /**
   * Generate DRY violation refactor suggestions
   */
  private async generateDRYRefactors(
    violations: DRYViolation[],
    context: RefactorContext
  ): Promise<RefactorRecommendation[]> {
    const recommendations: RefactorRecommendation[] = [];

    for (const violation of violations) {
      recommendations.push({
        id: `extract-common-${Date.now()}`,
        type: 'extract_method',
        title: 'Extract Common Code to Shared Method',
        description: `Extract duplicated code found in multiple locations into a shared utility method or class.`,
        rationale: `The code similarity of ${violation.similarity}% indicates significant duplication that should be refactored.`,
        files: [violation.blocks[0].file, violation.blocks[1].file],
        estimatedEffort: violation.refactorEffort || 'medium',
        impact: 'medium',
        steps: [
          'Create a shared utility or helper class',
          'Extract common logic into a reusable method',
          'Replace duplicated code with calls to the shared method',
          'Ensure parameterization for any variations',
          'Add proper error handling and validation',
          'Update tests to cover the shared functionality'
        ]
      });
    }

    return recommendations;
  }

  /**
   * Generate generic refactor suggestions
   */
  private generateGenericRefactors(
    violations: Finding[],
    context: RefactorContext
  ): RefactorRecommendation[] {
    const recommendations: RefactorRecommendation[] = [];

    // Group by file for batch refactoring
    const violationsByFile = this.groupViolationsByFile(violations);

    for (const [filePath, fileViolations] of violationsByFile) {
      if (fileViolations.length > 2) {
        recommendations.push({
          id: `comprehensive-refactor-${Date.now()}`,
          type: 'extract_class',
          title: `Comprehensive Refactor for ${filePath}`,
          description: `This file has ${fileViolations.length} architectural violations and requires comprehensive refactoring.`,
          rationale: 'Multiple violations in the same file indicate fundamental architectural issues that need coordinated refactoring.',
          files: [filePath],
          estimatedEffort: 'high',
          impact: 'high',
          steps: [
            'Analyze all violations and their interdependencies',
            'Create a refactoring plan addressing violations in dependency order',
            'Establish proper layer boundaries and dependencies',
            'Extract cohesive functionality into appropriate classes/modules',
            'Implement proper separation of concerns',
            'Add comprehensive tests before and after refactoring',
            'Gradually migrate usage to refactored implementation'
          ]
        });
      }
    }

    return recommendations;
  }

  /**
   * Apply template-based suggestions
   */
  private applyTemplateSuggestions(context: RefactorContext): RefactorRecommendation[] {
    const recommendations: RefactorRecommendation[] = [];

    for (const violation of context.violations) {
      for (const [templateId, template] of this.templates) {
        if (template.applicableViolations.includes(violation.ruleId)) {
          const recommendation = this.instantiateTemplate(template, violation, context);
          if (recommendation) {
            recommendations.push(recommendation);
          }
        }
      }
    }

    return recommendations;
  }

  /**
   * Instantiate a refactor template for a specific violation
   */
  private instantiateTemplate(
    template: RefactorTemplate,
    violation: Finding,
    context: RefactorContext
  ): RefactorRecommendation | null {
    // This would use template variables to generate specific recommendations
    // For now, return a basic implementation
    return {
      id: `template-${template.id}-${Date.now()}`,
      type: 'extract_method' as any,
      title: template.name,
      description: template.description,
      rationale: `Applied template-based solution for ${violation.ruleId}`,
      files: [violation.filePath],
      estimatedEffort: template.effortEstimate,
      impact: 'medium',
      steps: [
        `Apply ${template.name} pattern`,
        'Follow established refactoring guidelines',
        'Ensure tests are updated appropriately'
      ]
    };
  }

  /**
   * Initialize refactor templates
   */
  private initializeTemplates(): void {
    const templates: RefactorTemplate[] = [
      {
        id: 'dependency-injection',
        name: 'Dependency Injection Pattern',
        description: 'Apply dependency injection to resolve coupling issues',
        applicableViolations: ['LAYERING_VIOLATION'],
        template: 'DI_PATTERN',
        variables: ['interface', 'implementation', 'client'],
        effortEstimate: 'medium',
        riskLevel: 'medium'
      },
      {
        id: 'service-layer',
        name: 'Service Layer Pattern',
        description: 'Introduce service layer to mediate between layers',
        applicableViolations: ['LAYERING_VIOLATION', 'IMPORT_BOUNDARY_VIOLATION'],
        template: 'SERVICE_PATTERN',
        variables: ['service', 'dependencies', 'clients'],
        effortEstimate: 'medium',
        riskLevel: 'low'
      }
    ];

    for (const template of templates) {
      this.templates.set(template.id, template);
    }

    logger.debug(`Initialized ${templates.length} refactor templates`);
  }

  /**
   * Initialize LLM providers
   */
  private initializeLLMProviders(): void {
    // This would integrate with the LLM routing system
    // For now, provide a placeholder implementation
    const mockProvider: LLMProvider = {
      name: 'MockLLM',
      model: 'mock-model',
      generateSuggestions: async (context) => {
        // Mock implementation - would integrate with actual LLM
        return [];
      },
      isAvailable: () => false
    };

    this.llmProviders.set('mock', mockProvider);
    logger.debug('Initialized LLM providers');
  }

  /**
   * Group violations by type
   */
  private groupViolationsByType(violations: Finding[]): Map<string, Finding[]> {
    const grouped = new Map<string, Finding[]>();

    for (const violation of violations) {
      const type = violation.ruleId;
      if (!grouped.has(type)) {
        grouped.set(type, []);
      }
      grouped.get(type)!.push(violation);
    }

    return grouped;
  }

  /**
   * Group violations by file
   */
  private groupViolationsByFile(violations: Finding[]): Map<string, Finding[]> {
    const grouped = new Map<string, Finding[]>();

    for (const violation of violations) {
      if (!grouped.has(violation.filePath)) {
        grouped.set(violation.filePath, []);
      }
      grouped.get(violation.filePath)!.push(violation);
    }

    return grouped;
  }

  /**
   * Calculate recommendation priority
   */
  private calculatePriority(recommendation: RefactorRecommendation, context: RefactorContext): number {
    let priority = 0;

    // Higher priority for high impact
    if (recommendation.impact === 'high') priority += 10;
    else if (recommendation.impact === 'medium') priority += 5;

    // Lower priority for high effort (quick wins first)
    if (recommendation.estimatedEffort === 'low') priority += 5;
    else if (recommendation.estimatedEffort === 'high') priority -= 3;

    // Consider severity of violations being addressed
    const maxSeverity = Math.max(...context.violations.map(v => {
      switch (v.severity) {
        case 'critical': return 4;
        case 'high': return 3;
        case 'medium': return 2;
        case 'low': return 1;
        default: return 0;
      }
    }));
    priority += maxSeverity;

    return priority;
  }

  /**
   * Generate cache key for context
   */
  private generateCacheKey(context: RefactorContext): string {
    const violationsHash = context.violations
      .map(v => `${v.ruleId}:${v.filePath}:${v.line}`)
      .sort()
      .join('|');

    return `${context.projectInfo.name}-${violationsHash}`;
  }

  /**
   * Clear suggestion cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('Refactor suggestion cache cleared');
  }

  /**
   * Get available refactor templates
   */
  getAvailableTemplates(): RefactorTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get statistics about generated suggestions
   */
  getSuggestionStats(recommendations: RefactorRecommendation[]): {
    total: number;
    byType: Record<string, number>;
    byEffort: Record<string, number>;
    byImpact: Record<string, number>;
  } {
    const stats = {
      total: recommendations.length,
      byType: {} as Record<string, number>,
      byEffort: {} as Record<string, number>,
      byImpact: {} as Record<string, number>
    };

    for (const rec of recommendations) {
      stats.byType[rec.type] = (stats.byType[rec.type] || 0) + 1;
      stats.byEffort[rec.estimatedEffort] = (stats.byEffort[rec.estimatedEffort] || 0) + 1;
      stats.byImpact[rec.impact] = (stats.byImpact[rec.impact] || 0) + 1;
    }

    return stats;
  }
}