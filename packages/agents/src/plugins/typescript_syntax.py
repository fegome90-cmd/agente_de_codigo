#!/usr/bin/env python3
"""
TypeScript Syntax Plugin
Validates TypeScript/JavaScript syntax using tsc compiler
"""

import os
import subprocess
import json
import re
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from .base import QualityPlugin, QaIssue, PluginResult, RunnerContext


class TypeScriptSyntaxPlugin(QualityPlugin):
    """Plugin for TypeScript/JavaScript syntax validation using tsc"""

    def __init__(self):
        super().__init__("typescript_syntax", "1.0.0")

    def get_supported_extensions(self) -> List[str]:
        """Return supported TypeScript/JavaScript file extensions"""
        return ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

    async def analyze(self, files: List[str], context: RunnerContext) -> PluginResult:
        """Analyze TypeScript/JavaScript files for syntax errors"""
        issues = []
        stats = {
            'syntax_errors': 0,
            'type_errors': 0,
            'semantic_errors': 0,
            'files_processed': 0
        }

        try:
            # Group files by type for better error reporting
            ts_files = [f for f in files if f.endswith(('.ts', '.tsx'))]
            js_files = [f for f in files if f.endswith(('.js', '.jsx', '.mjs', '.cjs'))]

            # Analyze TypeScript files with tsc
            if ts_files:
                ts_issues = await self._analyze_typescript_files(ts_files, context)
                issues.extend(ts_issues)
                stats['syntax_errors'] += len([i for i in ts_issues if i.rule_id == 'ts-syntax-error'])
                stats['type_errors'] += len([i for i in ts_issues if i.rule_id.startswith('ts-type')])

            # Analyze JavaScript files with Node.js syntax checking
            if js_files:
                js_issues = await self._analyze_javascript_files(js_files, context)
                issues.extend(js_issues)
                stats['syntax_errors'] += len([i for i in js_issues if i.rule_id == 'js-syntax-error'])

            stats['files_processed'] = len(files)

        except Exception as e:
            # Plugin-level error
            issues.append(QaIssue(
                file="plugin-error",
                rule_id="typescript-plugin-error",
                message=f"TypeScript syntax plugin error: {str(e)}",
                severity="critical",
                start_line=1,
                start_column=1,
                tags=["plugin", "error"],
                data={"error_type": type(e).__name__}
            ))

        # Create SARIF fragment
        sarif_fragment = self.create_sarif_fragment(issues) if issues else None

        return PluginResult(
            plugin=self.name,
            version=self.version,
            issues=issues,
            sarif_fragment=sarif_fragment,
            stats=stats,
            files_analyzed=len(files)
        )

    async def _analyze_typescript_files(self, files: List[str], context: RunnerContext) -> List[QaIssue]:
        """Analyze TypeScript files using tsc compiler"""
        issues = []

        try:
            # Prepare tsc command
            cmd = [
                'npx', 'tsc',
                '--noEmit',
                '--skipLibCheck',
                '--strict',  # Enable strict mode for better error detection
                '--noImplicitAny',
                '--noImplicitReturns',
                '--noImplicitThis'
            ]

            # Add files to command
            cmd.extend(files)

            # Run tsc
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=context.working_directory or os.getcwd()
            )

            try:
                stdout, stderr = process.communicate(timeout=context.timeout_seconds)

                # Parse tsc output
                if stderr:
                    issues.extend(self._parse_tsc_output(stderr, files))

                if stdout and "error" in stdout.lower():
                    issues.extend(self._parse_tsc_output(stdout, files))

            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
                issues.append(QaIssue(
                    file="timeout-error",
                    rule_id="ts-syntax-timeout",
                    message=f"TypeScript syntax analysis timed out after {context.timeout_seconds}s",
                    severity="high",
                    start_line=1,
                    start_column=1,
                    tags=["timeout", "performance"]
                ))

        except FileNotFoundError:
            # tsc not available
            issues.append(QaIssue(
                file="tool-error",
                rule_id="ts-missing-tool",
                message="TypeScript compiler (tsc) not found. Install with: npm install -g typescript",
                severity="critical",
                start_line=1,
                start_column=1,
                tags=["missing-tool", "setup"],
                data={"installation_command": "npm install -g typescript"}
            ))

        except Exception as e:
            issues.append(QaIssue(
                file="process-error",
                rule_id="ts-process-error",
                message=f"Error running TypeScript compiler: {str(e)}",
                severity="high",
                start_line=1,
                start_column=1,
                tags=["process", "error"]
            ))

        return issues

    async def _analyze_javascript_files(self, files: List[str], context: RunnerContext) -> List[QaIssue]:
        """Analyze JavaScript files using Node.js syntax checking"""
        issues = []

        for file_path in files:
            try:
                # Use Node.js to check syntax
                cmd = ['node', '--check', file_path]

                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    cwd=context.working_directory or os.getcwd()
                )

                try:
                    stdout, stderr = process.communicate(timeout=10)

                    if process.returncode != 0:
                        # Parse Node.js syntax error
                        error_match = re.search(r'([^:]+):(\d+)', stderr)
                        if error_match:
                            error_file = error_match.group(1)
                            line_num = int(error_match.group(2))
                        else:
                            error_file = file_path
                            line_num = 1

                        issues.append(QaIssue(
                            file=error_file,
                            rule_id="js-syntax-error",
                            message=f"JavaScript syntax error: {stderr.strip()}",
                            severity="high",
                            start_line=line_num,
                            start_column=1,
                            tags=["syntax", "javascript"]
                        ))

                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                    issues.append(QaIssue(
                        file=file_path,
                        rule_id="js-syntax-timeout",
                        message="JavaScript syntax analysis timed out",
                        severity="medium",
                        start_line=1,
                        start_column=1,
                        tags=["timeout"]
                    ))

            except FileNotFoundError:
                issues.append(QaIssue(
                    file="tool-error",
                    rule_id="js-missing-tool",
                    message="Node.js not found. Install Node.js to check JavaScript syntax",
                    severity="critical",
                    start_line=1,
                    start_column=1,
                    tags=["missing-tool", "setup"]
                ))

            except Exception as e:
                issues.append(QaIssue(
                    file=file_path,
                    rule_id="js-process-error",
                    message=f"Error checking JavaScript syntax: {str(e)}",
                    severity="medium",
                    start_line=1,
                    start_column=1,
                    tags=["process", "error"]
                ))

        return issues

    def _parse_tsc_output(self, output: str, files: List[str]) -> List[QaIssue]:
        """Parse TypeScript compiler output for errors"""
        issues = []

        # TypeScript error format: file(line,column): error TS####: message
        error_pattern = re.compile(r'^([^(]+)\((\d+),(\d+)\):\s*(error|warning)\s+TS(\d+):\s*(.+)$', re.MULTILINE)

        for match in error_pattern.finditer(output):
            file_path = match.group(1).strip()
            line_num = int(match.group(2))
            col_num = int(match.group(3))
            severity = match.group(4)
            error_code = match.group(5)
            message = match.group(6).strip()

            # Normalize file path
            file_path = os.path.normpath(file_path)

            # Only include errors for files we're analyzing
            if any(os.path.samefile(file_path, f) for f in files if os.path.exists(file_path)):
                # Determine severity category
                if error_code in ['2304', '2307', '2552']:  # Cannot find module/name
                    severity_level = "high"
                    rule_id = f"ts-type-{error_code}"
                elif error_code.startswith('23'):  # Type-related errors
                    severity_level = "high"
                    rule_id = f"ts-type-{error_code}"
                elif error_code in ['1002', '1003', '1005', '1108']:  # Syntax errors
                    severity_level = "critical"
                    rule_id = f"ts-syntax-{error_code}"
                else:
                    severity_level = "medium"
                    rule_id = f"ts-general-{error_code}"

                issues.append(QaIssue(
                    file=file_path,
                    rule_id=rule_id,
                    message=message,
                    severity=severity_level,
                    start_line=line_num,
                    start_column=col_num,
                    tags=["typescript", error_code.lower()],
                    data={
                        "error_code": error_code,
                        "compiler_output": match.group(0)
                    }
                ))

        return issues

    def get_tool_info(self) -> Dict[str, Any]:
        """Get tool information for SARIF driver"""
        return {
            "name": "TypeScript Syntax Validator",
            "version": self.version,
            "informationUri": "https://www.typescriptlang.org/",
            "rules": [
                {
                    "id": "ts-syntax-error",
                    "name": "TypeScript Syntax Error",
                    "description": {
                        "text": "TypeScript syntax error that prevents compilation"
                    },
                    "defaultConfiguration": {
                        "level": "error"
                    }
                },
                {
                    "id": "ts-type-error",
                    "name": "TypeScript Type Error",
                    "description": {
                        "text": "TypeScript type checking error"
                    },
                    "defaultConfiguration": {
                        "level": "error"
                    }
                },
                {
                    "id": "js-syntax-error",
                    "name": "JavaScript Syntax Error",
                    "description": {
                        "text": "JavaScript syntax error"
                    },
                    "defaultConfiguration": {
                        "level": "error"
                    }
                }
            ]
        }