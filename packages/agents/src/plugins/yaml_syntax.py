#!/usr/bin/env python3
"""
YAML Syntax Plugin
Validates YAML syntax and structure for quality analysis
"""

import os
import yaml
from pathlib import Path
from typing import List, Dict, Any, Optional
from .base import QualityPlugin, QaIssue, PluginResult, RunnerContext


class YAMLSyntaxPlugin(QualityPlugin):
    """Plugin for YAML syntax validation"""

    def __init__(self):
        super().__init__("yaml_syntax", "1.0.0")

    def get_supported_extensions(self) -> List[str]:
        """Return supported YAML file extensions"""
        return ['.yaml', '.yml']

    async def analyze(self, files: List[str], context: RunnerContext) -> PluginResult:
        """Analyze YAML files for syntax errors"""
        issues = []
        stats = {
            'syntax_errors': 0,
            'indentation_errors': 0,
            'structure_errors': 0
        }

        for file_path in files:
            try:
                # Check file size
                file_size = os.path.getsize(file_path)
                if file_size == 0:
                    issues.append(QaIssue(
                        file=file_path,
                        rule_id="yaml-empty-file",
                        message="YAML file is empty",
                        severity="low",
                        start_line=1,
                        start_column=1,
                        tags=["structure", "empty"]
                    ))
                    stats['structure_errors'] += 1
                    continue

                # Read and parse YAML
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                # Check for common indentation issues
                if '\t' in content:
                    # Find lines with tabs
                    lines = content.split('\n')
                    for line_num, line in enumerate(lines, 1):
                        if line.strip() and line.startswith('\t'):
                            issues.append(QaIssue(
                                file=file_path,
                                rule_id="yaml-tab-indentation",
                                message="YAML uses spaces for indentation, not tabs",
                                severity="high",
                                start_line=line_num,
                                start_column=1,
                                end_line=line_num,
                                end_column=len(line),
                                tags=["indentation", "style"],
                                data={"suggestion": "Replace tabs with 2 spaces"}
                            ))
                            stats['indentation_errors'] += 1

                # Parse YAML to check syntax
                try:
                    yaml.safe_load(content)
                except yaml.YAMLError as e:
                    # Parse YAML syntax errors
                    if hasattr(e, 'problem_mark') and e.problem_mark:
                        line_num = e.problem_mark.line + 1  # YAML uses 0-based indexing
                        column_num = e.problem_mark.column + 1

                        issues.append(QaIssue(
                            file=file_path,
                            rule_id="yaml-syntax-error",
                            message=f"YAML syntax error: {str(e)}",
                            severity="high",
                            start_line=line_num,
                            start_column=column_num,
                            tags=["syntax", "parsing"],
                            data={"error_type": type(e).__name__}
                        ))
                    else:
                        issues.append(QaIssue(
                            file=file_path,
                            rule_id="yaml-syntax-error",
                            message=f"YAML syntax error: {str(e)}",
                            severity="high",
                            start_line=1,
                            start_column=1,
                            tags=["syntax", "parsing"],
                            data={"error_type": type(e).__name__}
                        ))
                    stats['syntax_errors'] += 1

                # Additional structural checks
                self._check_yaml_structure(content, file_path, issues, stats)

            except Exception as e:
                # File reading error
                issues.append(QaIssue(
                    file=file_path,
                    rule_id="yaml-file-error",
                    message=f"Error reading YAML file: {str(e)}",
                    severity="critical",
                    start_line=1,
                    start_column=1,
                    tags=["file", "access"],
                    data={"error_type": type(e).__name__}
                ))
                stats['structure_errors'] += 1

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

    def _check_yaml_structure(self, content: str, file_path: str, issues: List[QaIssue], stats: Dict[str, int]):
        """Check YAML structure and common issues"""
        lines = content.split('\n')

        for line_num, line in enumerate(lines, 1):
            stripped = line.strip()

            # Skip empty lines and comments
            if not stripped or stripped.startswith('#'):
                continue

            # Check for missing space after colon (common YAML error)
            if ':' in stripped and not stripped.startswith('-'):
                colon_pos = stripped.find(':')
                # More robust check for missing space after colon
                if colon_pos < len(stripped) - 1:
                    char_after_colon = stripped[colon_pos + 1] if colon_pos + 1 < len(stripped) else ''
                    if char_after_colon not in [' ', '\n', '\t', ''] and not stripped.endswith('|') and not stripped.endswith('>'):
                        issues.append(QaIssue(
                            file=file_path,
                            rule_id="yaml-missing-space-after-colon",
                            message="Missing space after colon in YAML",
                            severity="medium",
                            start_line=line_num,
                            start_column=colon_pos + 2,
                            tags=["style", "formatting"],
                            data={"suggestion": "Add a space after the colon"}
                        ))
                        stats['structure_errors'] += 1

            # Check for too deep indentation (more than 20 spaces)
            leading_spaces = len(line) - len(line.lstrip(' '))
            if leading_spaces > 20:
                issues.append(QaIssue(
                    file=file_path,
                    rule_id="yaml-excessive-indentation",
                    message=f"YAML indentation too deep ({leading_spaces} spaces). Consider restructuring.",
                    severity="low",
                    start_line=line_num,
                    start_column=1,
                    end_line=line_num,
                    end_column=leading_spaces + 1,
                    tags=["style", "readability"],
                    data={"indentation_level": leading_spaces}
                ))
                stats['indentation_errors'] += 1

            # Check for trailing whitespace
            if line.endswith(' '):
                issues.append(QaIssue(
                    file=file_path,
                    rule_id="yaml-trailing-whitespace",
                    message="Trailing whitespace in YAML",
                    severity="low",
                    start_line=line_num,
                    start_column=len(line.rstrip()) + 1,
                    end_line=line_num,
                    end_column=len(line) + 1,
                    tags=["style", "formatting"]
                ))
                stats['structure_errors'] += 1

    def get_tool_info(self) -> Dict[str, Any]:
        """Get tool information for SARIF driver"""
        return {
            "name": "YAML Syntax Validator",
            "version": self.version,
            "informationUri": "https://yaml.org/",
            "rules": [
                {
                    "id": "yaml-syntax-error",
                    "name": "YAML Syntax Error",
                    "description": {
                        "text": "Invalid YAML syntax that prevents parsing"
                    },
                    "defaultConfiguration": {
                        "level": "error"
                    }
                },
                {
                    "id": "yaml-tab-indentation",
                    "name": "Tab Indentation",
                    "description": {
                        "text": "YAML requires spaces for indentation, not tabs"
                    },
                    "defaultConfiguration": {
                        "level": "error"
                    }
                },
                {
                    "id": "yaml-missing-space-after-colon",
                    "name": "Missing Space After Colon",
                    "description": {
                        "text": "YAML requires a space after colons in key-value pairs"
                    },
                    "defaultConfiguration": {
                        "level": "warning"
                    }
                },
                {
                    "id": "yaml-excessive-indentation",
                    "name": "Excessive Indentation",
                    "description": {
                        "text": "YAML indentation is too deep, consider restructuring"
                    },
                    "defaultConfiguration": {
                        "level": "note"
                    }
                },
                {
                    "id": "yaml-trailing-whitespace",
                    "name": "Trailing Whitespace",
                    "description": {
                        "text": "YAML lines should not end with whitespace"
                    },
                    "defaultConfiguration": {
                        "level": "note"
                    }
                }
            ]
        }