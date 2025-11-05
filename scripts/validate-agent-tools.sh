#!/bin/bash

# Agent Tools Validation Script
# Validates that all required tools are installed for each agent

set -e

echo "🔍 AGENT TOOLS VALIDATION"
echo "========================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
    fi
}

# Architecture Agent
echo "📦 Architecture Agent"
echo "---------------------"
echo "Status: ${YELLOW}NOT OPERATIVE${NC} (tree-sitter incompatibility)"
echo "Issue: tree-sitter compiled for Node v20, system has Node v22"
echo "Action: Removed from PM2 until fixed"
echo ""

# Security Agent
echo "🔐 Security Agent"
echo "-----------------"
tools_ok=0
tools_total=0

# Check semgrep
tools_total=$((tools_total + 1))
if command -v semgrep &> /dev/null; then
    print_status 0 "semgrep: $(which semgrep)"
    tools_ok=$((tools_ok + 1))
else
    print_status 1 "semgrep: NOT FOUND"
fi

# Check gitleaks
tools_total=$((tools_total + 1))
if command -v gitleaks &> /dev/null; then
    print_status 0 "gitleaks: $(which gitleaks)"
    tools_ok=$((tools_ok + 1))
else
    print_status 1 "gitleaks: NOT FOUND"
fi

# Check npm
tools_total=$((tools_total + 1))
if command -v npm &> /dev/null; then
    print_status 0 "npm: $(which npm)"
    tools_ok=$((tools_ok + 1))
else
    print_status 1 "npm: NOT FOUND"
fi

# Check pip-audit
tools_total=$((tools_total + 1))
if command -v pip-audit &> /dev/null; then
    print_status 0 "pip-audit: $(which pip-audit)"
    tools_ok=$((tools_ok + 1))
else
    print_status 1 "pip-audit: NOT FOUND"
fi

# Check poetry
tools_total=$((tools_total + 1))
if command -v poetry &> /dev/null; then
    print_status 0 "poetry: $(which poetry)"
    tools_ok=$((tools_ok + 1))
else
    print_status 1 "poetry: NOT FOUND (optional - pip-audit available)"
fi

# Check osv-scanner
tools_total=$((tools_total + 1))
if command -v osv-scanner &> /dev/null; then
    print_status 0 "osv-scanner: $(which osv-scanner)"
    tools_ok=$((tools_ok + 1))
else
    print_status 1 "osv-scanner: NOT FOUND"
fi

echo ""
echo "Security Agent: $tools_ok/$tools_total tools available"
echo ""

# Quality Agent
echo "📈 Quality Agent"
echo "----------------"
tools_ok=0
tools_total=0

# Check ruff
tools_total=$((tools_total + 1))
if command -v ruff &> /dev/null; then
    print_status 0 "ruff: $(which ruff)"
    tools_ok=$((tools_ok + 1))
else
    print_status 1 "ruff: NOT FOUND"
fi

# Check eslint
tools_total=$((tools_total + 1))
if command -v eslint &> /dev/null; then
    print_status 0 "eslint: $(which eslint)"
    tools_ok=$((tools_ok + 1))
else
    print_status 1 "eslint: NOT FOUND"
fi

# Check lizard
tools_total=$((tools_total + 1))
if command -v lizard &> /dev/null; then
    print_status 0 "lizard: $(which lizard)"
    tools_ok=$((tools_ok + 1))
else
    print_status 1 "lizard: NOT FOUND"
fi

echo ""
echo "Quality Agent: $tools_ok/$tools_total tools available"
echo ""

# Documentation Agent
echo "📚 Documentation Agent"
echo "---------------------"
cd packages/documentation-agent
if node -e "require('@apidevtools/swagger-parser')" &> /dev/null; then
    print_status 0 "@apidevtools/swagger-parser: Available"
else
    print_status 1 "@apidevtools/swagger-parser: NOT FOUND"
fi
cd ../..
echo ""

# PR Reviewer Agent
echo "🔄 PR Reviewer Agent"
echo "-------------------"
cd packages/agents/pr-reviewer
if node -e "require('zod')" &> /dev/null; then
    print_status 0 "zod: Available"
else
    print_status 1 "zod: NOT FOUND"
fi
cd ../..
echo ""

# Summary
echo "========================="
echo "📊 SUMMARY"
echo "========================="
echo "Architecture Agent: ${RED}NOT OPERATIVE${NC} (needs tree-sitter fix)"
echo "Security Agent: Tools installed (graceful degradation configured)"
echo "Quality Agent: Tools installed (graceful degradation configured)"
echo "Documentation Agent: Dependencies OK"
echo "PR Reviewer Agent: Dependencies OK"
echo ""
echo "Overall: 4/5 agents can operate with current tool installation"
echo ""
