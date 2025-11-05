#!/usr/bin/env python3
"""
Quality Agent - Independent Process
F1 Pit Stop Architecture - Code quality analysis with linting, complexity analysis, and duplication detection
"""

import os
import sys
import json
import subprocess
import time
import asyncio
from pathlib import Path
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from datetime import datetime, timezone
import logging

# Add the IPC client to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "ipc"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "plugins"))

# flake8: noqa: E402
from ipc.socket_client import SocketClient
from plugins.base import QualityPlugin, QaIssue, PluginResult, RunnerContext
from plugins.yaml_syntax import YAMLSyntaxPlugin
from plugins.typescript_syntax import TypeScriptSyntaxPlugin

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [QUALITY_AGENT]: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("/tmp/pit-crew-quality-agent.log"),
    ],
)

logger = logging.getLogger(__name__)


@dataclass
class QualityConfig:
    """Quality agent configuration"""

    timeout_seconds: int = 45
    max_file_size_mb: int = 5
    scan_complexity: bool = True
    scan_duplication: bool = True
    complexity_threshold: int = 10
    duplication_threshold: float = 0.8
    ruff_enabled: bool = True
    eslint_enabled: bool = True
    lizard_enabled: bool = True
    yaml_syntax_enabled: bool = True
    typescript_syntax_enabled: bool = True
    analysis_mode: str = "standard"  # "standard", "syntax_extended", "yaml_strict"
    output_format: str = "json"
    languages: List[str] = None

    def __post_init__(self):
        if self.languages is None:
            self.languages = ["python", "javascript", "typescript", "jsx", "tsx", "yaml", "yml"]


