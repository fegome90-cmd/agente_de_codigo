/**
 * SARIF Fingerprinting Layer - Capa 3: Fingerprinting
 *
 * Provides deduplication and fingerprinting capabilities for SARIF findings.
 * Eliminates duplicates and identifies similar issues using multiple techniques.
 *
 * @author Agente de Código - FASE 2
 * @since 2025-11-03
 */

import type {
  NormalizedFinding,
  IngestionResult,
} from './ingestion-layer.js';
import type {
  SemanticFinding,
  SemanticAnalysisResult,
} from './semantic-analysis-layer.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Fingerprint Types
// ============================================================================

export interface FindingFingerprint {
  hash: string;
  type: 'exact' | 'similar' | 'location' | 'semantic';
  similarity?: number;
  canonicalForm: string;
  signature: string;
  metadata: {
    filePath: string;
    line?: number;
    ruleId: string;
    severity: string;
  };
}

export interface DuplicateGroup {
  fingerprint: string;
  type: 'exact' | 'similar' | 'location' | 'semantic';
  count: number;
  representative: NormalizedFinding;
  duplicates: NormalizedFinding[];
  similarityScore?: number;
  firstSeen: string;
  lastSeen: string;
}

export interface FingerprintingResult {
  timestamp: string;
  totalFindings: number;
  uniqueFindings: number;
  duplicatesRemoved: number;
  deduplicationRate: number;
  duplicateGroups: DuplicateGroup[];
  fingerprintTypes: {
    exact: number;
    similar: number;
    location: number;
    semantic: number;
  };
  optimizationMetrics: {
    sizeReduction: number;
    processingTime: number;
    memorySaved: number;
  };
  recommendations: Array<{
    type: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
  }>;
  patterns: Array<{
    name: string;
    frequency: number;
    locations: string[];
    suggestion: string;
  }>;
}

// ============================================================================
// Similarity Algorithms
// ============================================================================

class StringSimilarity {
  /**
   * Calculate Levenshtein distance
   */
  static levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    // TypeScript strictness workaround - use any type for matrix
    const matrix: any = [];
    for (let j = 0; j <= b.length; j++) {
      matrix[j] = [];
      for (let i = 0; i <= a.length; i++) {
        matrix[j][i] = 0;
      }
    }

    for (let i = 0; i <= a.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= b.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Calculate similarity ratio (0-1)
   */
  static similarity(a: string, b: string): number {
    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) return 1;
    return 1 - this.levenshtein(a.toLowerCase(), b.toLowerCase()) / maxLength;
  }

  /**
   * Calculate Jaccard similarity for sets
   */
  static jaccard(a: string[], b: string[]): number {
    const setA = new Set(a.map(s => s.toLowerCase()));
    const setB = new Set(b.map(s => s.toLowerCase()));

    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }
}

// ============================================================================
// Fingerprinting Layer Implementation
// ============================================================================

export class SARIFFingerprintingLayer {
  private similarityThreshold = 0.85; // 85% similarity threshold
  private minOccurrences = 2; // Minimum occurrences to form a pattern
  private processingTime: number = 0;

  constructor(options?: {
    similarityThreshold?: number;
    minOccurrences?: number;
  }) {
    if (options?.similarityThreshold !== undefined) {
      this.similarityThreshold = options.similarityThreshold;
    }
    if (options?.minOccurrences !== undefined) {
      this.minOccurrences = options.minOccurrences;
    }

    logger.info('SARIF Fingerprinting Layer initialized', {
      similarityThreshold: this.similarityThreshold,
      minOccurrences: this.minOccurrences,
    });
  }

