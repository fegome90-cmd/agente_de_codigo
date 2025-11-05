#!/bin/bash

# System Stability Audit Script
# Comprehensive check for native dependencies, memory leaks, and configuration issues

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)

echo -e "${BLUE}🔍 System Stability Audit${NC}"
echo "=================================="
echo "Node Version: $NODE_VERSION"
echo "NPM Version: $NPM_VERSION"
echo "Repository: $REPO_ROOT"
echo ""

ISSUES=0
WARNINGS=0

# 1. Check Node.js version consistency
echo -e "${BLUE}[1] Checking Node.js version consistency...${NC}"
EXPECTED_NODE="v20"
if [[ "$NODE_VERSION" == v20* ]]; then
    echo -e "${GREEN}✅ Node.js version is consistent (v20.x)${NC}"
elif [[ "$NODE_VERSION" == v22* ]]; then
    echo -e "${YELLOW}⚠️  Node.js v22 detected - may need native module rebuild${NC}"
    ((WARNINGS++))
else
    echo -e "${RED}❌ Unexpected Node.js version: $NODE_VERSION${NC}"
    ((ISSUES++))
fi
echo ""

# 2. Audit native dependencies
echo -e "${BLUE}[2] Auditing native dependencies...${NC}"
NATIVE_MODULES=(
    "tree-sitter"
    "sharp"
    "node-gyp"
    "bcrypt"
    "sqlite3"
    "canvas"
    "node-sass"
    "electron"
)

echo "Checking compiled native modules..."
for module in "${NATIVE_MODULES[@]}"; do
    if [ -d "$REPO_ROOT/node_modules/.pnpm/$module" ] || [ -d "$REPO_ROOT/node_modules/$module" ]; then
        echo -n "  - $module: "
        if [ -f "$REPO_ROOT/node_modules/.pnpm/$module/binding.gyp" ] || [ -f "$REPO_ROOT/node_modules/$module/binding.gyp" ]; then
            if [ -d "$REPO_ROOT/node_modules/.pnpm/$module/build" ] || [ -d "$REPO_ROOT/node_modules/$module/build" ]; then
                echo -e "${GREEN}✅ Compiled${NC}"
            else
                echo -e "${YELLOW}⚠️  Not compiled${NC}"
                ((WARNINGS++))
            fi
        else
            echo -e "${GREEN}✓ No build files${NC}"
        fi
    fi
done
echo ""

# 3. Check tree-sitter specifically (known problem)
echo -e "${BLUE}[3] Checking tree-sitter specifically...${NC}"
if [ -d "$REPO_ROOT/node_modules/.pnpm/tree-sitter" ]; then
    TS_PATH="$REPO_ROOT/node_modules/.pnpm/tree-sitter"
    if [ -f "$TS_PATH/build/Release/tree_sitter_runtime_binding.node" ]; then
        echo -e "${GREEN}✅ tree-sitter binary found${NC}"
        # Try to load it
        if node -e "require('$TS_PATH')" 2>/dev/null; then
            echo -e "${GREEN}✅ tree-sitter loads successfully${NC}"
        else
            echo -e "${RED}❌ tree-sitter fails to load (ERR_DLOPEN)${NC}"
            ((ISSUES++))
        fi
    else
        echo -e "${RED}❌ tree-sitter binary missing${NC}"
        ((ISSUES++))
    fi
else
    echo -e "${YELLOW}⚠️  tree-sitter not found${NC}"
fi
echo ""

# 4. Check PM2 configuration
echo -e "${BLUE}[4] Checking PM2 configuration...${NC}"
if [ -f "$REPO_ROOT/ecosystem.config.cjs" ]; then
    echo -e "${GREEN}✅ ecosystem.config.cjs exists${NC}"

    # Check for max_restarts
    if grep -q "max_restarts" "$REPO_ROOT/ecosystem.config.cjs"; then
        echo -e "${GREEN}✅ max_restarts configured${NC}"
    else
        echo -e "${YELLOW}⚠️  max_restarts not configured (risk of crash loops)${NC}"
        ((WARNINGS++))
    fi

    # Check for min_uptime
    if grep -q "min_uptime" "$REPO_ROOT/ecosystem.config.cjs"; then
        echo -e "${GREEN}✅ min_uptime configured${NC}"
    else
        echo -e "${YELLOW}⚠️  min_uptime not configured${NC}"
        ((WARNINGS++))
    fi
else
    echo -e "${RED}❌ ecosystem.config.cjs not found${NC}"
    ((ISSUES++))