@dataclass
class QualityFinding:
    """Quality finding structure"""

    tool: str  # "ruff", "eslint", "lizard", "duplication"
    rule_id: str
    message: str
    severity: str  # "error", "warning", "info"
    file_path: str
    line_number: int
    column_number: Optional[int] = None
    end_line_number: Optional[int] = None
    end_column_number: Optional[int] = None
    category: Optional[str] = None  # "complexity", "style", "duplication", etc.
    score: Optional[float] = None  # complexity score, similarity percentage, etc.
    fix_suggestion: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class QualityAgent(SocketClient):
    """Quality agent implementation with plugin architecture"""

    def __init__(self, socket_path: str):
        super().__init__(socket_path, "quality")
        self.config = QualityConfig()
        self.findings: List[QualityFinding] = []

        # Initialize plugins
        self.plugins = {
            'yaml_syntax': YAMLSyntaxPlugin(),
            'typescript_syntax': TypeScriptSyntaxPlugin()
        }

        # Error resilience
        self.consecutive_errors = 0
        self.max_consecutive_errors = 10
        self.last_successful_run = time.time()
        self.error_threshold_cooldown = 300  # 5 minutes

    def _get_capabilities(self) -> Dict[str, Any]:
        """Get quality agent capabilities"""
        tools = [
            "ruff",
            "eslint",
            "lizard",
            "duplication-detection",
            "complexity-analysis",
        ]

        # Add plugin capabilities
        if self.config.yaml_syntax_enabled:
            tools.append("yaml-syntax")
        if self.config.typescript_syntax_enabled:
            tools.append("typescript-syntax")

        return {
            "supports_heartbeat": True,
            "supports_tasks": True,
            "supports_events": True,
            "tools": tools,
            "languages": self.config.languages,
            "scan_types": ["linting", "complexity", "duplication", "style", "syntax"],
            "output_formats": ["json", "sarif"],
            "analysis_modes": ["standard", "syntax_extended", "yaml_strict"],
            "plugins": list(self.plugins.keys())
        }

    async def handle_task(self, task_id: str, task_data: Dict[str, Any]):
        """Handle quality analysis task"""
        logger.info(f"Starting quality analysis task: {task_id}")

        # Check error resilience threshold
        time_since_last_success = time.time() - self.last_successful_run

        # If too many consecutive errors and still in cooldown period, reject task
        if (
            self.consecutive_errors >= self.max_consecutive_errors and
            time_since_last_success < self.error_threshold_cooldown
        ):
            logger.error(
                f"Agent in error state: {self.consecutive_errors} consecutive errors, "
                f"cooldown {int(self.error_threshold_cooldown - time_since_last_success)}s remaining"
            )
            self.send_task_response(
                task_id,
                "failed",
                {
                    "error": f"Agent in error state: too many consecutive failures ({self.consecutive_errors})",
                    "cooldown_remaining": int(
                        self.error_threshold_cooldown - time_since_last_success
                    ),
                },
            )
            return

        start_time = time.time()

        try:
            # Parse task configuration
            scope = task_data.get("scope", [])
            context = task_data.get("context", {})
            output_file = task_data.get("output", "")
            config = task_data.get("config", {})
            mode = task_data.get("mode", "standard")

            # Update configuration with task-specific settings
            self._update_config(config)
            self.config.analysis_mode = mode

            # Filter quality-relevant files
            quality_files = self._filter_quality_files(scope)
            logger.info(f"Filtered {len(quality_files)} files for quality analysis")

            if not quality_files:
                logger.warning("No quality-relevant files found")
                self.send_task_response(
                    task_id,
                    "done",
                    {
                        "findings_count": 0,
                        "severity_breakdown": {},
                        "tools_used": [],
                        "output_file": output_file,
                        "analysis_summary": "No quality-relevant files found",
                    },
                    0,
                )
                return

            # Run quality analysis
            results = await self._run_quality_analysis(quality_files, context)

            # Generate quality report
            quality_report = self._generate_quality_report(
                task_id, quality_files, context, results
            )

            # Save results to output file
            if output_file:
                self._save_results(quality_report, output_file)
                logger.info(f"Results saved to: {output_file}")

            # Send response
            duration_ms = int((time.time() - start_time) * 1000)
            self.send_task_response(
                task_id,
                "done",
                {
                    "findings_count": len(self.findings),
                    "severity_breakdown": self._get_severity_breakdown(),
                    "category_breakdown": self._get_category_breakdown(),
                    "tools_used": list(results.get("tools_used", set())),
                    "files_analyzed": len(quality_files),
                    "output_file": output_file,
                    "analysis_summary": self._generate_summary(results),
                },
                duration_ms,
            )

            logger.info(
                f"Quality analysis completed: {len(self.findings)} findings in {duration_ms}ms"
            )

            # Reset error counter on success
            self.consecutive_errors = 0
            self.last_successful_run = time.time()

        except Exception as e:
            logger.error(f"Error in quality analysis: {str(e)}")

            # Increment error counter on failure
            self.consecutive_errors += 1
            logger.error(
                f"Consecutive errors: {self.consecutive_errors}/{self.max_consecutive_errors}. "
                f"Agent will enter cooldown after {self.max_consecutive_errors} consecutive failures."
            )
            duration_ms = int((time.time() - start_time) * 1000)
            self.send_task_response(
                task_id,
                "failed",
                {"error": str(e), "error_type": "quality_analysis_error"},
                duration_ms,
            )

    def _update_config(self, task_config: Dict[str, Any]):
        """Update configuration with task-specific settings"""
        if "timeout_seconds" in task_config:
            self.config.timeout_seconds = task_config["timeout_seconds"]
        if "complexity_threshold" in task_config:
            self.config.complexity_threshold = task_config["complexity_threshold"]
        if "duplication_threshold" in task_config:
            self.config.duplication_threshold = task_config["duplication_threshold"]
        if "scan_complexity" in task_config:
            self.config.scan_complexity = task_config["scan_complexity"]
        if "scan_duplication" in task_config:
            self.config.scan_duplication = task_config["scan_duplication"]

    def _filter_quality_files(self, scope: List[str]) -> List[str]:
        """Filter files for quality analysis"""
        quality_files = []

        # Base quality extensions for existing tools
        quality_extensions = {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}

        # Add syntax validation extensions based on mode and enabled plugins
        if self.config.yaml_syntax_enabled and self.config.analysis_mode in ["syntax_extended", "yaml_strict"]:
            quality_extensions.update({".yaml", ".yml"})

        if self.config.typescript_syntax_enabled and self.config.analysis_mode in ["syntax_extended"]:
            # TypeScript/JavaScript extensions already included above
            pass

        # For yaml_strict mode, only include YAML files and exclude others
        if self.config.analysis_mode == "yaml_strict":
            quality_extensions = {".yaml", ".yml"}

        for file_path in scope:
            file_path = Path(file_path)

            # Check if file exists and is within size limit
            if not file_path.exists():
                continue

            if file_path.stat().st_size > self.config.max_file_size_mb * 1024 * 1024:
                logger.warning(f"Skipping large file: {file_path}")
                continue

            # Check file extension
            if file_path.suffix.lower() in quality_extensions:
                quality_files.append(str(file_path))

        return quality_files

    async def _run_quality_analysis(
        self, files: List[str], context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Run quality analysis using multiple tools and plugins"""
        results = {
            "findings": [],
            "tools_used": set(),
            "analysis_time": {},
            "file_counts": {},
            "plugin_results": {},
        }

        # Group files by type for existing tools
        python_files = [f for f in files if f.endswith(".py")]
        js_ts_files = [
            f
            for f in files
            if any(
                f.endswith(ext)
                for ext in [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]
            )
        ]

        # Run existing tools
        # Run Ruff for Python files
        if python_files and self.config.ruff_enabled:
            logger.info("Running Ruff analysis...")
            start_time = time.time()
            ruff_results = await self._run_ruff_analysis(python_files)
            results["findings"].extend(ruff_results)
            results["tools_used"].add("ruff")
            results["analysis_time"]["ruff"] = time.time() - start_time
            results["file_counts"]["ruff"] = len(python_files)

        # Run ESLint for JavaScript/TypeScript files
        if js_ts_files and self.config.eslint_enabled:
            logger.info("Running ESLint analysis...")
            start_time = time.time()
            eslint_results = await self._run_eslint_analysis(js_ts_files)
            results["findings"].extend(eslint_results)
            results["tools_used"].add("eslint")
            results["analysis_time"]["eslint"] = time.time() - start_time
            results["file_counts"]["eslint"] = len(js_ts_files)

        # Run complexity analysis
        if files and self.config.scan_complexity:
            logger.info("Running complexity analysis...")
            start_time = time.time()
            complexity_results = await self._run_complexity_analysis(files)
            results["findings"].extend(complexity_results)
            results["tools_used"].add("lizard")
            results["analysis_time"]["complexity"] = time.time() - start_time
            results["file_counts"]["complexity"] = len(files)

        # Run duplication detection
        if files and self.config.scan_duplication:
            logger.info("Running duplication detection...")
            start_time = time.time()
            duplication_results = await self._run_duplication_detection(files)
            results["findings"].extend(duplication_results)
            results["tools_used"].add("duplication")
            results["analysis_time"]["duplication"] = time.time() - start_time
            results["file_counts"]["duplication"] = len(files)

        # Run syntax validation plugins
        await self._run_syntax_plugins(files, context, results)

        # Store findings in instance variable
        self.findings = results["findings"]

        return results

    async def _run_syntax_plugins(self, files: List[str], context: Dict[str, Any], results: Dict[str, Any]):
        """Run syntax validation plugins based on analysis mode"""
        plugin_tasks = []
        plugin_names = []

        # Determine which plugins to run based on mode
        if self.config.analysis_mode == "syntax_extended":
            if self.config.yaml_syntax_enabled:
                plugin_tasks.append(self.plugins['yaml_syntax'].safe_analyze(files, self._create_runner_context(context)))
                plugin_names.append('yaml_syntax')
            if self.config.typescript_syntax_enabled:
                plugin_tasks.append(self.plugins['typescript_syntax'].safe_analyze(files, self._create_runner_context(context)))
                plugin_names.append('typescript_syntax')

        elif self.config.analysis_mode == "yaml_strict":
            if self.config.yaml_syntax_enabled:
                plugin_tasks.append(self.plugins['yaml_syntax'].safe_analyze(files, self._create_runner_context(context)))
                plugin_names.append('yaml_syntax')

        # Execute plugins in parallel
        if plugin_tasks:
            logger.info(f"Running syntax plugins: {', '.join(plugin_names)}")
            start_time = time.time()

            plugin_results = await asyncio.gather(*plugin_tasks, return_exceptions=True)

            # Process plugin results
            for i, result in enumerate(plugin_results):
                plugin_name = plugin_names[i]

                if isinstance(result, Exception):
                    logger.error(f"Plugin {plugin_name} failed: {result}")
                    results["plugin_results"][plugin_name] = {
                        "status": "failed",
                        "error": str(result)
                    }
                else:
                    # Convert plugin issues to QualityFinding format
                    plugin_findings = self._convert_plugin_issues(result.issues)
                    results["findings"].extend(plugin_findings)
                    results["tools_used"].add(plugin_name)
                    results["analysis_time"][plugin_name] = result.execution_time or 0
                    results["file_counts"][plugin_name] = result.files_analyzed
                    results["plugin_results"][plugin_name] = {
                        "status": result.status,
                        "issues_count": len(result.issues),
                        "stats": result.stats
                    }

            total_plugin_time = time.time() - start_time
            logger.info(f"Syntax plugins completed in {total_plugin_time:.2f}s")

    def _create_runner_context(self, context: Dict[str, Any]) -> RunnerContext:
        """Create runner context for plugins"""
        return RunnerContext(
            mode=self.config.analysis_mode,
            timeout_seconds=self.config.timeout_seconds,
            working_directory=context.get("working_directory", os.getcwd()),
            config=context.get("plugin_config", {})
        )

    def _convert_plugin_issues(self, plugin_issues: List[QaIssue]) -> List[QualityFinding]:
        """Convert plugin issues to QualityFinding format"""
        findings = []

        for issue in plugin_issues:
            finding = QualityFinding(
                tool=issue.data.get("plugin", "unknown") if issue.data else "unknown",
                rule_id=issue.rule_id,
                message=issue.message,
                severity=issue.severity,
                file_path=issue.file,
                line_number=issue.start_line,
                column_number=issue.start_column,
                end_line_number=issue.end_line,
                end_column_number=issue.end_column,
                category="syntax",
                fix_suggestion=issue.data.get("suggestion") if issue.data else None,
                metadata=issue.data
            )
            findings.append(finding)

        return findings

    async def _run_ruff_analysis(self, files: List[str]) -> List[QualityFinding]:
        """Run Ruff analysis on Python files"""
        findings = []

        try:
            cmd = ["ruff", "check", "--output-format=json", "--no-fix", *files]

            process = None
            try:
                process = subprocess.Popen(
                    cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
                )

                try:
                    stdout, stderr = process.communicate(
                        timeout=self.config.timeout_seconds
                    )

                    result = subprocess.CompletedProcess(
                        args=cmd,
                        returncode=process.returncode,
                        stdout=stdout,
                        stderr=stderr,
                    )
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()  # Clean up zombie process
                    raise

            finally:
                # Ensure process is cleaned up
                if process and process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()

            if result.stdout:
                try:
                    ruff_results = json.loads(result.stdout)
                    for item in ruff_results:
                        finding = QualityFinding(
                            tool="ruff",
                            rule_id=item.get("code", "RUFFF"),
                            message=item.get("message", ""),
                            severity=self._map_ruff_severity(
                                item.get("fix", {}).get("availability")
                            ),
                            file_path=item.get("filename", ""),
                            line_number=item.get("location", {}).get("row", 0),
                            column_number=item.get("location", {}).get("column", 0),
                            end_line_number=item.get("end_location", {}).get("row"),
                            end_column_number=item.get("end_location", {}).get(
                                "column"
                            ),
                            category=self._get_ruff_category(item.get("code", "")),
                            fix_suggestion=item.get("fix", {}).get("message")
                            if item.get("fix")
                            else None,
                            metadata={
                                "url": item.get("url"),
                                "fix": item.get("fix", {}),
                            },
                        )
                        findings.append(finding)
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse Ruff output: {e}")

        except subprocess.TimeoutExpired:
            logger.error("Ruff analysis timed out")
        except FileNotFoundError:
            logger.warning(
                "Ruff not found - skipping Python linting. Install with: pip install ruff"
            )
        except Exception as e:
            logger.error(f"Error running Ruff: {e}")

        return findings

    async def _run_eslint_analysis(self, files: List[str]) -> List[QualityFinding]:
        """Run ESLint analysis on JavaScript/TypeScript files"""
        findings = []
        process = None

        try:
            cmd = ["npx", "eslint", "--format=json", *files]

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            stdout, stderr = process.communicate(timeout=self.config.timeout_seconds)

            if stdout:
                try:
                    eslint_results = json.loads(stdout)
                    for file_result in eslint_results:
                        for message in file_result.get("messages", []):
                            finding = QualityFinding(
                                tool="eslint",
                                rule_id=message.get("ruleId", "ESLINT"),
                                message=message.get("message", ""),
                                severity=self._map_eslint_severity(
                                    message.get("severity", 1)
                                ),
                                file_path=file_result.get("filePath", ""),
                                line_number=message.get("line", 0),
                                column_number=message.get("column", 0),
                                end_line_number=message.get("endLine"),
                                end_column_number=message.get("endColumn"),
                                category=self._get_eslint_category(
                                    message.get("ruleId", "")
                                ),
                                fix_suggestion=message.get("suggestions")[-1].get(
                                    "desc"
                                )
                                if message.get("suggestions")
                                else None,
                                metadata={
                                    "ruleId": message.get("ruleId"),
                                    "suggestions": message.get("suggestions", []),
                                },
                            )
                            findings.append(finding)
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse ESLint output: {e}")

        except subprocess.TimeoutExpired:
            if process:
                process.kill()
                process.wait()
            logger.error("ESLint analysis timed out")
        except FileNotFoundError:
            logger.warning(
                "ESLint not found - skipping JS/TS linting. Install with: npm install -g eslint"
            )
        except Exception as e:
            logger.error(f"Error running ESLint: {e}")
        finally:
            if process and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()

        return findings

    async def _run_complexity_analysis(self, files: List[str]) -> List[QualityFinding]:
        """Run complexity analysis using Lizard"""
        findings = []
        process = None

        try:
            cmd = ["lizard", "--json", *files]

            process = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
            )
            stdout, stderr = process.communicate(timeout=self.config.timeout_seconds)

            if stdout:
                try:
                    lizard_data = json.loads(stdout)
                    for file_info in lizard_data:
                        for function in file_info.get("functions", []):
                            complexity = function.get("complexity", 0)
                            if complexity > self.config.complexity_threshold:
                                finding = QualityFinding(
                                    tool="lizard",
                                    rule_id="COMPLEXITY",
                                    message=f"Function '{function.get('name', '')}' has high cyclomatic complexity: {complexity}",
                                    severity=self._map_complexity_severity(complexity),
                                    file_path=file_info.get("name", ""),
                                    line_number=function.get("start_line", 0),
                                    end_line_number=function.get("end_line"),
                                    category="complexity",
                                    score=complexity,
                                    fix_suggestion=f"Consider refactoring this function to reduce complexity below {self.config.complexity_threshold}",
                                    metadata={
                                        "function_name": function.get("name"),
                                        "complexity": complexity,
                                        "token_count": function.get("token_count", 0),
                                    },
                                )
                                findings.append(finding)
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse Lizard output: {e}")

        except subprocess.TimeoutExpired:
            if process:
                process.kill()
                process.wait()
            logger.error("Complexity analysis timed out")
        except FileNotFoundError:
            logger.warning(
                "Lizard not found - skipping complexity analysis. Install with: brew install lizard"
            )
        except Exception as e:
            logger.error(f"Error running complexity analysis: {e}")
        finally:
            if process and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()

        return findings

    async def _run_duplication_detection(
        self, files: List[str]
    ) -> List[QualityFinding]:
        """Run duplication detection using similarity analysis"""
        findings = []

        # Simple implementation based on file content similarity
        try:
            file_contents = {}
            for file_path in files:
                try:
                    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                        file_contents[file_path] = content
                except Exception as e:
                    logger.warning(f"Could not read file {file_path}: {e}")
                    continue

            # Compare files for similarity
            file_list = list(file_contents.keys())
            for i in range(len(file_list)):
                for j in range(i + 1, len(file_list)):
                    file1, file2 = file_list[i], file_list[j]
                    content1, content2 = file_contents[file1], file_contents[file2]

                    similarity = self._calculate_similarity(content1, content2)
                    if similarity > self.config.duplication_threshold:
                        finding = QualityFinding(
                            tool="duplication",
                            rule_id="DUPLICATION",
                            message=f"High similarity ({similarity:.1%}) detected between files",
                            severity="warning",
                            file_path=file1,
                            line_number=1,
                            category="duplication",
                            score=similarity,
                            fix_suggestion="Consider extracting common code to shared utilities",
                            metadata={"similar_file": file2, "similarity": similarity},
                        )
                        findings.append(finding)

        except Exception as e:
            logger.error(f"Error in duplication detection: {e}")

        return findings

    def _calculate_similarity(self, content1: str, content2: str) -> float:
        """Calculate similarity between two text contents"""
        # Simple implementation based on common lines
        lines1 = set(content1.split("\n"))
        lines2 = set(content2.split("\n"))

        if not lines1 or not lines2:
            return 0.0

        common_lines = lines1.intersection(lines2)
        total_lines = lines1.union(lines2)

        return len(common_lines) / len(total_lines) if total_lines else 0.0

    def _map_ruff_severity(self, fix_availability: Optional[str]) -> str:
        """Map Ruff fix availability to severity"""
        if fix_availability is None:
            return "error"
        return "warning"

    def _map_eslint_severity(self, severity: int) -> str:
        """Map ESLint severity to standard severity"""
        return "error" if severity == 2 else "warning"

    def _map_complexity_severity(self, complexity: int) -> str:
        """Map complexity score to severity"""
        if complexity >= 20:
            return "error"
        elif complexity >= 15:
            return "warning"
        else:
            return "info"

    def _get_ruff_category(self, rule_code: str) -> str:
        """Get category for Ruff rule"""
        if rule_code.startswith("E") or rule_code.startswith("W"):
            return "style"
        elif rule_code.startswith("F"):
            return "error-prone"
        elif rule_code.startswith("B"):
            return "bugbear"
        else:
            return "other"

    def _get_eslint_category(self, rule_id: str) -> str:
        """Get category for ESLint rule"""
        if not rule_id:
            return "other"

        if rule_id.startswith("no-"):
            return "error-prone"
        elif rule_id.startswith("prefer-"):
            return "style"
        elif "import" in rule_id:
            return "imports"
        else:
            return "other"

    def _generate_quality_report(
        self,
        task_id: str,
        files: List[str],
        context: Dict[str, Any],
        results: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Generate quality analysis report"""
        return {
            "version": "1.0.0",
            "run_id": task_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "agent": "quality",
            "analysis": {
                "files_analyzed": len(files),
                "findings_count": len(self.findings),
                "tools_used": list(results.get("tools_used", set())),
                "analysis_times": results.get("analysis_time", {}),
                "file_counts": results.get("file_counts", {}),
            },
            "summary": {
                "total_findings": len(self.findings),
                "severity_breakdown": self._get_severity_breakdown(),
                "category_breakdown": self._get_category_breakdown(),
                "top_issues": self._get_top_issues(),
            },
            "findings": [
                {
                    "tool": f.tool,
                    "rule_id": f.rule_id,
                    "message": f.message,
                    "severity": f.severity,
                    "file_path": f.file_path,
                    "location": {
                        "line": f.line_number,
                        "column": f.column_number,
                        "end_line": f.end_line_number,
                        "end_column": f.end_column_number,
                    },
                    "category": f.category,
                    "score": f.score,
                    "fix_suggestion": f.fix_suggestion,
                    "metadata": f.metadata,
                }
                for f in self.findings
            ],
            "context": context,
        }

    def _get_severity_breakdown(self) -> Dict[str, int]:
        """Get breakdown of findings by severity"""
        breakdown = {"error": 0, "warning": 0, "info": 0}
        for finding in self.findings:
            if finding.severity in breakdown:
                breakdown[finding.severity] += 1
        return breakdown

    def _get_category_breakdown(self) -> Dict[str, int]:
        """Get breakdown of findings by category"""
        breakdown = {}
        for finding in self.findings:
            category = finding.category or "other"
            breakdown[category] = breakdown.get(category, 0) + 1
        return breakdown

    def _get_top_issues(self) -> List[Dict[str, Any]]:
        """Get top issues by severity and score"""
        # Sort by severity (error > warning > info) and then by score if available
        sorted_findings = sorted(
            self.findings,
            key=lambda f: (
                0 if f.severity == "error" else 1 if f.severity == "warning" else 2,
                -(f.score or 0),
            ),
        )

        return [
            {
                "tool": f.tool,
                "rule_id": f.rule_id,
                "message": f.message,
                "severity": f.severity,
                "file_path": f.file_path,
                "line": f.line_number,
                "score": f.score,
            }
            for f in sorted_findings[:10]  # Top 10 issues
        ]

    def _generate_summary(self, results: Dict[str, Any]) -> str:
        """Generate analysis summary"""
        findings_count = len(self.findings)
        tools_used = ", ".join(results.get("tools_used", []))

        if findings_count == 0:
            return f"No quality issues found. Analyzed with: {tools_used}"
        elif findings_count <= 5:
            return f"Found {findings_count} minor quality issues. Tools: {tools_used}"
        elif findings_count <= 15:
            return f"Found {findings_count} quality issues. Some attention recommended. Tools: {tools_used}"
        else:
            return f"Found {findings_count} quality issues. Significant refactoring may be needed. Tools: {tools_used}"

    def _save_results(self, report: Dict[str, Any], output_file: str):
        """Save results to output file"""
        try:
            # Ensure directory exists
            output_path = Path(output_file)
            output_path.parent.mkdir(parents=True, exist_ok=True)

            with open(output_file, "w") as f:
                json.dump(report, f, indent=2)

        except Exception as e:
            logger.error(f"Failed to save results to {output_file}: {e}")


async def main():
    """Main function"""
    socket_path = os.environ.get("SOCKET_PATH", "/tmp/pit-crew-orchestrator.sock")

    agent = QualityAgent(socket_path)

    try:
        await agent.start()
    except KeyboardInterrupt:
        logger.info("Quality agent stopped by user")
    except Exception as e:
        logger.error(f"Quality agent error: {e}")
    finally:
        await agent.stop()


if __name__ == "__main__":
    asyncio.run(main())
