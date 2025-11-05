#!/bin/bash

# Simplified TEST GATES for Phase 1

echo "🧪 Phase 1 TEST GATES - Infrastructure Foundation"
echo "=================================================="

# Test results
PASSED=0
FAILED=0

# Test 1: Docker Compose
echo ""
echo "[TEST] 1. Docker Compose configuration..."
if docker-compose config > /dev/null 2>&1; then
    echo "✅ PASS: Docker Compose configuration is valid"
    ((PASSED++))
else
    echo "❌ FAIL: Docker Compose configuration is invalid"
    ((FAILED++))
fi

# Test 2: PM2 Configuration
echo ""
echo "[TEST] 2. PM2 ecosystem configuration..."
if node -c ecosystem.config.cjs 2>/dev/null; then
    echo "✅ PASS: PM2 ecosystem configuration is valid"
    ((PASSED++))
else
    echo "❌ FAIL: PM2 ecosystem configuration has syntax errors"
    ((FAILED++))
fi

# Test 3: CLI Wrapper
echo ""
echo "[TEST] 3. CLI wrapper functionality..."
if [[ -f "scripts/run-agents.sh" && -x "scripts/run-agents.sh" ]]; then
    echo "✅ PASS: CLI wrapper script exists and is executable"
    ((PASSED++))
else
    echo "❌ FAIL: CLI wrapper script missing or not executable"
    ((FAILED++))
fi

# Test 4: MemTech Connection
echo ""
echo "[TEST] 4. MemTech connection..."
if curl -s http://localhost:8080/health > /dev/null; then
    echo "✅ PASS: MemTech service is accessible and healthy"
    ((PASSED++))
else
    echo "❌ FAIL: MemTech service is not accessible or unhealthy"
    ((FAILED++))
fi

# Test 5: Skills-fabrik CLI
echo ""
echo "[TEST] 5. Skills-fabrik CLI integration..."
if node "/Users/felipe/Developer/skills-fabrik/packages/skills-cli/dist/index.js" --version > /dev/null 2>&1; then
    echo "✅ PASS: Skills-fabrik CLI is functional"
    ((PASSED++))
else
    echo "❌ FAIL: Skills-fabrik CLI is not functional"
    ((FAILED++))
fi

# Results
echo ""
echo "📊 TEST RESULTS"
echo "=================="
echo "Tests Passed: $PASSED"
echo "Tests Failed: $FAILED"
echo ""

if [[ $FAILED -eq 0 ]]; then
    echo "🎉 ALL TESTS PASSED! Phase 1 is complete."
    echo "✅ Ready to proceed to Phase 2: Python SAST Agents"
    exit 0
else
    echo "❌ $FAILED test(s) failed. Fix issues before proceeding."
    exit 1
fi