/**
 * Architecture Agent Type Definitions
 * Defines interfaces for architectural analysis, layering violations, and DRY detection
 */

// ============================================================================
// Core Shared Types (temporarily defined here)
// ============================================================================

export interface TaskData {
  scope: string[];
  context: {
    repoRoot: string;
    commitHash?: string;
    branch?: string;
  };
  output: string;
}

export interface Finding {
  ruleId: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  filePath: string;
  line: number;
  column: number;
  category?: string;
  architecturalImpact?: 'high' | 'medium' | 'low';
  refactorEffort?: 'low' | 'medium' | 'high';
}

export interface AgentCapabilities {
  name: string;
  version: string;
  description?: string;
  supportsHeartbeat: boolean;
  supportsTasks: boolean;
  supportsEvents: boolean;
  languages: string[];
  features: string[];
  tools: string[];
}

export interface IPCMessage {
  type: 'heartbeat' | 'task' | 'task_response' | 'ping' | 'auth' | 'auth_response';
  agentId?: string;
  taskId?: string;
  timestamp: number;
  data?: any;
}

// ============================================================================
// Core Architecture Types
// ============================================================================

export interface ArchitectureTaskData extends TaskData {
  scope: string[];
  context: {
    repoRoot: string;
    commitHash?: string;
    branch?: string;
    layersConfig?: string; // Path to layer configuration file
  };
  output: string;
}

// ============================================================================
// AST and Symbol Types
// ============================================================================

export interface ASTNode {
  id: string;
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: ASTNode[];
  parent?: ASTNode;
  language: 'python' | 'typescript' | 'javascript';
}

export interface Symbol {
  name: string;
  type: 'class' | 'function' | 'method' | 'variable' | 'import' | 'export';
  file: string;
  line: number;
  column: number;
  visibility: 'public' | 'private' | 'protected' | 'internal';
  complexity?: number;
  dependencies: string[];
}

export interface ImportStatement {
  module: string;
  source: string;
  type: 'default' | 'named' | 'namespace' | 'side-effect';
  symbols: string[];
  isDynamic: boolean;
  line: number;
  column: number;
}

// ============================================================================
// Layering Types
// ============================================================================

export interface LayerConfig {
  name: string;
  paths: string[];
  allowedImports: string[];
  forbiddenImports: string[];
  allowedToImportFrom: string[];
  description?: string;
}

export interface LayeringRule {
  fromLayer: string;
  toLayer: string;
  type: 'allowed' | 'forbidden';
  description?: string;
}

export interface LayeringViolation extends Finding {
  ruleId: 'LAYERING_VIOLATION';
  fromLayer: string;
  toLayer: string;
  importModule: string;
  importType: string;
  ruleType: 'forbidden_import' | 'missing_allowed_import';
}

export interface ImportBoundaryViolation extends Finding {
  ruleId: 'IMPORT_BOUNDARY_VIOLATION';
  violationType: 'forbidden_module' | 'circular_dependency' | 'external_dependency' | 'missing_dependency' | 'version_conflict';
  importModule: string;
  resolvedPath?: string | null;
  allowedModules: string[];
  boundaryType: 'layer' | 'module' | 'package' | 'external';
  context: {
    sourceLayer?: string;
    targetLayer?: string;
    dependencyChain?: string[];
  };
}

// ============================================================================
// DRY Violation Types
// ============================================================================

export interface CodeBlock {
  id: string;
  content: string;
  hash: string;
  file: string;
  startLine: number;
  endLine: number;
  type: 'function' | 'method' | 'class' | 'block';
  complexity: number;
  symbols: string[];
}

export interface SimilarityMatch {
  block1: CodeBlock;
  block2: CodeBlock;
  similarity: number;
  matchingLines: number[];
  differences: string[];
  type: 'exact' | 'structural' | 'semantic';
}

export interface DRYViolation extends Finding {
  ruleId: 'DRY_VIOLATION';
  similarity: number;
  blocks: [CodeBlock, CodeBlock];
  violationType: 'exact_duplicate' | 'structural_duplicate' | 'semantic_duplicate';
  refactorSuggestion: string;
}

// ============================================================================
// Testing Coverage Types
// ============================================================================

export interface CoverageData {
  file: string;
  linesCovered: number;
  linesTotal: number;
  functionsCovered: number;
  functionsTotal: number;
  branchesCovered: number;
  branchesTotal: number;
  coverage: number; // Percentage
}

