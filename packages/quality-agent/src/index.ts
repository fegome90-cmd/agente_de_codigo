/**
 * Quality Agent - Main entry point
 * Export the QualityAgent class and related utilities
 */

export { QualityAgent } from './quality-agent.js';
export { ESLintAnalyzer } from './eslint-analyzer.js';
export { RuffAnalyzer } from './ruff-analyzer.js';
export { SARIFGenerator } from './sarif-generator.js';
export { logger } from './utils/logger.js';

// Pipeline components
export { SARIFIngestionLayer } from './pipeline/ingestion-layer.js';
export { SARIFSemanticAnalysisLayer } from './pipeline/semantic-analysis-layer.js';
export { SARIFFingerprintingLayer } from './pipeline/fingerprinting-layer.js';
export {
  NormalizedFinding,
  NormalizedRule,
  NormalizedArtifact,
  NormalizedRun,
  IngestionResult,
} from './pipeline/ingestion-layer.js';
export {
  SemanticRule,
  SemanticFinding,
  SemanticAnalysisResult,
} from './pipeline/semantic-analysis-layer.js';
export {
  FindingFingerprint,
  DuplicateGroup,
  FingerprintingResult,
} from './pipeline/fingerprinting-layer.js';

export type {
  QualityTaskData,
  QualityAnalysisResult,
  QualityFinding,
  QualitySummary,
  QualityMetrics,
  QualityAgentConfig,
  ESLintResult,
  RuffResult,
} from './types.js';

// Zod schemas for validation
export {
  QualityTaskDataSchema,
  QualityFindingSchema,
  QualityAgentConfigSchema,
} from './types.js';