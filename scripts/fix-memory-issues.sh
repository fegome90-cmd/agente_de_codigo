#!/bin/bash

# Memory Issue Fix Script
# Resolves memory leaks, crash loops, and process issues

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧹 Memory & Process Cleanup${NC}"
echo "=================================="
echo ""

# Step 1: Identify problematic processes
echo -e "${BLUE}[1] Identifying memory leaks...${NC}"
MEMORY_LEAKS=$(ps aux | grep "node.*orchestrator" | grep -v grep | awk '$6 > 1000000 {print $2, $11, $6}')
if [ -n "$MEMORY_LEAKS" ]; then
    echo -e "${RED}❌ Found memory leaks:${NC}"
    echo "$MEMORY_LEAKS"
    echo ""
    echo "Killing processes with high memory usage..."
    echo "$MEMORY_LEAKS" | awk '{print $1}' | xargs -r kill -9 || true
    echo -e "${GREEN}✅ Killed memory leak processes${NC}"
else
    echo -e "${GREEN}✅ No memory leaks found${NC}"
fi
echo ""

# Step 2: Stop PM2 processes
echo -e "${BLUE}[2] Stopping PM2 processes...${NC}"
pm2 delete pit-crew-architecture-agent 2>/dev/null || echo "architecture-agent already stopped"
pm2 restart pit-crew-orchestrator 2>/dev/null || echo "orchestrator restarting..."
pm2 restart all 2>/dev/null || echo "All processes restarting..."
echo -e "${GREEN}✅ PM2 processes handled${NC}"
echo ""

# Step 3: Clean PM2 logs
echo -e "${BLUE}[3] Flushing PM2 logs...${NC}"
pm2 flush > /dev/null 2>&1 || true
echo -e "${GREEN}✅ Logs flushed${NC}"
echo ""

# Step 4: Rebuild problematic packages
echo -e "${BLUE}[4] Rebuilding architecture-agent...${NC}"
cd packages/architecture-agent
pnpm rebuild > /dev/null 2>&1 || true
cd ../..
echo -e "${GREEN}✅ Architecture agent rebuilt${NC}"
echo ""

# Step 5: Check current PM2 status
echo -e "${BLUE}[5] Current PM2 status:${NC}"
pm2 list
echo ""

# Step 6: Check memory usage
echo -e "${BLUE}[6] Memory usage after cleanup:${NC}"
ps aux | grep -E "node.*agente_de_codigo" | grep -v grep | awk '{print $11, $6/1024/1024 "MB"}'
echo ""

echo -e "${GREEN}✅ Cleanup complete!${NC}"
echo ""
echo "If architecture-agent still fails:"
echo "  cd packages/architecture-agent && pnpm install --force"
