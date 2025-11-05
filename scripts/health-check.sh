#!/bin/bash

# Quick System Health Check
# Run this periodically to check system stability

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🏥 Quick System Health Check${NC}"
echo "=================================="
echo ""

# Check Node.js version
NODE_VERSION=$(node --version)
echo "Node.js: $NODE_VERSION"

# Check PM2 status
echo ""
echo -e "${BLUE}PM2 Processes:${NC}"
pm2 list | grep -E "pit-crew|online|errored" || echo "No PM2 processes found"

# Check for high memory usage
echo ""
echo -e "${BLUE}Memory Usage:${NC}"
ps aux | grep "node.*agente_de_codigo" | grep -v grep | awk '{print $11, $6/1024/1024 "GB"}' | while read line; do
    mem_gb=$(echo $line | awk '{print $2}')
    mem_num=$(echo $mem_gb | sed 's/GB//')

    if (( $(echo "$mem_num > 0.5" | bc -l) )); then
        echo -e "${RED}  HIGH: $line${NC}"
    else
        echo -e "${GREEN}  OK: $line${NC}"
    fi
done

# Check for crash loops
echo ""
echo -e "${BLUE}Crash Loop Check:${NC}"
HIGH_RESTARTS=$(pm2 list | awk 'NR>3 && $6 ~ /^[0-9]+$/ && $6 > 15 {print $2, $6}')
if [ -n "$HIGH_RESTARTS" ]; then
    echo -e "${RED}❌ High restarts detected:${NC}"
    echo "$HIGH_RESTARTS" | while read line; do
        echo "  $line"
    done
else
    echo -e "${GREEN}✅ No crash loops detected${NC}"
fi

# Check for large logs
echo ""
echo -e "${BLUE}Log Size Check:${NC}"
LARGE_LOGS=$(find . -name "*.log" -size +10M -type f 2>/dev/null | wc -l)
if [ "$LARGE_LOGS" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Found $LARGE_LOGS large log files${NC}"
    find . -name "*.log" -size +10M -type f 2>/dev/null | head -5 | while read log; do
        size=$(du -h "$log" | cut -f1)
        echo "  $log ($size)"
    done
else
    echo -e "${GREEN}✅ No large logs${NC}"
fi

# Summary
echo ""
echo "=================================="
TOTAL_RESTARTS=$(pm2 list | awk 'NR>3 && $6 ~ /^[0-9]+$/ {sum+=$6} END {print sum}')
TOTAL_MEM=$(ps aux | grep "node.*agente_de_codigo" | grep -v grep | awk '{sum+=$6} END {print sum/1024/1024 "MB"}')

echo -e "Total Restarts: $TOTAL_RESTARTS"
echo -e "Total Memory: $TOTAL_MEM"

if [ "$TOTAL_RESTARTS" -lt 50 ] && [ "$(echo $TOTAL_MEM | sed 's/MB//')" -lt 500 ]; then
    echo -e "${GREEN}✅ System is HEALTHY${NC}"
    exit 0
elif [ "$TOTAL_RESTARTS" -lt 100 ]; then
    echo -e "${YELLOW}⚠️  System is STABLE with warnings${NC}"
    exit 0
else
    echo -e "${RED}❌ System needs attention${NC}"
    exit 1
fi