  /**
   * Fingerprint and deduplicate findings
   */
  async fingerprint(
    ingestionResult: IngestionResult,
    semanticResult?: SemanticAnalysisResult
  ): Promise<FingerprintingResult> {
    const startTime = Date.now();

    try {
      // Collect all findings from all runs
      const allFindings = this.collectAllFindings(ingestionResult, semanticResult);

      logger.info('Starting fingerprinting process', {
        totalFindings: allFindings.length,
      });

      // Generate fingerprints for all findings
      const fingerprints = this.generateFingerprints(allFindings);

      // Detect duplicates
      const duplicateGroups = this.detectDuplicates(allFindings, fingerprints);

      // Calculate metrics
      const uniqueFindings = allFindings.length - duplicateGroups.reduce(
        (sum, group) => sum + (group.count - 1),
        0
      );

      const deduplicationRate = ((allFindings.length - uniqueFindings) / allFindings.length) * 100;

      // Detect patterns
      const patterns = this.detectPatterns(duplicateGroups);

      // Generate recommendations
      const recommendations = this.generateRecommendations(duplicateGroups);

      // Calculate optimization metrics
      this.processingTime = Date.now() - startTime;
      const sizeReduction = this.calculateSizeReduction(allFindings.length, uniqueFindings);
      const memorySaved = this.calculateMemorySaved(allFindings.length, uniqueFindings);

      const fingerprintTypes = {
        exact: duplicateGroups.filter(g => g.type === 'exact').length,
        similar: duplicateGroups.filter(g => g.type === 'similar').length,
        location: duplicateGroups.filter(g => g.type === 'location').length,
        semantic: duplicateGroups.filter(g => g.type === 'semantic').length,
      };

      const result: FingerprintingResult = {
        timestamp: new Date().toISOString(),
        totalFindings: allFindings.length,
        uniqueFindings,
        duplicatesRemoved: allFindings.length - uniqueFindings,
        deduplicationRate: Math.round(deduplicationRate * 100) / 100,
        duplicateGroups,
        fingerprintTypes,
        optimizationMetrics: {
          sizeReduction: Math.round(sizeReduction * 100) / 100,
          processingTime: this.processingTime,
          memorySaved,
        },
        recommendations,
        patterns,
      };

      logger.info('Fingerprinting completed', {
        totalFindings: allFindings.length,
        uniqueFindings,
        duplicatesRemoved: result.duplicatesRemoved,
        deduplicationRate: result.deduplicationRate,
        processingTime: this.processingTime,
      });

      return result;

    } catch (error) {
      logger.error('Fingerprinting failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Collect all findings from ingestion and semantic results
   */
  private collectAllFindings(
    ingestionResult: IngestionResult,
    semanticResult?: SemanticAnalysisResult
  ): NormalizedFinding[] {
    const findings: NormalizedFinding[] = [];

    // Collect from ingestion result
    for (const run of ingestionResult.runs) {
      findings.push(...run.results);
    }

    // Optionally collect semantic findings and convert to normalized findings
    if (semanticResult) {
      for (const semanticFinding of semanticResult.semanticFindings) {
        // Convert semantic finding to normalized finding
        const normalizedFinding: NormalizedFinding = {
          id: semanticFinding.ruleId,
          ruleId: semanticFinding.ruleId,
          severity: semanticFinding.severity as any,
          level: semanticFinding.severity as any,
          message: semanticFinding.message,
          filePath: semanticFinding.affectedItems[0] || 'unknown',
          sourceAgent: 'semantic-analyzer',
          toolName: 'semantic-analyzer',
          fixable: false,
          fixAvailable: false,
          properties: {
            category: semanticFinding.category,
            impact: semanticFinding.impact,
            effort: semanticFinding.effort,
          },
        };
        findings.push(normalizedFinding);
      }
    }

    return findings;
  }

  /**
   * Generate fingerprints for all findings
   */
  private generateFingerprints(findings: NormalizedFinding[]): Map<string, FindingFingerprint> {
    const fingerprints = new Map<string, FindingFingerprint>();

    for (const finding of findings) {
      const fingerprint = this.generateSingleFingerprint(finding);
      fingerprints.set(finding.id, fingerprint);
    }

    return fingerprints;
  }

  /**
   * Generate fingerprint for a single finding
   */
  private generateSingleFingerprint(finding: NormalizedFinding): FindingFingerprint {
    // Create canonical form (normalized message)
    const canonicalForm = this.createCanonicalForm(finding.message);

    // Create signature based on key attributes
    const signature = this.createSignature(finding);

    // Generate hash
    const hash = this.generateHash(signature);

    return {
      hash,
      type: 'exact',
      canonicalForm,
      signature,
      metadata: {
        filePath: finding.filePath,
        line: finding.line,
        ruleId: finding.ruleId,
        severity: finding.severity,
      },
    };
  }

  /**
   * Create canonical form of message (normalized)
   */
  private createCanonicalForm(message: string): string {
    // Normalize message by:
    // 1. Converting to lowercase
    // 2. Removing extra whitespace
    // 3. Removing variable names and numbers
    // 4. Removing common noise words

    return message
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\b(variable|function|file|line|column)\b/g, '')
      .replace(/['"`]/g, '')
      .replace(/\d+/g, 'X')
      .trim();
  }

  /**
   * Create signature from finding attributes
   */
  private createSignature(finding: NormalizedFinding): string {
    const parts = [
      finding.ruleId || '',
      finding.filePath || '',
      finding.line?.toString() || '',
      finding.message.toLowerCase().replace(/\s+/g, ' ').trim(),
    ];

    return parts.join('|');
  }

  /**
   * Generate simple hash
   */
  private generateHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Detect duplicates using multiple strategies
   */
  private detectDuplicates(
    findings: NormalizedFinding[],
    fingerprints: Map<string, FindingFingerprint>
  ): DuplicateGroup[] {
    const groups: DuplicateGroup[] = [];
    const processed = new Set<string>();

    // Strategy 1: Exact duplicates (same signature)
    const exactGroups = this.detectExactDuplicates(findings, fingerprints);
    exactGroups.forEach(group => {
      groups.push(group);
      group.duplicates.forEach(f => processed.add(f.id));
    });

    // Strategy 2: Location-based duplicates (same file/line)
    const locationGroups = this.detectLocationDuplicates(
      findings.filter(f => !processed.has(f.id)),
      fingerprints
    );
    locationGroups.forEach(group => {
      groups.push(group);
      group.duplicates.forEach(f => processed.add(f.id));
    });

    // Strategy 3: Similar message duplicates
    const similarGroups = this.detectSimilarDuplicates(
      findings.filter(f => !processed.has(f.id)),
      fingerprints
    );
    similarGroups.forEach(group => {
      groups.push(group);
      group.duplicates.forEach(f => processed.add(f.id));
    });

    // Strategy 4: Semantic duplicates (same rule category)
    const semanticGroups = this.detectSemanticDuplicates(
      findings.filter(f => !processed.has(f.id)),
      fingerprints
    );
    semanticGroups.forEach(group => {
      groups.push(group);
      group.duplicates.forEach(f => processed.add(f.id));
    });

    return groups;
  }

  /**
   * Detect exact duplicates (same signature)
   */
  private detectExactDuplicates(
    findings: NormalizedFinding[],
    fingerprints: Map<string, FindingFingerprint>
  ): DuplicateGroup[] {
    const groups: DuplicateGroup[] = [];
    const seen = new Set<string>();

    for (const finding of findings) {
      if (seen.has(finding.id)) continue;

      const fingerprint = fingerprints.get(finding.id)!;
      const signature = fingerprint.signature;

      const duplicates = findings.filter(other => {
        if (other.id === finding.id) return false;
        if (seen.has(other.id)) return false;

        const otherFingerprint = fingerprints.get(other.id)!;
        return otherFingerprint.signature === signature;
      });

      if (duplicates.length > 0) {
        const allFindings = [finding, ...duplicates];
        groups.push({
          fingerprint: signature,
          type: 'exact',
          count: allFindings.length,
          representative: finding,
          duplicates: duplicates,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        });

        seen.add(finding.id);
        duplicates.forEach(d => seen.add(d.id));
      }
    }

    return groups;
  }

  /**
   * Detect location-based duplicates (same file/line)
   */
  private detectLocationDuplicates(
    findings: NormalizedFinding[],
    fingerprints: Map<string, FindingFingerprint>
  ): DuplicateGroup[] {
    const groups: DuplicateGroup[] = [];
    const locationMap = new Map<string, NormalizedFinding[]>();

    // Group by file/line
    for (const finding of findings) {
      const key = `${finding.filePath}:${finding.line || 0}`;
      if (!locationMap.has(key)) {
        locationMap.set(key, []);
      }
      locationMap.get(key)!.push(finding);
    }

    // Create groups for locations with multiple findings
    for (const [location, locationFindings] of locationMap) {
      if (locationFindings.length >= this.minOccurrences && locationFindings[0]) {
        const representative = locationFindings[0]!;
        groups.push({
          fingerprint: location,
          type: 'location',
          count: locationFindings.length,
          representative,
          duplicates: locationFindings.slice(1) as NormalizedFinding[],
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        });
      }
    }

    return groups;
  }

  /**
   * Detect similar duplicates (similar messages)
   */
  private detectSimilarDuplicates(
    findings: NormalizedFinding[],
    fingerprints: Map<string, FindingFingerprint>
  ): DuplicateGroup[] {
    const groups: DuplicateGroup[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < findings.length; i++) {
      const finding = findings[i];
      if (!finding || processed.has(finding.id)) continue;

      const group: NormalizedFinding[] = [finding];
      const canonicalA = this.createCanonicalForm(finding.message);

      for (let j = i + 1; j < findings.length; j++) {
        const other = findings[j];
        if (!other || processed.has(other.id)) continue;

        // Skip if different severity or rule
        if (finding.severity !== other.severity || finding.ruleId !== other.ruleId) {
          continue;
        }

        const canonicalB = this.createCanonicalForm(other.message);
        const similarity = StringSimilarity.similarity(canonicalA, canonicalB);

        if (similarity >= this.similarityThreshold) {
          group.push(other);
          processed.add(other.id);
        }
      }

      if (group.length >= this.minOccurrences) {
        processed.add(finding.id);
        groups.push({
          fingerprint: this.generateHash(canonicalA),
          type: 'similar',
          count: group.length,
          representative: finding,
          duplicates: group.slice(1),
          similarityScore: this.calculateGroupSimilarity(group),
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        });
      }
    }

    return groups;
  }

  /**
   * Detect semantic duplicates (same rule category in same file)
   */
  private detectSemanticDuplicates(
    findings: NormalizedFinding[],
    fingerprints: Map<string, FindingFingerprint>
  ): DuplicateGroup[] {
    const groups: DuplicateGroup[] = [];
    const fileCategoryMap = new Map<string, Map<string, NormalizedFinding[]>>();

    // Group by file and category
    for (const finding of findings) {
      const category = this.getRuleCategory(finding.ruleId);
      const fileKey = finding.filePath;

      if (!fileCategoryMap.has(fileKey)) {
        fileCategoryMap.set(fileKey, new Map());
      }

      const categoryMap = fileCategoryMap.get(fileKey)!;
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }

      categoryMap.get(category)!.push(finding);
    }

    // Create groups for files with multiple issues in same category
    for (const [file, categoryMap] of fileCategoryMap) {
      for (const [category, categoryFindings] of categoryMap) {
        if (categoryFindings.length >= this.minOccurrences && categoryFindings[0]) {
          const representative = categoryFindings[0]!;
          groups.push({
            fingerprint: `${file}:${category}`,
            type: 'semantic',
            count: categoryFindings.length,
            representative,
            duplicates: categoryFindings.slice(1) as NormalizedFinding[],
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
          });
        }
      }
    }

    return groups;
  }

  /**
   * Get rule category from rule ID
   */
  private getRuleCategory(ruleId: string): string {
    const lowerRuleId = ruleId.toLowerCase();

    if (lowerRuleId.includes('security') || lowerRuleId.includes('sql') || lowerRuleId.includes('xss')) {
      return 'security';
    }
    if (lowerRuleId.includes('complex') || lowerRuleId.includes('cyclomatic')) {
      return 'complexity';
    }
    if (lowerRuleId.includes('performance') || lowerRuleId.includes('memory')) {
      return 'performance';
    }
    if (lowerRuleId.includes('doc') || lowerRuleId.includes('comment')) {
      return 'documentation';
    }

    return 'quality';
  }

  /**
   * Calculate similarity score for a group
   */
  private calculateGroupSimilarity(findings: NormalizedFinding[]): number {
    if (!findings || findings.length < 2) return 1;

    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < findings.length; i++) {
      const findingA = findings[i];
      if (!findingA) continue;

      for (let j = i + 1; j < findings.length; j++) {
        const findingB = findings[j];
        if (!findingB) continue;

        const canonicalA = this.createCanonicalForm(findingA.message);
        const canonicalB = this.createCanonicalForm(findingB.message);
        totalSimilarity += StringSimilarity.similarity(canonicalA, canonicalB);
        comparisons++;
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 1;
  }

  /**
   * Detect patterns in duplicate groups
   */
  private detectPatterns(duplicateGroups: DuplicateGroup[]): Array<{
    name: string;
    frequency: number;
    locations: string[];
    suggestion: string;
  }> {
    const patterns: Array<{
      name: string;
      frequency: number;
      locations: string[];
      suggestion: string;
    }> = [];

    // Pattern 1: Recurring locations
    const locationFrequency = new Map<string, number>();
    const locationToGroups = new Map<string, DuplicateGroup[]>();

    for (const group of duplicateGroups) {
      const locations = [...new Set(group.duplicates.map(d => d.filePath))];
      for (const location of locations) {
        locationFrequency.set(location, (locationFrequency.get(location) || 0) + 1);
        if (!locationToGroups.has(location)) {
          locationToGroups.set(location, []);
        }
        locationToGroups.get(location)!.push(group);
      }
    }

    for (const [location, frequency] of locationFrequency) {
      if (frequency >= this.minOccurrences) {
        patterns.push({
          name: 'Recurring Location Pattern',
          frequency,
          locations: [location],
          suggestion: `File ${location} has ${frequency} duplicate issues. Consider refactoring.`,
        });
      }
    }

    // Pattern 2: Rule patterns
    const ruleFrequency = new Map<string, number>();
    for (const group of duplicateGroups) {
      ruleFrequency.set(group.representative.ruleId, (ruleFrequency.get(group.representative.ruleId) || 0) + group.count);
    }

    for (const [rule, frequency] of ruleFrequency) {
      if (frequency >= 5) {
        patterns.push({
          name: 'Rule Pattern',
          frequency,
          locations: [],
          suggestion: `Rule ${rule} triggered ${frequency} times. Review rule configuration.`,
        });
      }
    }

    return patterns;
  }

  /**
   * Generate recommendations based on patterns
   */
  private generateRecommendations(duplicateGroups: DuplicateGroup[]): Array<{
    type: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
  }> {
    const recommendations: Array<{
      type: string;
      description: string;
      priority: 'low' | 'medium' | 'high';
    }> = [];

    const totalDuplicates = duplicateGroups.reduce((sum, group) => sum + (group.count - 1), 0);
    const highImpactDuplicates = duplicateGroups.filter(g => g.type === 'exact').length;

    if (totalDuplicates > 10) {
      recommendations.push({
        type: 'Deduplication',
        description: `Found ${totalDuplicates} duplicate findings. Consider improving analysis precision.`,
        priority: 'medium',
      });
    }

    if (highImpactDuplicates > 5) {
      recommendations.push({
        type: 'Exact Duplicates',
        description: `High number of exact duplicates (${highImpactDuplicates} groups) detected.`,
        priority: 'high',
      });
    }

    if (duplicateGroups.some(g => g.type === 'location')) {
      recommendations.push({
        type: 'Location Clustering',
        description: 'Multiple issues in same locations detected. Review file structure.',
        priority: 'medium',
      });
    }

    return recommendations;
  }

  /**
   * Calculate size reduction
   */
  private calculateSizeReduction(originalCount: number, uniqueCount: number): number {
    return ((originalCount - uniqueCount) / originalCount) * 100;
  }

  /**
   * Calculate memory saved
   */
  private calculateMemorySaved(originalCount: number, uniqueCount: number): number {
    // Estimate: each finding takes ~1KB
    const bytesPerFinding = 1024;
    return (originalCount - uniqueCount) * bytesPerFinding;
  }
}
