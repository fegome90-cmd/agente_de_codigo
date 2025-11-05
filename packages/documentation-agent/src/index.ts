#!/usr/bin/env node

/**
 * Documentation Agent Entry Point
 * Main script that starts the documentation agent with standalone and orchestrator modes
 */

import { config } from "dotenv";
import { DocumentationAgent } from "./documentation-agent.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Load environment variables
config();

/**
 * Get command line arguments
 */
function parseArgs(): {
  scope?: string;
  format?: string;
  output?: string;
  help?: boolean;
} {
  const args = process.argv.slice(2);
  const result: {
    scope?: string;
    format?: string;
    output?: string;
    help?: boolean;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--scope":
      case "-s":
        result.scope = args[++i];
        break;
      case "--format":
      case "-f":
        result.format = args[++i];
        break;
      case "--output":
      case "-o":
        result.output = args[++i];
        break;
      case "--help":
      case "-h":
        result.help = true;
        break;
    }
  }

  return result;
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
Documentation Agent - OpenAPI Analysis Tool

Usage: node packages/documentation-agent/dist/index.js [options]

Options:
  --scope, -s <path>     Directory or file to analyze (required for standalone)
  --format, -f <format>  Output format (text|json|sarif) (default: text)
  --output, -o <file>    Output file path
  --help, -h            Show this help message

Examples:
  # Standalone analysis
  node packages/documentation-agent/dist/index.js --scope ./api-specs/ --format json

  # With orchestrator (default)
  node packages/documentation-agent/dist/index.js

  # Help
  node packages/documentation-agent/dist/index.js --help