fi
echo ""

# 5. Check PM2 processes for restart patterns
echo -e "${BLUE}[5] Checking PM2 restart patterns...${NC}"
RESTART_THRESHOLD=10
HIGH_RESTARTS=$(pm2 list | awk 'NR>3 && $6 ~ /^[0-9]+$/ && $6 > '$RESTART_THRESHOLD' {print $2, $6}')
if [ -n "$HIGH_RESTARTS" ]; then
    echo -e "${RED}❌ Processes with high restarts:${NC}"
    echo "$HIGH_RESTARTS" | while read line; do
        echo "  $line"
    done
    ((ISSUES++))
else
    echo -e "${GREEN}✅ No processes with excessive restarts${NC}"
fi
echo ""

# 6. Check for memory leaks
echo -e "${BLUE}[6] Checking for memory leaks...${NC}"
MEMORY_THRESHOLD=100  # MB
HIGH_MEMORY=$(ps aux | grep "node.*agente_de_codigo" | grep -v grep | awk '$6 > '$MEMORY_THRESHOLD' * 1024 {print $11, $6/1024/1024 "GB"}')
if [ -n "$HIGH_MEMORY" ]; then
    echo -e "${RED}❌ Processes with high memory usage:${NC}"
    echo "$HIGH_MEMORY" | while read line; do
        echo "  $line"
    done
    ((ISSUES++))
else
    echo -e "${GREEN}✅ No memory leaks detected${NC}"
fi
echo ""

# 7. Check log sizes
echo -e "${BLUE}[7] Checking log sizes...${NC}"
LOG_THRESHOLD=50  # MB
LARGE_LOGS=$(find $REPO_ROOT -name "*.log" -size +${LOG_THRESHOLD}M -type f 2>/dev/null)
if [ -n "$LARGE_LOGS" ]; then
    echo -e "${YELLOW}⚠️  Large log files found:${NC}"
    echo "$LARGE_LOGS" | while read log; do
        size=$(du -h "$log" | cut -f1)
        echo "  $log ($size)"
    done
    ((WARNINGS++))
else
    echo -e "${GREEN}✅ No oversized logs${NC}"
fi
echo ""

# 8. Check for common memory leak patterns in code
echo -e "${BLUE}[8] Scanning for memory leak patterns in code...${NC}"
echo "Checking for potential memory leaks..."

LEAK_PATTERNS=(
    "EventEmitter.*without.*remove"
    "setInterval.*without.*clear"
    "Stream.*without.*destroy"
    "socket.*without.*disconnect"
    "require.*in.*loop"
)

PATTERN_ISSUES=0
for pattern in "${LEAK_PATTERNS[@]}"; do
    matches=$(grep -r "$pattern" "$REPO_ROOT/packages" --include="*.ts" --include="*.js" 2>/dev/null | wc -l || echo "0")
    if [ "$matches" -gt 0 ]; then
        echo "  - Pattern '$pattern': $matches matches"
        ((PATTERN_ISSUES++))
    fi
done

if [ $PATTERN_ISSUES -eq 0 ]; then
    echo -e "${GREEN}✅ No obvious memory leak patterns found${NC}"
else
    echo -e "${YELLOW}⚠️  Found $PATTERN_ISSUES potential memory leak patterns${NC}"
    ((WARNINGS++))
fi
echo ""

# 9. Check TypeScript compilation
echo -e "${BLUE}[9] Checking TypeScript compilation...${NC}"
if cd "$REPO_ROOT" && pnpm build > /tmp/ts-build.log 2>&1; then
    echo -e "${GREEN}✅ TypeScript compilation successful${NC}"
else
    echo -e "${RED}❌ TypeScript compilation failed${NC}"
    tail -20 /tmp/ts-build.log
    ((ISSUES++))
fi
echo ""

# 10. Summary
echo "=================================="
echo -e "${BLUE}📊 Audit Summary${NC}"
echo "Issues: $ISSUES"
echo "Warnings: $WARNINGS"
echo ""

if [ $ISSUES -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ System is healthy!${NC}"
    exit 0
elif [ $ISSUES -eq 0 ]; then
    echo -e "${YELLOW}⚠️  System is mostly healthy with $WARNINGS warnings${NC}"
    exit 0
else
    echo -e "${RED}❌ Found $ISSUES critical issues and $WARNINGS warnings${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Fix critical issues marked with ❌"
    echo "  2. Review warnings marked with ⚠️"
    echo "  3. Run: ./scripts/fix-system-stability.sh"
    exit 1
fi
