#!/bin/bash

# Production-Ready System Stability Check
# Validates all critical stability metrics

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== SYSTEM STABILITY VALIDATION ===${NC}\n"

PASS=0
WARN=0
FAIL=0

# Test 1: No memory leaks
echo -e "${BLUE}[TEST 1] Memory Leak Check${NC}"
HIGH_MEM=$(ps aux | grep "node.*agente_de_codigo" | grep -v grep | awk '{if ($6 > 500*1024) print $11, $6/1024/1024 "GB"}')
if [ -z "$HIGH_MEM" ]; then
    echo -e "${GREEN}✅ PASS: No memory leaks detected${NC}"
    ((PASS++))
else
    echo -e "${RED}❌ FAIL: Memory leak found:${NC}"
    echo "$HIGH_MEM"
    ((FAIL++))
fi
echo ""

# Test 2: No crash loops
echo -e "${BLUE}[TEST 2] Crash Loop Check${NC}"
CRASH_LOOPS=$(pm2 list | awk 'NR>3 && $6 ~ /^[0-9]+$/ && $6 > 20 {print $2, $6}' || true)
if [ -z "$CRASH_LOOPS" ]; then
    echo -e "${GREEN}✅ PASS: No crash loops (>20 restarts)${NC}"
    ((PASS++))
else
    echo -e "${YELLOW}⚠️  WARN: Processes with high restarts:${NC}"
    echo "$CRASH_LOOPS"
    ((WARN++))
fi
echo ""

# Test 3: No oversized logs
echo -e "${BLUE}[TEST 3] Log Size Check${NC}"
LARGE_LOGS=$(find . -name "*.log" -size +10M -type f 2>/dev/null | wc -l)
if [ "$LARGE_LOGS" -eq 0 ]; then
    echo -e "${GREEN}✅ PASS: No oversized logs (>10MB)${NC}"
    ((PASS++))
else
    echo -e "${YELLOW}⚠️  WARN: $LARGE_LOGS large log files found${NC}"
    ((WARN++))
fi
echo ""

# Test 4: PM2 configuration
echo -e "${BLUE}[TEST 4] PM2 Configuration${NC}"
if grep -q "max_restarts: 10" ecosystem.config.cjs 2>/dev/null; then
    echo -e "${GREEN}✅ PASS: Crash loop protection configured${NC}"
    ((PASS++))
else
    echo -e "${RED}❌ FAIL: PM2 lacks crash loop protection${NC}"
    ((FAIL++))
fi
echo ""

# Test 5: TypeScript compilation
echo -e "${BLUE}[TEST 5] TypeScript Compilation${NC}"
if pnpm build > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PASS: TypeScript compilation successful${NC}"
    ((PASS++))
else
    echo -e "${RED}❌ FAIL: TypeScript compilation failed${NC}"
    ((FAIL++))
fi
echo ""

# Test 6: Agents online
echo -e "${BLUE}[TEST 6] Agent Status${NC}"
ONLINE_AGENTS=$(pm2 list | grep "pit-crew.*online" | wc -l)
TOTAL_AGENTS=$(pm2 list | grep "pit-crew" | wc -l)
if [ "$ONLINE_AGENTS" -ge 4 ]; then
    echo -e "${GREEN}✅ PASS: $ONLINE_AGENTS/$TOTAL_AGENTS agents online${NC}"
    ((PASS++))
else
    echo -e "${YELLOW}⚠️  WARN: Only $ONLINE_AGENTS/$TOTAL_AGENTS agents online${NC}"
    ((WARN++))
fi
echo ""

# Final Summary
echo "=================================="
echo -e "${BLUE}TEST RESULTS${NC}"
echo -e "Passed:  $PASS"
echo -e "Warnings: $WARN"
echo -e "Failed: $FAIL"
echo ""

if [ "$FAIL" -eq 0 ]; then
    if [ "$WARN" -eq 0 ]; then
        echo -e "${GREEN}🎉 SYSTEM IS PRODUCTION READY${NC}"
        exit 0
    else
        echo -e "${YELLOW}⚠️  SYSTEM IS STABLE WITH WARNINGS${NC}"
        exit 0
    fi
else
    echo -e "${RED}❌ SYSTEM HAS CRITICAL ISSUES${NC}"
    exit 1
fi
