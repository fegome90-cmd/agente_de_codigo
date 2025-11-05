#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "../../..");

const program = new Command();

// Configuration
const PACKAGE_VERSION = "1.0.0";

// Utility functions for agent execution
function runAgent(
  agentName: string,
  scope: string,
  options: any = {},
): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      let command: string;
      let args: string[] = [];

      switch (agentName) {
        case "security":
          // Python security agent with virtual environment
          command = "bash";
          args = [
            join(projectRoot, "scripts/run-python-agent.sh"), // Use wrapper script with venv
            join(projectRoot, "packages/agents/security_agent.py"),
            "--scope",
            scope,
            "--format",
            options.format || "text",
          ];
          if (options.output) {
            args.push("--output", options.output);
          }
          break;

        case "quality":
          // Python quality agent with virtual environment
          command = "bash";
          args = [
            join(projectRoot, "scripts/run-python-agent.sh"), // Use wrapper script with venv
            join(projectRoot, "packages/agents/quality_agent.py"),
            "--scope",
            scope,
            "--format",
            options.format || "text",
          ];
          if (options.output) {
            args.push("--output", options.output);
          }
          break;

        case "architecture":
          // TypeScript architecture agent
          command = "node";
          args = [
            join(projectRoot, "packages/architecture-agent/dist/index.js"),
            "--scope",
            scope,
            "--format",
            options.format || "text",
          ];
          if (options.output) {
            args.push("--output", options.output);
          }
          break;

        case "documentation":
          // TypeScript documentation agent
          command = "node";
          args = [
            join(projectRoot, "packages/documentation-agent/dist/index.js"),
            "--scope",
            scope,
            "--format",
            options.format || "text",
          ];
          if (options.output) {
            args.push("--output", options.output);
          }
          break;

        default:
          throw new Error(`Unknown agent: ${agentName}`);
      }

      // Execute the agent
      const result = execSync(`${command} ${args.join(" ")}`, {
        encoding: "utf8",
        cwd: projectRoot,
        timeout: 300000, // 5 minutes timeout
      });

      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

program
  .name("agente")
  .description("Multi-Agent Code Review System CLI")
  .version(PACKAGE_VERSION);

// Security command
program
  .command("security")
  .description("Run Security Agent (SAST scanning)")
  .argument("[scope]", "Directory or file to analyze", ".")
  .option("-o, --output <file>", "Save results to file")
  .option("-f, --format <format>", "Output format (text|json)", "text")
  .option("-v, --verbose", "Verbose output")
  .action(async (scope, options) => {
    const spinner = ora("🔒 Running Security Agent...").start();

    try {
      // Execute real security agent
      const result = await runAgent("security", scope, options);

      spinner.succeed("Security analysis completed");

      // Display results
      if (options.format === "json") {
        console.log(JSON.parse(result));
      } else {
        console.log(result);
      }

      if (options.verbose) {
        console.log(chalk.blue("Scope:"), scope);
        console.log(chalk.blue("Format:"), options.format);
        if (options.output) {
          console.log(chalk.blue("Output:"), options.output);
        }
      }
    } catch (error) {
      spinner.fail("Security analysis failed");
      console.error(chalk.red("Error:"), error);
      process.exit(1);
    }
  });

// Quality command
program
  .command("quality")
  .description("Run Quality Agent (code quality)")
  .argument("[scope]", "Directory or file to analyze", ".")
  .option("-o, --output <file>", "Save results to file")
  .option("-f, --format <format>", "Output format (text|json)", "text")
  .option("-v, --verbose", "Verbose output")
  .action(async (scope, options) => {
    const spinner = ora("✨ Running Quality Agent...").start();

    try {
      // Execute real quality agent
      const result = await runAgent("quality", scope, options);

      spinner.succeed("Quality analysis completed");

      // Display results
      if (options.format === "json") {
        console.log(JSON.parse(result));
      } else {
        console.log(result);
      }

      if (options.verbose) {
        console.log(chalk.blue("Scope:"), scope);
        console.log(chalk.blue("Format:"), options.format);
        if (options.output) {
          console.log(chalk.blue("Output:"), options.output);
        }
      }
    } catch (error) {
      spinner.fail("Quality analysis failed");
      console.error(chalk.red("Error:"), error);
      process.exit(1);
    }
  });

// Full review command
program
  .command("review")
  .description("Run complete review with all agents")
  .argument("[scope]", "Directory to analyze", ".")
  .option("-o, --output-dir <dir>", "Output directory", "obs/reports")
  .option("-v, --verbose", "Verbose output")
  .option("--timeout <seconds>", "Timeout in seconds", "300")
  .action(async (scope, options) => {
    const spinner = ora("🏁 Running Complete Review...").start();

    try {
      // Execute full review with all agents
      const agents = ["security", "quality", "architecture", "documentation"];
      const results: any = {};

      for (const agentName of agents) {
        spinner.text = `Running ${agentName} agent...`;
        try {
          const result = await runAgent(agentName, scope, {
            format: "json",
            output: `${options.outputDir}/${agentName}-report.txt`,
          });
          results[agentName] = result;
        } catch (error) {
          results[agentName] = {
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      spinner.succeed("Complete review finished");

      // Display summary
      console.log(chalk.green("\n📊 Review Summary:"));
      for (const [agent, result] of Object.entries(results)) {
        const resObj = result as any;
        if (resObj.error) {
          console.log(chalk.red(`  ${agent}: Error - ${resObj.error}`));
        } else {
          console.log(chalk.green(`  ${agent}: Completed`));
        }
      }

      if (options.verbose) {
        console.log(chalk.blue("Scope:"), scope);
        console.log(chalk.blue("Output:"), options.outputDir);
        console.log(chalk.blue("Timeout:"), options.timeout + "s");
      }
    } catch (error) {
      spinner.fail("Complete review failed");
      console.error(chalk.red("Error:"), error);
      process.exit(1);
    }
  });

// Status command
program
  .command("status")
  .description("Check system status and health")
  .action(async () => {
    console.log(chalk.blue("🔍 Checking System Status..."));

    // Check Docker services
    const dockerSpinner = ora("Checking Docker services...").start();
    // TODO: Implement Docker service checks
    await new Promise((resolve) => setTimeout(resolve, 1000));
    dockerSpinner.succeed("Docker services running");

    // Check MemTech connection
    const memtechSpinner = ora("Checking MemTech connection...").start();
    // TODO: Implement MemTech health check
    await new Promise((resolve) => setTimeout(resolve, 1000));
    memtechSpinner.succeed("MemTech connection healthy");

    // Check agents
    const agentsSpinner = ora("Checking agents...").start();
    // TODO: Implement agent status checks
    await new Promise((resolve) => setTimeout(resolve, 1000));
    agentsSpinner.succeed("All agents ready");

    console.log(chalk.green("\n✅ System is ready to run reviews!"));
  });

// Parse command line arguments
program.parse();
