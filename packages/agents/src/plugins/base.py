#!/usr/bin/env python3
"""
Quality Plugin Base Interface
Base class for all quality analysis plugins in the F1 Pit Stop Architecture
"""

import os
import sys
import json
import asyncio
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


@dataclass
class QaIssue:
    """Standardized issue structure across all plugins"""
    file: str
    rule_id: str
    message: str
    severity: str  # "critical", "high", "medium", "low"
    start_line: int
    start_column: Optional[int] = None
    end_line: Optional[int] = None
    end_column: Optional[int] = None
    fingerprint: Optional[str] = None
    tags: Optional[List[str]] = None
    data: Optional[Dict[str, Any]] = None

    def __post_init__(self):
        if self.tags is None:
            self.tags = []
        if self.data is None:
            self.data = {}


@dataclass
class PluginResult:
    """Result structure for plugin analysis"""
    plugin: str
    version: str
    issues: List[QaIssue]
    sarif_fragment: Optional[Dict[str, Any]] = None
    stats: Optional[Dict[str, Any]] = None
    execution_time: Optional[float] = None
    files_analyzed: int = 0
    status: str = "success"  # "success", "failed", "skipped"
    error_message: Optional[str] = None

    def __post_init__(self):
        if self.issues is None:
            self.issues = []
        if self.stats is None:
            self.stats = {}


@dataclass
class RunnerContext:
    """Context provided to plugins during analysis"""
    mode: str = "standard"
    timeout_seconds: int = 30
    working_directory: str = ""
    config: Dict[str, Any] = None

    def __post_init__(self):
        if self.config is None:
            self.config = {}


class QualityPlugin(ABC):
    """Base interface for all quality analysis plugins"""

    def __init__(self, name: str, version: str):
        self.name = name
        self.version = version
        self.logger = logging.getLogger(f"{__name__}.{name}")

    @abstractmethod
    def get_supported_extensions(self) -> List[str]:
        """Return list of supported file extensions"""
        pass

    @abstractmethod
    async def analyze(self, files: List[str], context: RunnerContext) -> PluginResult:
        """Analyze files and return results"""
        pass

    def get_tool_info(self) -> Dict[str, Any]:
        """Get tool information for SARIF driver"""
        return {
            "name": self.name,
            "version": self.version,
            "informationUri": "",
            "rules": []
        }

    def create_sarif_fragment(self, issues: List[QaIssue]) -> Dict[str, Any]:
        """Convert issues to SARIF fragment format"""
        results = []

        for issue in issues:
            result = {
                "ruleId": issue.rule_id,
                "message": {
                    "text": issue.message
                },
                "level": self._map_severity_to_sarif_level(issue.severity),
                "locations": [
                    {
                        "physicalLocation": {
                            "artifactLocation": {
                                "uri": issue.file
                            },
                            "region": {
                                "startLine": issue.start_line
                            }
                        }
                    }
                ]
            }

            # Add column information if available
            if issue.start_column is not None:
                result["locations"][0]["physicalLocation"]["region"]["startColumn"] = issue.start_column

            # Add end position if available
            if issue.end_line is not None:
                region = result["locations"][0]["physicalLocation"]["region"]
                region["endLine"] = issue.end_line
                if issue.end_column is not None:
                    region["endColumn"] = issue.end_column

            # Add properties if available
            properties = {}
            if issue.fingerprint:
                properties["fingerprint"] = issue.fingerprint
            if issue.tags:
                properties["tags"] = issue.tags
            if issue.data:
                properties.update(issue.data)

            if properties:
                result["properties"] = properties

            results.append(result)

        return {
            "$schema": "https://json.schemastore.org/sarif-2.1.0",
            "version": "2.1.0",
            "runs": [
                {
                    "tool": {
                        "driver": self.get_tool_info()
                    },
                    "results": results
                }
            ]
        }

    def _map_severity_to_sarif_level(self, severity: str) -> str:
        """Map severity to SARIF level"""
        mapping = {
            "critical": "error",
            "high": "error",
            "medium": "warning",
            "low": "note"
        }
        return mapping.get(severity, "warning")

    async def safe_analyze(self, files: List[str], context: RunnerContext) -> PluginResult:
        """Analyze with error handling and resilience"""
        start_time = asyncio.get_event_loop().time()

        try:
            # Filter files by extension
            supported_extensions = self.get_supported_extensions()
            filtered_files = [
                f for f in files
                if any(f.endswith(ext) for ext in supported_extensions)
            ]

            if not filtered_files:
                self.logger.info(f"No files found for {self.name} plugin")
                return PluginResult(
                    plugin=self.name,
                    version=self.version,
                    issues=[],
                    files_analyzed=0,
                    status="skipped",
                    execution_time=0
                )

            self.logger.info(f"Running {self.name} analysis on {len(filtered_files)} files")

            # Run actual analysis
            result = await self.analyze(filtered_files, context)
            result.execution_time = asyncio.get_event_loop().time() - start_time
            result.files_analyzed = len(filtered_files)

            # Generate SARIF fragment if issues exist
            if result.issues and not result.sarif_fragment:
                result.sarif_fragment = self.create_sarif_fragment(result.issues)

            self.logger.info(f"{self.name} analysis completed: {len(result.issues)} issues in {result.execution_time:.2f}s")
            return result

        except Exception as e:
            execution_time = asyncio.get_event_loop().time() - start_time
            error_msg = f"{self.name} plugin failed: {str(e)}"
            self.logger.error(error_msg)

            # Create error SARIF fragment
            error_sarif = {
                "$schema": "https://json.schemastore.org/sarif-2.1.0",
                "version": "2.1.0",
                "runs": [
                    {
                        "tool": {
                            "driver": self.get_tool_info()
                        },
                        "results": [
                            {
                                "ruleId": f"{self.name}-error",
                                "message": {
                                    "text": error_msg
                                },
                                "level": "error",
                                "locations": []
                            }
                        ]
                    }
                ]
            }

            return PluginResult(
                plugin=self.name,
                version=self.version,
                issues=[],
                sarif_fragment=error_sarif,
                files_analyzed=len(files),
                status="failed",
                error_message=error_msg,
                execution_time=execution_time
            )

    def _create_error_sarif(self, error: Exception) -> Dict[str, Any]:
        """Create SARIF fragment for plugin errors"""
        return {
            "$schema": "https://json.schemastore.org/sarif-2.1.0",
            "version": "2.1.0",
            "runs": [
                {
                    "tool": {
                        "driver": self.get_tool_info()
                    },
                    "results": [
                        {
                            "ruleId": f"{self.name}-plugin-error",
                            "message": {
                                "text": f"Plugin {self.name} encountered an error: {str(error)}"
                            },
                            "level": "error",
                            "locations": []
                        }
                    ]
                }
            ]
        }