export interface UncoveredFunction {
  name: string;
  file: string;
  line: number;
  complexity: number;
  parameters: number;
  type: 'function' | 'method';
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

export interface CoverageGap extends Finding {
  ruleId: 'COVERAGE_GAP';
  uncoveredFunction: UncoveredFunction;
  suggestedTest: string;
  estimatedEffort: 'low' | 'medium' | 'high';
}

export interface TestCoverageGap extends Finding {
  ruleId: 'TEST_COVERAGE_GAP';
  type: 'untested_function' | 'untested_class' | 'missing_edge_cases' | 'insufficient_assertions';
  severity: 'low' | 'medium' | 'high' | 'critical';
  functionName?: string;
  className?: string;
  suggestedTests: string[];
  estimatedEffort: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface TestQualityMetrics {
  totalAssertions: number;
  averageAssertionsPerTest: number;
  edgeCaseCoverage: 'poor' | 'fair' | 'good' | 'excellent';
  mockCoverage: 'poor' | 'fair' | 'good' | 'excellent';
  mutationScore: 'unknown' | 'poor' | 'fair' | 'good' | 'excellent' | 'not_tracked';
}

export interface SeverityClassification {
  finding: Finding;
  severity: 'critical' | 'high' | 'medium' | 'low';
  priority: number;
  urgency: 'immediate' | 'high' | 'medium' | 'low';
  businessImpact: 'revenue-impacting' | 'customer-impacting' | 'operational' | 'technical-debt' | 'minor';
  riskLevel: 'extreme' | 'high' | 'moderate' | 'low';
  effortEstimate: {
    hours: number;
    teamSize: number;
    complexity: 'low' | 'medium' | 'high';
  };
  reasoning: string[];
  recommendations: string[];
}


// ============================================================================
// Analysis Results
// ============================================================================

export interface ArchitectureAnalysis {
  filesAnalyzed: number;
  languages: string[];
  symbolsFound: number;
  importsFound: number;
  layeringViolations: LayeringViolation[];
  dryViolations: DRYViolation[];
  coverageGaps: CoverageGap[];
  metrics: {
    complexity: { average: number; max: number; hotspots: string[] };
    coupling: { average: number; max: number; tightlyCoupled: string[] };
    cohesion: { average: number; low: string[] };
  };
}

export interface ArchitectureFinding extends Finding {
  category: 'layering' | 'dry' | 'coverage' | 'complexity' | 'coupling';
  severity: 'critical' | 'high' | 'medium' | 'low';
  architecturalImpact: 'high' | 'medium' | 'low';
  refactorEffort: 'low' | 'medium' | 'high';
}

// ============================================================================
// Report Types
// ============================================================================

export interface ArchitectureReport {
  version: string;
  runId: string;
  timestamp: string;
  agent: 'architecture';
  analysis: ArchitectureAnalysis;
  summary: {
    totalFindings: number;
    severityBreakdown: Record<string, number>;
    categoryBreakdown: Record<string, number>;
    architecturalImpact: Record<string, number>;
  };
  findings: ArchitectureFinding[];
  recommendations: RefactorRecommendation[];
  metrics: {
    analysisDuration: number;
    filesProcessed: number;
    linesOfCode: number;
    complexityMetrics: Record<string, number>;
  };
}

// ============================================================================
// Refactor Recommendations
// ============================================================================

export interface RefactorRecommendation {
  id: string;
  type: 'extract_class' | 'extract_method' | 'move_class' | 'introduce_interface' | 'remove_duplicate';
  title: string;
  description: string;
  rationale: string;
  files: string[];
  estimatedEffort: 'low' | 'medium' | 'high';
  impact: 'high' | 'medium' | 'low';
  steps: string[];
  beforeCode?: string;
  afterCode?: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ArchitectureConfig {
  timeoutSeconds: number;
  maxFileSize: number;
  languages: string[];
  layeringDetection: {
    enabled: boolean;
    configFile?: string;
    customRules: LayeringRule[];
  };
  dryDetection: {
    enabled: boolean;
    similarityThreshold: number;
    minLinesToConsider: number;
    ignorePatterns: string[];
  };
  coverageAnalysis: {
    enabled: boolean;
    coverageFiles: string[];
    minCoverageThreshold: number;
    prioritizeByComplexity: boolean;
  };
  complexityAnalysis: {
    enabled: boolean;
    threshold: number;
    includeCognitiveComplexity: boolean;
  };
  llmIntegration: {
    enabled: boolean;
    maxSuggestions: number;
    temperature: number;
  };
}

// ============================================================================
// Agent Capabilities
// ============================================================================

export interface ArchitectureAgentCapabilities extends AgentCapabilities {
  languages: ('python' | 'typescript' | 'javascript' | 'java' | 'go')[];
  features: [
    'layering-violation-detection',
    'dry-violation-analysis',
    'testing-coverage-analysis',
    'complexity-analysis',
    'dependency-graph-analysis',
    'refactor-recommendations',
    'ast-parsing',
    'symbol-extraction'
  ];
  tools: [
    'tree-sitter',
    'ast-analysis',
    'similarity-detection',
    'coverage-parser',
    'layer-rules-engine'
  ];
}