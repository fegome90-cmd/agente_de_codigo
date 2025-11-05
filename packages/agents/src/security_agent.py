#!/usr/bin/env python3
"""
Security Agent - Independent Process
F1 Pit Stop Architecture - Security analysis with SAST scanning, vulnerability detection, and secrets detection
"""

import os
import sys
import json
import subprocess
import time
import asyncio
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from datetime import datetime
import logging

# Add the IPC client to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "ipc"))

# flake8: noqa: E402
from ipc.socket_client import SocketClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [SECURITY_AGENT]: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("/tmp/pit-crew-security-agent.log"),
    ],
)

logger = logging.getLogger(__name__)


@dataclass
class SecurityConfig:
    """Security agent configuration"""

    timeout_seconds: int = 60
    max_file_size_mb: int = 10
    scan_secrets: bool = True
    scan_dependencies: bool = True
    semgrep_rules: List[str] = None
    gitleaks_enabled: bool = True
    osv_scanner_enabled: bool = True
    output_format: str = "sarif"

    def __post_init__(self):
        if self.semgrep_rules is None:
            self.semgrep_rules = ["p/security-audit", "p/owasp-top-ten", "p/cwe-top-25"]


@dataclass
class SecurityFinding:
    """Security finding structure"""

    rule_id: str
    message: str
    severity: str  # "error", "warning", "info"
    file_path: str
    line_number: int
    column_number: Optional[int] = None
    cwe_id: Optional[str] = None
    owasp_category: Optional[str] = None
    confidence: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class SecurityAgent(SocketClient):
    """Security agent implementation"""

    def __init__(self, socket_path: str):
        super().__init__(socket_path, "security")
        self.config = SecurityConfig()
        self.findings: List[SecurityFinding] = []
        # Error resilience
        self.consecutive_errors = 0
        self.max_consecutive_errors = 10
        self.last_successful_run = time.time()
        self.error_threshold_cooldown = 300  # 5 minutes

    def _get_capabilities(self) -> Dict[str, Any]:
        """Get security agent capabilities"""
        return {
            "supports_heartbeat": True,
            "supports_tasks": True,
            "supports_events": True,
            "tools": [
                "semgrep",
                "gitleaks",
                "osv-scanner",
                "npm-audit",
                "pip-audit",
                "dependency-check",
            ],
            "languages": [
                "python",
                "javascript",
                "typescript",
                "java",
                "go",
                "rust",
                "c",
                "cpp",
            ],
            "scan_types": ["sast", "secrets", "dependencies", "configuration"],
        }

    async def handle_task(self, task_id: str, task_data: Dict[str, Any]):
        """Handle security analysis task"""
        logger.info(f"Starting security analysis task: {task_id}")

        # Check error resilience threshold
        time_since_last_success = time.time() - self.last_successful_run

        # If too many consecutive errors and still in cooldown period, reject task
        if (
            self.consecutive_errors >= self.max_consecutive_errors
            and time_since_last_success < self.error_threshold_cooldown
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

            # Update configuration with task-specific settings
            self._update_config(config)

            # Run security analysis
            results = await self._run_security_analysis(scope, context)

            # Generate SARIF report
            sarif_report = self._generate_sarif_report(task_id, scope, context, results)

            # Save results to output file
            if output_file:
                self._save_results(sarif_report, output_file)
                logger.info(f"Results saved to: {output_file}")

            # Send response
            duration_ms = int((time.time() - start_time) * 1000)
            self.send_task_response(
                task_id,
                "done",
                {
                    "findings_count": len(self.findings),
                    "severity_breakdown": self._get_severity_breakdown(),
                    "tools_used": list(results.get("tools_used", set())),
                    "output_file": output_file,
                    "analysis_summary": self._generate_summary(results),
                },
                duration_ms,
            )

            logger.info(f"Security analysis completed: {len(self.findings)} findings")

            # Reset error counter on success
            self.consecutive_errors = 0
            self.last_successful_run = time.time()

        except Exception as e:
            logger.error(f"Security analysis failed: {e}")

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
                {"error": str(e), "error_type": type(e).__name__},
                duration_ms,
            )

    def _update_config(self, task_config: Dict[str, Any]):
        """Update configuration with task-specific settings"""
        if "timeout_seconds" in task_config:
            self.config.timeout_seconds = task_config["timeout_seconds"]
        if "scan_secrets" in task_config:
            self.config.scan_secrets = task_config["scan_secrets"]
        if "scan_dependencies" in task_config:
            self.config.scan_dependencies = task_config["scan_dependencies"]
        if "semgrep_rules" in task_config:
            self.config.semgrep_rules = task_config["semgrep_rules"]
        if "gitleaks_enabled" in task_config:
            self.config.gitleaks_enabled = task_config["gitleaks_enabled"]
        if "osv_scanner_enabled" in task_config:
            self.config.osv_scanner_enabled = task_config["osv_scanner_enabled"]

    async def _run_security_analysis(
        self, scope: List[str], context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Run comprehensive security analysis"""
        results = {
            "findings": [],
            "tools_used": set(),
            "scan_time": 0,
            "files_scanned": 0,
        }

        scan_start = time.time()

        # Filter scope to relevant files
        security_files = self._filter_security_files(scope)

        if not security_files:
            logger.warning("No security-relevant files found in scope")
            return results

        results["files_scanned"] = len(security_files)
        logger.info(f"Scanning {len(security_files)} files for security issues")

        # Run Semgrep for SAST analysis
        semgrep_results = await self._run_semgrep(security_files)
        if semgrep_results:
            results["findings"].extend(semgrep_results)
            results["tools_used"].add("semgrep")

        # Run Gitleaks for secrets detection
        if self.config.scan_secrets and self.config.gitleaks_enabled:
            gitleaks_results = await self._run_gitleaks(security_files)
            if gitleaks_results:
                results["findings"].extend(gitleaks_results)
                results["tools_used"].add("gitleaks")

        # Run dependency scanning
        if self.config.scan_dependencies:
            dep_results = await self._run_dependency_analysis(scope)
            if dep_results:
                results["findings"].extend(dep_results)
                results["tools_used"].update(dep_results.get("tools_used", set()))

        results["scan_time"] = time.time() - scan_start
        results["tools_used"] = list(results["tools_used"])

        # Store findings
        self.findings = results["findings"]

        logger.info(f"Security analysis completed in {results['scan_time']:.2f}s")
        logger.info(f"Found {len(results['findings'])} security issues")

        return results

    def _filter_security_files(self, scope: List[str]) -> List[str]:
        """Filter files to only security-relevant ones"""
        security_files = []
        repo_root = os.getcwd()

        for file_pattern in scope:
            # Convert relative patterns to absolute paths
            if not os.path.isabs(file_pattern):
                file_pattern = os.path.join(repo_root, file_pattern)

            # Check if file/directory exists and matches security patterns
            if os.path.exists(file_pattern):
                if os.path.isfile(file_pattern):
                    security_files.append(file_pattern)
                elif os.path.isdir(file_pattern):
                    # Recursively find files
                    for root, dirs, files in os.walk(file_pattern):
                        for file in files:
                            file_path = os.path.join(root, file)
                            if self._is_security_relevant_file(file_path):
                                security_files.append(file_path)

        return list(set(security_files))  # Remove duplicates

    def _is_security_relevant_file(self, file_path: str) -> bool:
        """Check if file is security-relevant"""
        file_path = file_path.lower()

        security_extensions = {
            ".py",
            ".js",
            ".ts",
            ".java",
            ".go",
            ".rs",
            ".c",
            ".cpp",
            ".h",
            ".hpp",
            ".php",
            ".rb",
            ".swift",
            ".kt",
        }

        security_files = {
            "package.json",
            "package-lock.json",
            "yarn.lock",
            "requirements.txt",
            "poetry.lock",
            "pipfile.lock",
            "dockerfile",
            "docker-compose.yml",
            "docker-compose.yaml",
            ".env",
            ".env.example",
            "config",
            "secrets",
            "webpack.config.js",
            "tsconfig.json",
            "babel.config.js",
        }

        # Check file extension
        for ext in security_extensions:
            if file_path.endswith(ext):
                return True

        # Check file name
        file_name = os.path.basename(file_path)
        if file_name in security_files:
            return True

        return False

    async def _run_semgrep(self, files: List[str]) -> List[SecurityFinding]:
        """Run Semgrep SAST analysis"""
        if not self.config.semgrep_rules:
            return []

        logger.info("Running Semgrep SAST analysis...")

        try:
            # Prepare semgrep command
            cmd = [
                "semgrep",
                "--config=auto",
                "--json",
                "--quiet",
                "--severity=ERROR,WARNING,INFO",
            ]

            # Add specific rules
            for rule in self.config.semgrep_rules:
                cmd.extend(["--config", rule])

            cmd.extend(files)

            # Run semgrep
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
                        cmd=cmd,
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

            if result.returncode == 0:
                return self._parse_semgrep_output(result.stdout)
            else:
                logger.warning(f"Semgrep failed: {result.stderr}")
                return []

        except subprocess.TimeoutExpired:
            logger.error("Semgrep analysis timed out")
            return []
        except FileNotFoundError:
            logger.warning(
                "Semgrep not found - skipping Semgrep analysis. Install with: brew install semgrep"
            )
            return []
        except Exception as e:
            logger.error(f"Semgrep analysis failed: {e}")
            return []

    async def _run_gitleaks(self, files: List[str]) -> List[SecurityFinding]:
        """Run Gitleaks secrets detection"""
        logger.info("Running Gitleaks secrets detection...")

        try:
            # Prepare gitleaks command
            cmd = [
                "gitleaks",
                "detect",
                "--source=.",
                "--json",
                "--report-path=/tmp/gitleaks-report.json",
                "--no-banner",
            ]

            # Run gitleaks
            process = None
            try:
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )

                try:
                    stdout, stderr = process.communicate(
                        timeout=self.config.timeout_seconds
                    )

                    result = subprocess.CompletedProcess(
                        cmd=cmd,
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

            if result.returncode == 0:
                return self._parse_gitleaks_output("/tmp/gitleaks-report.json")
            else:
                logger.warning(f"Gitleaks failed: {result.stderr}")
                return []

        except subprocess.TimeoutExpired:
            logger.error("Gitleaks analysis timed out")
            return []
        except FileNotFoundError:
            logger.warning(
                "Gitleaks not found - skipping secrets detection. Install with: brew install gitleaks"
            )
            return []
        except Exception as e:
            logger.error(f"Gitleaks analysis failed: {e}")
            return []

    async def _run_dependency_analysis(self, scope: List[str]) -> Dict[str, Any]:
        """Run dependency vulnerability analysis"""
        logger.info("Running dependency vulnerability analysis...")

        results = {"findings": [], "tools_used": set()}

        # Check for lockfiles
        repo_root = os.getcwd()
        lockfiles = []

        for pattern in scope:
            if not os.path.isabs(pattern):
                pattern = os.path.join(repo_root, pattern)

            if os.path.isfile(pattern):
                lockfiles.append(pattern)

        # Run npm audit if package-lock.json found
        if "package-lock.json" in [os.path.basename(f) for f in lockfiles]:
            npm_results = await self._run_npm_audit()
            if npm_results:
                results["findings"].extend(npm_results)
                results["tools_used"].add("npm-audit")

        # Run pip-audit if requirements.txt found
        if any(
            "requirements.txt" in f or "poetry.lock" in f or "pipfile.lock" in f
            for f in lockfiles
        ):
            pip_results = await self._run_pip_audit(lockfiles)
            if pip_results:
                results["findings"].extend(pip_results)
                results["tools_used"].add("pip-audit")

        # Run OSV Scanner if available
        if self.config.osv_scanner_enabled:
            osv_results = await self._run_osv_scanner(lockfiles)
            if osv_results:
                results["findings"].extend(osv_results)
                results["tools_used"].add("osv-scanner")

        return results

    async def _run_npm_audit(self) -> List[SecurityFinding]:
        """Run npm audit for JavaScript dependencies"""
        process = None
        try:
            process = subprocess.Popen(
                ["npm", "audit", "--json"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            stdout, stderr = process.communicate(timeout=30)

            if process.returncode == 0:
                return self._parse_npm_audit_output(stdout)
            else:
                logger.warning(f"npm audit failed: {stderr}")
                return []

        except subprocess.TimeoutExpired:
            if process:
                process.kill()
                process.wait()
            logger.error("npm audit timed out")
            return []
        except FileNotFoundError:
            logger.warning(
                "npm not found - skipping npm audit. Ensure Node.js and npm are installed"
            )
            return []
        except Exception as e:
            logger.error(f"npm audit failed: {e}")
            return []
        finally:
            if process and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()

    async def _run_pip_audit(self, lockfiles: List[str]) -> List[SecurityFinding]:
        """Run pip-audit for Python dependencies"""
        process = None
        try:
            for lockfile in lockfiles:
                if "requirements.txt" in lockfile:
                    process = subprocess.Popen(
                        ["pip-audit", "-r", lockfile, "--format", "json"],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                    )
                    stdout, stderr = process.communicate(timeout=30)
                    if process.returncode == 0:
                        return self._parse_pip_audit_output(stdout)
                elif "poetry.lock" in lockfile:
                    process = subprocess.Popen(
                        ["poetry", "audit"],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                    )
                    stdout, stderr = process.communicate(timeout=30)
                    if process.returncode == 0:
                        return self._parse_poetry_audit_output(stdout)

            return []

        except subprocess.TimeoutExpired:
            if process:
                process.kill()
                process.wait()
            logger.error("pip audit timed out")
            return []
        except FileNotFoundError as e:
            if "pip-audit" in str(e) or "poetry" in str(e):
                logger.warning(
                    f"{str(e).split(':')[0]} not found - skipping dependency audit. Install with: pip install pip-audit && brew install poetry"
                )
            else:
                logger.warning(
                    "Python dependency tools not found - skipping dependency audit"
                )
            return []
        except Exception as e:
            logger.error(f"pip audit failed: {e}")
            return []
        finally:
            if process and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()

    async def _run_osv_scanner(self, lockfiles: List[str]) -> List[SecurityFinding]:
        """Run OSV Scanner for vulnerability detection"""
        process = None
        try:
            cmd = [
                "osv-scanner",
                "--format",
                "json",
                "--output",
                "/tmp/osv-results.json",
            ] + lockfiles
            process = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
            )
            stdout, stderr = process.communicate(timeout=30)

            if process.returncode == 0:
                return self._parse_osv_scanner_output("/tmp/osv-results.json")
            else:
                logger.warning(f"OSV scanner failed: {stderr}")
                return []

        except subprocess.TimeoutExpired:
            if process:
                process.kill()
                process.wait()
            logger.error("OSV scanner timed out")
            return []
        except FileNotFoundError:
            logger.warning(
                "osv-scanner not found - skipping OSV vulnerability scan. Install with: brew install osv-scanner"
            )
            return []
        except Exception as e:
            logger.error(f"OSV scanner failed: {e}")
            return []
        finally:
            if process and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()

    def _parse_semgrep_output(self, output: str) -> List[SecurityFinding]:
        """Parse Semgrep JSON output"""
        findings = []
        try:
            data = json.loads(output)
            for run in data.get("results", []):
                for result in run.get("results", []):
                    finding = SecurityFinding(
                        rule_id=result.get("rule_id", "unknown"),
                        message=result.get("message", ""),
                        severity=self._convert_semgrep_severity(
                            result.get("metadata", {}).get("severity", "INFO")
                        ),
                        file_path=result.get("path", ""),
                        line_number=result.get("start", {}).get("line", 0),
                        column_number=result.get("start", {}).get("col", 0),
                        cwe_id=result.get("metadata", {}).get("cwe", {}).get("id"),
                        confidence=result.get("metadata", {}).get(
                            "confidence", "unknown"
                        ),
                        metadata=result.get("metadata", {}),
                    )
                    findings.append(finding)
        except Exception as e:
            logger.error(f"Failed to parse Semgrep output: {e}")

        return findings

    def _parse_gitleaks_output(self, report_path: str) -> List[SecurityFinding]:
        """Parse Gitleaks JSON report"""
        findings = []
        try:
            with open(report_path, "r") as f:
                data = json.load(f)
                for finding in data.get("findings", []):
                    security_finding = SecurityFinding(
                        rule_id=finding.get("rule", "gitleaks-secret"),
                        message=finding.get("description", ""),
                        severity="error",  # Secrets are always critical
                        file_path=finding.get("file", ""),
                        line_number=finding.get("line", 0),
                        column_number=finding.get("start_column", 0),
                        metadata={
                            "fingerprint": finding.get("fingerprint"),
                            "tags": finding.get("tags", []),
                        },
                    )
                    findings.append(security_finding)
        except Exception as e:
            logger.error(f"Failed to parse Gitleaks report: {e}")

        return findings

    def _parse_npm_audit_output(self, output: str) -> List[SecurityFinding]:
        """Parse npm audit JSON output"""
        findings = []
        try:
            data = json.loads(output)
            for advisory in data.get("vulnerabilities", []):
                for affected_package in advisory.get("affectedPackages", []):
                    finding = SecurityFinding(
                        rule_id=f"npm-{advisory.get('id', 'unknown')}",
                        message=advisory.get("title", ""),
                        severity=self._convert_npm_severity(
                            advisory.get("severity", "moderate")
                        ),
                        file_path="package.json",
                        line_number=0,
                        metadata={
                            "advisory_id": advisory.get("id"),
                            "package": affected_package,
                            "version": advisory.get("version"),
                            "url": advisory.get("url"),
                        },
                    )
                    findings.append(finding)
        except Exception as e:
            logger.error(f"Failed to parse npm audit output: {e}")

        return findings

    def _parse_pip_audit_output(self, output: str) -> List[SecurityFinding]:
        """Parse pip-audit output"""
        findings = []
        try:
            data = json.loads(output)
            for vuln in data.get("vulnerabilities", []):
                finding = SecurityFinding(
                    rule_id=f"pip-{vuln.get('id', 'unknown')}",
                    message=vuln.get("advisory", ""),
                    severity=self._convert_pip_severity(vuln.get("severity", "medium")),
                    file_path="requirements.txt",
                    line_number=0,
                    metadata={
                        "package": vuln.get("package"),
                        "version": vuln.get("version"),
                        "cve": vuln.get("cve"),
                    },
                )
                findings.append(finding)
        except Exception as e:
            logger.error(f"Failed to parse pip audit output: {e}")

        return findings

    def _parse_poetry_audit_output(self, output: str) -> List[SecurityFinding]:
        """Parse poetry audit output"""
        findings = []
        try:
            # Poetry audit output varies, so this is a simplified parser
            if "vulnerabilities found" in output:
                lines = output.split("\n")
                for line in lines:
                    if "CVE-" in line or "vulnerability" in line:
                        finding = SecurityFinding(
                            rule_id="poetry-audit",
                            message=line.strip(),
                            severity="warning",
                            file_path="pyproject.toml",
                            line_number=0,
                        )
                        findings.append(finding)
        except Exception as e:
            logger.error(f"Failed to parse poetry audit output: {e}")

        return findings

    def _parse_osv_scanner_output(self, report_path: str) -> List[SecurityFinding]:
        """Parse OSV Scanner JSON output"""
        findings = []
        try:
            with open(report_path, "r") as f:
                data = json.load(f)
                for vuln in data.get("results", []):
                    for package in vuln.get("packages", []):
                        finding = SecurityFinding(
                            rule_id=f"osv-{vuln.get('id', 'unknown')}",
                            message=vuln.get("description", ""),
                            severity=self._convert_osv_severity(
                                vuln.get("severity", "moderate")
                            ),
                            file_path="package-lock.json",
                            line_number=0,
                            metadata={
                                "package": package.get("package", ""),
                                "ecosystem": package.get("ecosystem", ""),
                                "vulnerability_id": vuln.get("id"),
                                "aliases": vuln.get("aliases", []),
                            },
                        )
                        findings.append(finding)
        except Exception as e:
            logger.error(f"Failed to parse OSV scanner output: {e}")

        return findings

    def _convert_semgrep_severity(self, semgrep_severity: str) -> str:
        """Convert Semgrep severity to standard format"""
        severity_map = {"ERROR": "error", "WARNING": "warning", "INFO": "info"}
        return severity_map.get(semgrep_severity.upper(), "info")

    def _convert_npm_severity(self, npm_severity: str) -> str:
        """Convert npm severity to standard format"""
        severity_map = {
            "critical": "error",
            "high": "error",
            "moderate": "warning",
            "low": "info",
            "info": "info",
        }
        return severity_map.get(npm_severity, "warning")

    def _convert_pip_severity(self, pip_severity: str) -> str:
        """Convert pip severity to standard format"""
        severity_map = {
            "critical": "error",
            "high": "error",
            "medium": "warning",
            "low": "info",
        }
        return severity_map.get(pip_severity, "warning")

    def _convert_osv_severity(self, osv_severity: str) -> str:
        """Convert OSV severity to standard format"""
        severity_map = {
            "CRITICAL": "error",
            "HIGH": "error",
            "MEDIUM": "warning",
            "LOW": "info",
        }
        return severity_map.get(osv_severity.upper(), "warning")

    def _generate_sarif_report(
        self,
        task_id: str,
        scope: List[str],
        context: Dict[str, Any],
        results: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Generate SARIF report"""
        sarif_report = {
            "$schema": "https://json.schemastore.org/sarif-2.1.0",
            "version": "2.1.0",
            "runs": [
                {
                    "tool": {
                        "driver": {
                            "name": "Pit Crew Security Agent",
                            "version": "1.0.0",
                            "informationUri": "https://github.com/felipe/pit-crew-multi-agent",
                        }
                    },
                    "results": [
                        {
                            "ruleId": finding.rule_id
                            if hasattr(finding, "rule_id")
                            else "basic-security-check",
                            "level": finding.severity.lower()
                            if hasattr(finding, "severity")
                            else "warning",
                            "message": {
                                "text": finding.message
                                if hasattr(finding, "message")
                                else str(finding)
                            },
                            "locations": [
                                {
                                    "physicalLocation": {
                                        "artifactLocation": {
                                            "uri": os.path.relpath(
                                                finding.file_path,
                                                context.get("repo_root", "."),
                                            )
                                            if hasattr(finding, "file_path")
                                            else "unknown"
                                        },
                                        "region": {
                                            "startLine": finding.line_number
                                            if hasattr(finding, "line_number")
                                            else 1,
                                            "startColumn": finding.column_number
                                            if hasattr(finding, "column_number")
                                            else 0,
                                        },
                                    }
                                }
                            ],
                            "properties": {
                                "cwe": finding.cwe_id
                                if hasattr(finding, "cwe_id")
                                else None,
                                "owasp": finding.owasp_category
                                if hasattr(finding, "owasp_category")
                                else None,
                                "confidence": finding.confidence
                                if hasattr(finding, "confidence")
                                else None,
                            },
                        }
                        for finding in self.findings
                    ],
                }
            ],
        }

        return sarif_report

    def _save_results(self, results: Dict[str, Any], output_file: str):
        """Save results to output file"""
        try:
            os.makedirs(os.path.dirname(output_file), exist_ok=True)
            with open(output_file, "w") as f:
                json.dump(results, f, indent=2)
            logger.info(f"Results saved to {output_file}")
        except Exception as e:
            logger.error(f"Failed to save results: {e}")

    def _get_severity_breakdown(self) -> Dict[str, int]:
        """Get breakdown of findings by severity"""
        breakdown = {"error": 0, "warning": 0, "info": 0}

        for finding in self.findings:
            if finding.severity in breakdown:
                breakdown[finding.severity] += 1

        return breakdown

    def _generate_summary(self, results: Dict[str, Any]) -> str:
        """Generate analysis summary"""
        severity_breakdown = self._get_severity_breakdown()
        tools_used = ", ".join(results.get("tools_used", []))

        summary = (
            f"Security analysis completed using {tools_used}.\n"
            f"Found {len(self.findings)} issues: "
            f"{severity_breakdown['error']} critical, "
            f"{severity_breakdown['warning']} warnings, "
            f"{severity_breakdown['info']} info.\n"
            f"Analysis took {results['scan_time']:.2f} seconds "
            f"scanning {results['files_scanned']} files."
        )

        return summary


async def run_standalone_analysis(obs_path: str):
    """Run standalone security analysis without orchestrator"""
    logger.info("Starting standalone security analysis")

    # Create a temporary agent instance for standalone mode
    temp_agent = SecurityAgent("/tmp/dummy.sock")

    # Analyze current repository
    repo_root = os.getcwd()
    scope = []

    # Find relevant files
    for root, dirs, files in os.walk(repo_root):
        # Skip common non-source directories
        dirs[:] = [
            d
            for d in dirs
            if d
            not in [
                ".git",
                "node_modules",
                "__pycache__",
                ".pytest_cache",
                "dist",
                "build",
            ]
        ]

        for file in files:
            file_path = os.path.join(root, file)
            rel_path = os.path.relpath(file_path, repo_root)

            # Include source code files
            if file.endswith(
                (
                    ".py",
                    ".js",
                    ".ts",
                    ".jsx",
                    ".tsx",
                    ".java",
                    ".go",
                    ".rs",
                    ".c",
                    ".cpp",
                    ".h",
                )
            ):
                scope.append(rel_path)

    if not scope:
        logger.warning("No source files found for analysis")
        return

    logger.info(f"Found {len(scope)} source files to analyze")

    # Create output directory
    reports_dir = os.path.join(obs_path, "reports")
    os.makedirs(reports_dir, exist_ok=True)

    # Run analysis
    context = {"repo_root": repo_root, "commit_hash": "standalone", "branch": "main"}

    try:
        results = await temp_agent._run_security_analysis(scope, context)

        # Generate SARIF report
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        sarif_path = os.path.join(reports_dir, f"security-standalone-{timestamp}.sarif")

        sarif_report = temp_agent._generate_sarif_report(
            f"standalone-{timestamp}", scope, context, results
        )

        with open(sarif_path, "w") as f:
            json.dump(sarif_report, f, indent=2)

        logger.info("✅ Standalone analysis completed")
        logger.info(f"📄 Report saved: {sarif_path}")
        logger.info(f"🔍 Findings: {len(results['findings'])}")
        logger.info(f"🛠️  Tools used: {', '.join(results['tools_used'])}")
        logger.info(f"⏱️  Duration: {results['scan_time']:.2f}s")

    except Exception as e:
        logger.error(f"Standalone analysis failed: {e}")


# Main execution
if __name__ == "__main__":
    # Check if we should run in standalone mode
    standalone = os.environ.get("STANDALONE_MODE", "false").lower() == "true"
    obs_path = os.environ.get("OBS_PATH", os.path.abspath("./obs"))

    if standalone:
        logger.info("🔧 Running in standalone mode")
        asyncio.run(run_standalone_analysis(obs_path))
    else:
        logger.info("🔗 Connecting to orchestrator")
        # Get socket path from environment or use default
        # Prefer SOCKET_PATH, fallback to PIT_CREW_SOCKET_PATH for compatibility
        socket_path = os.getenv("SOCKET_PATH") or os.getenv(
            "PIT_CREW_SOCKET_PATH", "/tmp/pit-crew-orchestrator.sock"
        )

        # Create and start security agent
        agent = SecurityAgent(socket_path)

        try:
            agent.start()
        except KeyboardInterrupt:
            logger.info("Security agent interrupted by user")
            agent.stop()
        except Exception as e:
            logger.error(f"Security agent failed: {e}")
            agent.stop()
