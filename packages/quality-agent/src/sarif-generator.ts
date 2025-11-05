/**
 * SARIF Generator
 * Generates SARIF 2.1.0 compliant reports
 */

import type { QualityFinding, QualityAnalysisResult } from "./types.js";

interface SARIFLog {
  $schema: string;
  version: string;
  runs: SARIFRun[];
}

interface SARIFRun {
  tool: SARIFTool;
  invocations: SARIFInvocation[];
  artifacts?: SARIFArtifact[];
  results: SARIFResult[];
}

interface SARIFTool {
  driver: SARIFDriver;
}

interface SARIFDriver {
  name: string;
  version?: string;
  informationUri?: string;
  rules: SARIFRule[];
}

interface SARIFRule {
  id: string;
  name: string;
  shortDescription: {
    text: string;
  };
  fullDescription?: {
    text: string;
  };
  helpUri?: string;
  defaultConfiguration: {
    level: "error" | "warning" | "note";
    enabled?: boolean;
  };
  properties?: Record<string, any>;
}

interface SARIFInvocation {
  executionSuccessful: boolean;
  exitCode?: number;
  endTimeUtc?: string;
  machine?: string;
  arguments?: string[];
}

interface SARIFArtifact {
  location: {
    uri: string;
  };
  length?: number;
  roles: string[];
}

interface SARIFResult {
  ruleId: string;
  level: "error" | "warning" | "note";
  message: {
    text: string;
    markdown?: string;
  };
  locations: SARIFLocation[];
  fixes?: SARIFFix[];
}

interface SARIFLocation {
  physicalLocation: SARIFPhysicalLocation;
}

interface SARIFPhysicalLocation {
  artifactLocation: SARIFArtifactLocation;
  region: SARIFRegion;
}

interface SARIFArtifactLocation {
  uri: string;
}

interface SARIFRegion {
  startLine: number;
  startColumn: number;
  endLine?: number;
  endColumn?: number;
}

interface SARIFFix {
  description: {
    text: string;
  };
  artifactChanges: SARIFArtifactChange[];
}

interface SARIFArtifactChange {
  artifactLocation: SARIFArtifactLocation;
  replacements: SARIFReplacement[];
}

interface SARIFReplacement {
  deletedRegion: SARIFRegion;
  insertedContent?: string;
}

export class SARIFGenerator {
  private toolName: string;
  private toolVersion?: string;

  constructor(toolName: string, toolVersion?: string) {
    this.toolName = toolName;
    this.toolVersion = toolVersion;
  }

  generate(analysisResult: QualityAnalysisResult): SARIFLog {
    const rules = this.extractRules(analysisResult.findings);
    const artifacts = this.extractArtifacts(analysisResult.findings);
    const results = this.convertFindings(analysisResult.findings);

    const run: SARIFRun = {
      tool: {
        driver: {
          name: this.toolName,
          version: this.toolVersion,
          rules,
        },
      },
      invocations: [
        {
          executionSuccessful: true,
          endTimeUtc: new Date().toISOString(),
        },
      ],
      artifacts: artifacts.length > 0 ? artifacts : undefined,
      results,
    };

    return {
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      version: "2.1.0",
      runs: [run],
    };
  }

  private extractRules(findings: QualityFinding[]): SARIFRule[] {
    const ruleMap = new Map<string, SARIFRule>();

    for (const finding of findings) {
      if (!ruleMap.has(finding.ruleId)) {
        ruleMap.set(finding.ruleId, {
          id: finding.ruleId,
          name: this.getRuleName(finding.ruleId),
          shortDescription: {
            text:
              (finding.message || finding.ruleId || "").split(".")[0] ||
              "Quality issue",
          },
          fullDescription: {
            text:
              finding.message ?? finding.ruleId ?? "No description available",
          },
          defaultConfiguration: {
            level: this.getSARIFLevel(finding.severity),
            enabled: true,
          },
          properties: {
            category: finding.category,
            source: finding.source,
            fixable: finding.fixable,
          },
        });
      }
    }

    return Array.from(ruleMap.values());
  }

  private extractArtifacts(findings: QualityFinding[]): SARIFArtifact[] {
    const artifactMap = new Map<string, SARIFArtifact>();

    for (const finding of findings) {
      const uri = this.getArtifactUri(finding.filePath);
      if (!artifactMap.has(uri)) {
        artifactMap.set(uri, {
          location: { uri },
          roles: ["analysis_target"],
        });
      }
    }

    return Array.from(artifactMap.values());
  }

  private convertFindings(findings: QualityFinding[]): SARIFResult[] {
    return findings.map((finding) => ({
      ruleId: finding.ruleId,
      level: this.getSARIFLevel(finding.severity),
      message: {
        text: finding.message,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: this.getArtifactUri(finding.filePath),
            },
            region: {
              startLine: finding.line,
              startColumn: finding.column,
              endLine: finding.endLine || finding.line,
              endColumn: finding.endColumn || finding.column + 1,
            },
          },
        },
      ],
      fixes: this.createFixes(finding),
    }));
  }

  private getArtifactUri(filePath: string): string {
    // Convert file paths to relative URIs
    if (filePath.startsWith("/")) {
      return filePath.slice(1);
    }
    return filePath;
  }

  private getRuleName(ruleId: string): string {
    // Convert rule ID to readable name
    return ruleId
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  private getSARIFLevel(severity: string): "error" | "warning" | "note" {
    switch (severity) {
      case "error":
        return "error";
      case "warning":
        return "warning";
      case "info":
        return "note";
      default:
        return "warning";
    }
  }

  private createFixes(finding: QualityFinding): SARIFFix[] | undefined {
    if (!finding.fixable || !finding.suggestion) {
      return undefined;
    }

    // Create a generic fix placeholder
    return [
      {
        description: {
          text: finding.suggestion,
        },
        artifactChanges: [
          {
            artifactLocation: {
              uri: this.getArtifactUri(finding.filePath),
            },
            replacements: [
              {
                deletedRegion: {
                  startLine: finding.line,
                  startColumn: finding.column,
                  endLine: finding.endLine || finding.line,
                  endColumn: finding.endColumn || finding.column + 1,
                },
              },
            ],
          },
        ],
      },
    ];
  }

  static fromQualityAnalysis(
    analysisResult: QualityAnalysisResult,
    toolName: string = "quality-agent",
    toolVersion?: string,
  ): string {
    const generator = new SARIFGenerator(toolName, toolVersion);
    const sarifLog = generator.generate(analysisResult);
    return JSON.stringify(sarifLog, null, 2);
  }

  validateSARIF(sarifJson: string): boolean {
    try {
      const sarif = JSON.parse(sarifJson);
      return (
        sarif.version === "2.1.0" &&
        sarif.runs &&
        Array.isArray(sarif.runs) &&
        sarif.runs.length > 0
      );
    } catch {
      return false;
    }
  }
}