`);
}

/**
 * Standalone analysis function
 */
async function runStandaloneAnalysis(
  scope: string,
  format: string = "text",
  output?: string,
): Promise<void> {
  console.log("🔧 Running Documentation Agent in standalone mode");
  console.log(`📁 Scope: ${scope}`);
  console.log(`📄 Format: ${format}`);

  try {
    // Create a simple task data structure for standalone mode
    const taskData = {
      scope: [scope],
      context: { standalone: true },
      output: output,
      config: {
        analysis: {
          openapiValidation: true,
          breakingChangeDetection: true,
          semverAnalysis: true,
          changelogGeneration: true,
        },
      },
    };

    // Define finding interface for standalone mode
    interface StandaloneFinding {
      type: string;
      severity: "info" | "warning" | "error";
      message: string;
      file?: string;
      line?: number;
      scope?: string;
    }

    // Create agent instance
    const agent = new DocumentationAgent("/tmp/pit-crew-orchestrator.sock");

    // Create result structure
    const result: {
      agent: string;
      version: string;
      timestamp: string;
      standalone: boolean;
      scope: string;
      findings: StandaloneFinding[];
      summary: string;
      analysis: {
        openapiSpecsFound: number;
        validationErrors: number;
        breakingChanges: number;
        changelogGenerated: boolean;
      };
    } = {
      agent: "documentation",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      standalone: true,
      scope,
      findings: [],
      summary: "Documentation analysis completed in standalone mode",
      analysis: {
        openapiSpecsFound: 0,
        validationErrors: 0,
        breakingChanges: 0,
        changelogGenerated: false,
      },
    };

    // Check if scope exists
    const fs = await import("node:fs/promises");
    const stats = await fs.stat(scope);

    if (stats.isDirectory()) {
      // Scan for OpenAPI files
      const { glob } = await import("glob");
      const openapiFiles = await glob(
        ["**/*.{yaml,yml,json}", "**/openapi*.{yaml,yml,json}"],
        {
          cwd: scope,
          absolute: true,
          ignore: ["**/node_modules/**", "**/test/**", "**/tests/**"],
        },
      );

      result.analysis.openapiSpecsFound = openapiFiles.length;

      if (openapiFiles.length > 0) {
        console.log(`📋 Found ${openapiFiles.length} OpenAPI specification(s)`);

        // Simple validation simulation
        for (const file of openapiFiles) {
          try {
            const content = await readFile(file, "utf-8");
            if (content.includes("openapi:") || content.includes("swagger:")) {
              result.findings.push({
                type: "openapi-spec-found",
                severity: "info",
                message: `OpenAPI specification found: ${file}`,
                file: file,
                line: 1,
              });
            }
          } catch (error) {
            result.findings.push({
              type: "file-read-error",
              severity: "warning",
              message: `Failed to read file: ${file}`,
              file: file,
              line: 1,
            });
          }
        }
      } else {
        result.findings.push({
          type: "no-openapi-specs",
          severity: "info",
          message: `No OpenAPI specifications found in ${scope}`,
          scope: scope,
          line: 0,
        });
      }
    } else if (stats.isFile()) {
      // Single file analysis
      const content = await readFile(scope, "utf-8");
      if (content.includes("openapi:") || content.includes("swagger:")) {
        result.analysis.openapiSpecsFound = 1;
        result.findings.push({
          type: "openapi-spec-found",
          severity: "info",
          message: `OpenAPI specification found: ${scope}`,
          file: scope,
          line: 1,
        });
      } else {
        result.findings.push({
          type: "not-openapi-spec",
          severity: "warning",
          message: `File does not appear to be an OpenAPI specification: ${scope}`,
          file: scope,
          line: 1,
        });
      }
    }

    // Output results
    let outputText = "";
    switch (format) {
      case "json":
        outputText = JSON.stringify(result, null, 2);
        break;
      case "sarif":
        const sarif = {
          $schema: "https://json.schemastore.org/sarif-2.1.0",
          version: "2.1.0",
          runs: [
            {
              tool: {
                driver: {
                  name: "Documentation Agent",
                  version: "1.0.0",
                },
              },
              results: result.findings.map((finding) => ({
                ruleId: finding.type,
                level:
                  finding.severity === "error"
                    ? "error"
                    : finding.severity === "warning"
                      ? "warning"
                      : "note",
                message: { text: finding.message },
                locations: finding.file
                  ? [
                      {
                        physicalLocation: {
                          artifactLocation: { uri: finding.file },
                          region: finding.line
                            ? { startLine: finding.line }
                            : undefined,
                        },
                      },
                    ]
                  : [],
              })),
            },
          ],
        };
        outputText = JSON.stringify(sarif, null, 2);
        break;
      default: // text
        outputText = `Documentation Agent - Standalone Analysis Results\n`;
        outputText += `Scope: ${scope}\n`;
        outputText += `OpenAPI Specs Found: ${result.analysis.openapiSpecsFound}\n`;
        outputText += `Findings: ${result.findings.length}\n\n`;

        if (result.findings.length > 0) {
          outputText += "Findings:\n";
          result.findings.forEach((finding, index) => {
            outputText += `${index + 1}. [${finding.severity.toUpperCase()}] ${finding.type}: ${finding.message}\n`;
            if (finding.file) {
              outputText += `   File: ${finding.file}`;
              if (finding.line) outputText += `:${finding.line}`;
              outputText += "\n";
            }
          });
        } else {
          outputText += "No issues found.\n";
        }
    }

    // Write output
    if (output) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(output, outputText);
      console.log(`📄 Results written to: ${output}`);
    } else {
      console.log("\n" + outputText);
    }
  } catch (error) {
    console.error("❌ Standalone analysis failed:", error);
    process.exit(1);
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const args = parseArgs();

  // Show help if requested
  if (args.help) {
    showHelp();
    return;
  }

  // Check if running standalone mode (has scope argument)
  if (args.scope) {
    await runStandaloneAnalysis(args.scope, args.format || "text", args.output);
    return;
  }

  // Default: Start orchestrator mode
  const socketPath =
    process.env.SOCKET_PATH ||
    process.env.PIT_CREW_SOCKET_PATH ||
    "/tmp/pit-crew-orchestrator.sock";

  console.log("🚀 Starting Documentation Agent...");
  console.log(`📡 Socket path: ${socketPath}`);

  try {
    const agent = new DocumentationAgent(socketPath);
    await agent.start();
  } catch (error) {
    console.error("❌ Documentation agent failed to start:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Documentation agent interrupted by user");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Documentation agent terminated");
  process.exit(0);
});

// Start the agent
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("❌ Failed to start Documentation Agent:", error);
    process.exit(1);
  });
}

export { DocumentationAgent } from "./documentation-agent.js";
export { OpenAPIParser } from "./openapi-parser.js";
export { DocumentationSocketClient } from "./socket-client.js";
export * from "./types.js";
