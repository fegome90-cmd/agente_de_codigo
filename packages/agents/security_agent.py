"""
Security Agent - SAST Analysis for Security Vulnerabilities
Implements Semgrep, Gitleaks, and OSV Scanner integrations with SARIF output.
"""

import os
import json
import subprocess
import tempfile
import shutil
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime
import logging

# SARIF imports
from sarif_om import (
    SarifLog,
    Run,
    Tool,
    ToolComponent,
    Result,
    Location,
    PhysicalLocation,
    ArtifactLocation,
    Region,
    Message,
)

logger = logging.getLogger(__name__)


class SecurityAgent:
    """
    Security Agent for comprehensive SAST analysis.
    Integrates Semgrep, Gitleaks, and OSV Scanner with SARIF 2.1.0 output.
    """

    def __init__(self, config: Dict[str, Any] = None):
        """Initialize Security Agent with configuration."""
        self.config = config or self._get_default_config()
        self.temp_dir = None
        self.results = {}

    def _get_default_config(self) -> Dict[str, Any]:
        """Get default configuration for Security Agent."""
        return {
            "semgrep": {
                "enabled": True,
                "config": "p/javascript",  # Use JavaScript/TypeScript rules
                "exclude": ["test/", "node_modules/", ".git/", "dist/"],
                "severity": ["ERROR", "WARNING", "INFO"],
                "timeout": 300,
                "max_memory": 512,  # MB
            },
            "gitleaks": {
                "enabled": True,
                "config": "default",
                "exit_code": 0,
                "timeout": 180,
                "max_memory": 256,
            },
            "osv_scanner": {
                "enabled": True,
                "recursive": True,
                "timeout": 600,
                "max_memory": 1024,
            },
            "output": {"format": "sarif", "version": "2.1.0", "include_source": False},
        }

    def scan_directory(self, scan_path: str) -> Dict[str, Any]:
        """
        Perform comprehensive security scan on directory.

        Args:
            scan_path: Path to directory to scan

        Returns:
            Dictionary containing scan results and SARIF report
        """
        scan_path = Path(scan_path).resolve()

        if not scan_path.exists():
            raise ValueError(f"Scan path does not exist: {scan_path}")

        logger.info(f"Starting security scan of {scan_path}")

        # Create temporary directory for outputs
        self.temp_dir = tempfile.mkdtemp(prefix="security_scan_")

        try:
            # Run individual SAST tools
            results = {
                "scan_info": {
                    "path": str(scan_path),
                    "timestamp": datetime.now().isoformat(),
                    "tools_used": [],
                },
                "findings": {},
                "sarif_report": None,
                "summary": {},
            }

            # Semgrep scan
            if self.config["semgrep"]["enabled"]:
                logger.info("Running Semgrep scan...")
                semgrep_results = self._run_semgrep(scan_path)
                results["findings"]["semgrep"] = semgrep_results
                results["scan_info"]["tools_used"].append("semgrep")

            # Gitleaks scan
            if self.config["gitleaks"]["enabled"]:
                logger.info("Running Gitleaks scan...")
                gitleaks_results = self._run_gitleaks(scan_path)
                results["findings"]["gitleaks"] = gitleaks_results
                results["scan_info"]["tools_used"].append("gitleaks")

            # OSV Scanner scan
            if self.config["osv_scanner"]["enabled"]:
                logger.info("Running OSV Scanner...")
                osv_results = self._run_osv_scanner(scan_path)
                results["findings"]["osv_scanner"] = osv_results
                results["scan_info"]["tools_used"].append("osv_scanner")

            # Generate SARIF report
            results["sarif_report"] = self._generate_sarif_report(results)

            # Generate summary
            results["summary"] = self._generate_summary(results)

            logger.info("Security scan completed successfully")
            return results

        except Exception as e:
            logger.error(f"Security scan failed: {e}")
            raise
        finally:
            # Clean up temporary directory
            if self.temp_dir and os.path.exists(self.temp_dir):
                shutil.rmtree(self.temp_dir)

    def _run_semgrep(self, scan_path: Path) -> Dict[str, Any]:
        """Run Semgrep static analysis."""
        if not self.temp_dir:
            return {"success": False, "error": "Temporary directory not initialized"}

        try:
            cmd = [
                "semgrep",
                "--config",
                self.config["semgrep"]["config"],
                "--json",
                "--output",
                f"{self.temp_dir}/semgrep_results.json",
                "--exclude",
                *self.config["semgrep"]["exclude"],
                "--severity",
                *self.config["semgrep"]["severity"],
                str(scan_path),
            ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.config["semgrep"]["timeout"],
            )

            if (
                result.returncode != 0 and result.returncode != 1
            ):  # 1 means findings found
                logger.error(f"Semgrep failed: {result.stderr}")
                return {"success": False, "error": result.stderr}

            # Load JSON results
            results_file = Path(self.temp_dir) / "semgrep_results.json"
            if results_file.exists():
                with open(results_file, "r") as f:
                    semgrep_data = json.load(f)

                return {
                    "success": True,
                    "findings": semgrep_data.get("results", []),
                    "stats": semgrep_data.get("stats", {}),
                    "total_findings": len(semgrep_data.get("results", [])),
                }
            else:
                return {"success": True, "findings": [], "total_findings": 0}

        except subprocess.TimeoutExpired:
            logger.error("Semgrep scan timed out")
            return {"success": False, "error": "Scan timed out"}
        except Exception as e:
            logger.error(f"Semgrep scan error: {e}")
            return {"success": False, "error": str(e)}

    def _run_gitleaks(self, scan_path: Path) -> Dict[str, Any]:
        """Run Gitleaks secrets detection."""
        if not self.temp_dir:
            return {"success": False, "error": "Temporary directory not initialized"}

        try:
            output_file = f"{self.temp_dir}/gitleaks_results.json"
            cmd = [
                "gitleaks",
                "detect",
                "--source",
                str(scan_path),
                "--report-path",
                output_file,
                "--report-format",
                "json",
                "--exit-code",
                str(self.config["gitleaks"]["exit_code"]),
            ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.config["gitleaks"]["timeout"],
            )

            # Gitleaks returns non-zero exit code when secrets are found
            if result.returncode > 1:
                logger.error(f"Gitleaks failed: {result.stderr}")
                return {"success": False, "error": result.stderr}

            # Load JSON results
            results_file = Path(output_file)
            if results_file.exists():
                with open(results_file, "r") as f:
                    gitleaks_data = json.load(f)

                # Gitleaks may return list or dict - handle both
                if isinstance(gitleaks_data, list):
                    findings = gitleaks_data
                    stats = {}
                else:
                    findings = gitleaks_data.get("findings", [])
                    stats = gitleaks_data.get("stats", {})

                return {
                    "success": True,
                    "findings": findings,
                    "stats": stats,
                    "total_findings": len(findings),
                }
            else:
                return {"success": True, "findings": [], "total_findings": 0}

        except subprocess.TimeoutExpired:
            logger.error("Gitleaks scan timed out")
            return {"success": False, "error": "Scan timed out"}
        except Exception as e:
            logger.error(f"Gitleaks scan error: {e}")
            return {"success": False, "error": str(e)}

    def _run_osv_scanner(self, scan_path: Path) -> Dict[str, Any]:
        """Run OSV Scanner for dependency vulnerabilities."""
        if not self.temp_dir:
            return {"success": False, "error": "Temporary directory not initialized"}

        try:
            output_file = f"{self.temp_dir}/osv_results.json"
            cmd = [
                "osv-scanner",
                "-format",
                "json",
                "--output",
                output_file,
                "--recursive" if self.config["osv_scanner"]["recursive"] else "",
                str(scan_path),
            ]

            # Remove empty strings from command
            cmd = [arg for arg in cmd if arg]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.config["osv_scanner"]["timeout"],
            )

            if result.returncode != 0:
                logger.error(f"OSV Scanner failed: {result.stderr}")
                return {"success": False, "error": result.stderr}

            # Load JSON results
            results_file = Path(output_file)
            if results_file.exists():
                with open(results_file, "r") as f:
                    osv_data = json.load(f)

                # Count total vulnerabilities
                total_vulns = 0
                for result in osv_data.get("results", []):
                    for package in result.get("packages", []):
                        total_vulns += len(package.get("vulnerabilities", []))

                return {
                    "success": True,
                    "findings": osv_data.get("results", []),
                    "stats": osv_data.get("stats", {}),
                    "total_findings": total_vulns,
                }
            else:
                return {"success": True, "findings": [], "total_findings": 0}

        except subprocess.TimeoutExpired:
            logger.error("OSV Scanner timed out")
            return {"success": False, "error": "Scan timed out"}
        except Exception as e:
            logger.error(f"OSV Scanner error: {e}")
            return {"success": False, "error": str(e)}

    def _generate_sarif_report(self, scan_results: Dict[str, Any]) -> Dict[str, Any]:
        """Generate SARIF 2.1.0 compliant report."""
        sarif_log = SarifLog(
            version=self.config["output"]["version"],
            schema_uri="https://json.schemastore.org/sarif-2.1.0",
            runs=[],
        )

        # Process each tool's findings
        for tool_name, tool_results in scan_results["findings"].items():
            if not tool_results.get("success", False):
                continue

            run = self._create_sarif_run(tool_name, tool_results)
            sarif_log.runs.append(run)

        # Convert to dictionary
        return {
            "$schema": "https://json.schemastore.org/sarif-2.1.0",
            "version": sarif_log.version,
            "runs": [self._run_to_dict(run) for run in sarif_log.runs],
        }

    def _create_sarif_run(self, tool_name: str, tool_results: Dict[str, Any]) -> Run:
        """Create SARIF Run for a specific tool."""
        tool_info = self._get_tool_info(tool_name)
        tool = Tool(driver=tool_info)

        run = Run(tool=tool, results=[])

        # Convert findings to SARIF results
        for finding in tool_results.get("findings", []):
            sarif_result = self._finding_to_sarif_result(tool_name, finding)
            if sarif_result:
                run.results.append(sarif_result)

        return run

    def _get_tool_info(self, tool_name: str) -> ToolComponent:
        """Get tool information for SARIF report."""
        tool_info_map = {
            "semgrep": {
                "name": "semgrep",
                "version": "1.142.0",
                "information_uri": "https://semgrep.dev",
            },
            "gitleaks": {
                "name": "gitleaks",
                "version": "8.28.0",
                "information_uri": "https://github.com/zricethezav/gitleaks",
            },
            "osv_scanner": {
                "name": "osv_scanner",
                "version": "2.2.4",
                "information_uri": "https://osv.dev",
            },
        }

        info = tool_info_map.get(tool_name, {"name": tool_name})
        return ToolComponent(**info)

    def _finding_to_sarif_result(
        self, tool_name: str, finding: Dict[str, Any]
    ) -> Optional[Result]:
        """Convert tool finding to SARIF Result."""
        try:
            if tool_name == "semgrep":
                return self._semgrep_to_sarif(finding)
            elif tool_name == "gitleaks":
                return self._gitleaks_to_sarif(finding)
            elif tool_name == "osv_scanner":
                return self._osv_to_sarif(finding)
        except Exception as e:
            logger.error(f"Error converting finding to SARIF: {e}")
            return None

    def _semgrep_to_sarif(self, finding: Dict[str, Any]) -> Result:
        """Convert Semgrep finding to SARIF Result."""
        # Safely handle metadata field which might be None
        metadata = finding.get("metadata") or {}
        level = self._severity_to_level(metadata.get("severity", ""))

        result = Result(
            rule_id=finding.get("check_id", ""),
            level=level,
            message=Message(text=finding.get("message", "")),
            locations=[
                self._create_location(finding.get("path", ""), finding.get("start", {}))
            ],
        )

        return result

    def _gitleaks_to_sarif(self, finding: Dict[str, Any]) -> Result:
        """Convert Gitleaks finding to SARIF Result."""
        # Secrets are always error level
        level = "error"

        result = Result(
            rule_id=finding.get("rule", ""),
            level=level,
            message=Message(text=finding.get("message", "")),
            locations=[
                self._create_location_from_file_line(
                    finding.get("file", ""), finding.get("start_line", 1)
                )
            ],
        )

        return result

    def _osv_to_sarif(self, finding: Dict[str, Any]) -> Result:
        """Convert OSV Scanner finding to SARIF Result."""
        # OSV findings are at package level, create a generic location
        level = self._severity_to_level(finding.get("severity", "MEDIUM"))

        result = Result(
            rule_id=finding.get("id", ""),
            level=level,
            message=Message(text=finding.get("summary", "")),
            locations=[self._create_generic_location()],
        )

        return result

    def _severity_to_level(self, severity: str) -> str:
        """Convert severity string to SARIF level."""
        severity = severity.upper()
        if severity in ["ERROR", "HIGH", "CRITICAL"]:
            return "error"
        elif severity in ["WARNING", "MEDIUM"]:
            return "warning"
        else:
            return "note"

    def _create_location(self, file_path: str, position: Dict[str, Any]) -> Location:
        """Create SARIF Location from file path and position."""
        return Location(
            physical_location=PhysicalLocation(
                artifact_location=ArtifactLocation(uri=file_path),
                region=Region(
                    start_line=position.get("line", 1),
                    start_column=position.get("col", 1),
                    end_line=position.get("line", 1),
                    end_column=position.get("col", 1),
                ),
            )
        )

    def _create_location_from_file_line(self, file_path: str, line: int) -> Location:
        """Create SARIF Location from file path and line number."""
        return Location(
            physical_location=PhysicalLocation(
                artifact_location=ArtifactLocation(uri=file_path),
                region=Region(
                    start_line=line,
                    start_column=1,
                    end_line=line,
                    end_column=1000,  # Assume end of line
                ),
            )
        )

    def _create_generic_location(self) -> Location:
        """Create a generic SARIF Location."""
        return Location(
            physical_location=PhysicalLocation(
                artifact_location=ArtifactLocation(uri="project_root"),
                region=Region(start_line=1, start_column=1),
            )
        )

    def _merge_sarif_reports(
        self, report1: Dict[str, Any], report2: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Merge two SARIF reports."""
        try:
            # Merge runs from both reports
            if "runs" in report1 and "runs" in report2:
                merged_runs = []
                seen_tool_names = set()

                # Add runs from first report
                for run in report1["runs"]:
                    merged_runs.append(run)
                    if "tool" in run and "driver" in run["tool"]:
                        seen_tool_names.add(run["tool"]["driver"]["name"])

                # Add unique runs from second report
                for run in report2["runs"]:
                    if "tool" in run and "driver" in run["tool"]:
                        tool_name = run["tool"]["driver"]["name"]
                        if tool_name not in seen_tool_names:
                            merged_runs.append(run)
                            seen_tool_names.add(tool_name)

                report1["runs"] = merged_runs

            return report1
        except Exception as e:
            logger.warning(f"Failed to merge SARIF reports: {e}")
            return report1

    def _run_to_dict(self, run: Run) -> Dict[str, Any]:
        """Convert SARIF Run to dictionary."""
        return {
            "tool": {
                "driver": {
                    "name": run.tool.driver.name,
                    "version": run.tool.driver.version,
                    "information_uri": run.tool.driver.information_uri,
                }
            },
            "results": [self._result_to_dict(result) for result in run.results],
        }

    def _result_to_dict(self, result: Result) -> Dict[str, Any]:
        """Convert SARIF Result to dictionary."""
        return {
            "rule_id": result.rule_id,
            "level": result.level if result.level else "note",
            "message": {"text": result.message.text if result.message else ""},
            "locations": [self._location_to_dict(loc) for loc in result.locations]
            if result.locations
            else [],
        }

    def _location_to_dict(self, location: Location) -> Dict[str, Any]:
        """Convert SARIF Location to dictionary."""
        if not location.physical_location:
            return {}

        region_dict = {}
        if location.physical_location.region:
            region_dict = {
                "start_line": location.physical_location.region.start_line,
                "start_column": location.physical_location.region.start_column,
            }
            if location.physical_location.region.end_line:
                region_dict["end_line"] = location.physical_location.region.end_line
            if location.physical_location.region.end_column:
                region_dict["end_column"] = location.physical_location.region.end_column

        return {
            "physical_location": {
                "artifact_location": {
                    "uri": location.physical_location.artifact_location.uri
                },
                **({"region": region_dict} if region_dict else {}),
            }
        }

    def _generate_summary(self, scan_results: Dict[str, Any]) -> Dict[str, Any]:
        """Generate summary of scan results."""
        total_findings = 0
        tool_summaries = {}

        for tool_name, tool_results in scan_results["findings"].items():
            if tool_results.get("success", False):
                findings_count = tool_results.get("total_findings", 0)
                total_findings += findings_count
                tool_summaries[tool_name] = findings_count
            else:
                tool_summaries[tool_name] = {
                    "error": tool_results.get("error", "Unknown error")
                }

        return {
            "total_findings": total_findings,
            "tools_summary": tool_summaries,
            "scan_duration": datetime.now().isoformat(),
            "tools_used": scan_results["scan_info"]["tools_used"],
        }


def main():
    """Main CLI entry point for Security Agent"""
    import argparse

    parser = argparse.ArgumentParser(
        description="Security Agent - SAST Analysis Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--scope", required=True, help="Directory or file to analyze")
    parser.add_argument(
        "--format",
        choices=["text", "json", "sarif"],
        default="text",
        help="Output format",
    )
    parser.add_argument("--output", help="Output file path")
    parser.add_argument("--root-scope", help="Root directory for dependency scanning")

    args = parser.parse_args()

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    try:
        # Initialize and run security agent
        agent = SecurityAgent()

        # If root-scope is provided, also scan dependencies there
        main_results = agent.scan_directory(args.scope)
        results = main_results

        if args.root_scope:
            root_results = agent.scan_directory(args.root_scope)
            # Merge OSV scanner results from both scopes
            if "findings" in root_results and "osv_scanner" in root_results["findings"]:
                if "findings" not in results:
                    results["findings"] = {}
                results["findings"]["osv_scanner"] = root_results["findings"][
                    "osv_scanner"
                ]
                # Update SARIF report if needed
                if "sarif_report" in results and "sarif_report" in root_results:
                    # Merge OSV findings from both scans
                    results["sarif_report"] = agent._merge_sarif_reports(
                        results["sarif_report"], root_results["sarif_report"]
                    )

        # Format output based on requested format
        if args.format == "json":
            output = json.dumps(results, indent=2)
        elif args.format == "sarif":
            output = json.dumps(results.get("sarif", {}), indent=2)
        else:  # text
            # Format summary as readable text
            summary = results.get("summary", {})
            if isinstance(summary, dict):
                # Convert dict to readable text format
                output = json.dumps(summary, indent=2)
            else:
                output = str(summary)

        # Write to output file or stdout
        if args.output:
            with open(args.output, "w") as f:
                if isinstance(output, dict):
                    f.write(json.dumps(output, indent=2))
                else:
                    f.write(output)
        else:
            print(output)

    except Exception as e:
        logging.error(f"Security analysis failed: {e}")
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    import sys

    main()
