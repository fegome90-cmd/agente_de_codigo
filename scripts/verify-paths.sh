#!/bin/bash

# Path Verification Script
# Checks for hard-coded absolute paths and validates dynamic path usage

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo -e "${BLUE}🔍 Path Verification Report${NC}"
echo "=================================="
echo "Repository Root: $REPO_ROOT"
echo "Current Working Directory: $(pwd)"
echo ""

ERRORS=0

# Check 1: No hard-coded paths with spaces
echo -e "${BLUE}[1] Checking for old paths with spaces...${NC}"
if grep -r "/Users/felipe/Developer/agente de codigo" "$REPO_ROOT" --include="*.ts" --include="*.js" --include="*.sh" --include="*.json" --exclude-dir=node_modules 2>/dev/null | grep -v "MIGRATION-RENAME" | grep -v "test-results" | head -5; then
    echo -e "${RED}❌ Found old paths with spaces in source files${NC}"
    ((ERRORS++))
else
    echo -e "${GREEN}✅ No old paths with spaces in source files${NC}"
fi
echo ""

# Check 2: Verify REPO_ROOT usage in scripts
echo -e "${BLUE}[2] Checking REPO_ROOT usage in scripts...${NC}"
if grep -l "REPO_ROOT" "$SCRIPT_DIR"/*.sh | head -5; then
    echo -e "${GREEN}✅ Scripts use REPO_ROOT dynamically${NC}"
else
    echo -e "${YELLOW}⚠️  No REPO_ROOT found in scripts${NC}"
fi
echo ""

# Check 3: Check test-complete-system.js uses dynamic paths
echo -e "${BLUE}[3] Checking test-complete-system.js...${NC}"
if grep -q "process.env.REPO_ROOT || __dirname" "$REPO_ROOT/test-complete-system.js"; then
    echo -e "${GREEN}✅ test-complete-system.js uses dynamic paths${NC}"
else
    echo -e "${RED}❌ test-complete-system.js missing dynamic paths${NC}"
    ((ERRORS++))
fi
echo ""

# Check 4: Verify global-registration.json uses relative paths
echo -e "${BLUE}[4] Checking global-registration.json...${NC}"
if grep -q '"/Users/felipe/Developer/agente' "$REPO_ROOT/.claude-plugin/configs/global-registration.json"; then
    echo -e "${RED}❌ global-registration.json has absolute paths${NC}"
    ((ERRORS++))
else
    echo -e "${GREEN}✅ global-registration.json uses relative paths${NC}"
fi
echo ""

# Check 5: Verify README uses dynamic paths
echo -e "${BLUE}[5] Checking README.md...${NC}"
if grep -q "/Users/felipe/Developer/agente_de_codigo" "$REPO_ROOT/README.md"; then
    echo -e "${RED}❌ README.md has absolute paths${NC}"
    ((ERRORS++))
else
    echo -e "${GREEN}✅ README.md uses dynamic paths${NC}"
fi
echo ""

# Check 6: Verify workspace builds
echo -e "${BLUE}[6] Testing workspace build...${NC}"
if cd "$REPO_ROOT" && pnpm build > /tmp/build-test.log 2>&1; then
    echo -e "${GREEN}✅ Workspace builds successfully${NC}"
else
    echo -e "${RED}❌ Workspace build failed${NC}"
    cat /tmp/build-test.log
    ((ERRORS++))
fi
echo ""

# Check 7: Verify CLI works
echo -e "${BLUE}[7] Testing CLI interface...${NC}"
if cd "$REPO_ROOT" && node packages/cli/dist/index.js --help > /dev/null 2>&1; then
    echo -e "${GREEN}✅ CLI interface works${NC}"
else
    echo -e "${RED}❌ CLI interface failed${NC}"
    ((ERRORS++))
fi
echo ""

# Check 8: Verify MemTech integration
echo -e "${BLUE}[8] Checking MemTech integration...${NC}"
if [ -d "$REPO_ROOT/../memtech-universal" ]; then
    echo -e "${GREEN}✅ MemTech Universal found${NC}"
else
    echo -e "${YELLOW}⚠️  MemTech Universal not found at ../memtech-universal${NC}"
fi
echo ""

# Summary
echo "=================================="
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All path checks passed!${NC}"
    echo "The repository is properly configured with dynamic paths."
    exit 0
else
    echo -e "${RED}❌ $ERRORS path issues found${NC}"
    echo "Please review and fix the issues above."
    exit 1
fi
