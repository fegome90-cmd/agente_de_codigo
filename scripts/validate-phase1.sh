#!/bin/bash

# TEST GATES for Phase 1: Infrastructure Foundation
# Must pass all tests to proceed to Phase 2

set -eo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_TESTS=5

# Helper functions
log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

# Test 1: Docker Compose Services
test_docker_compose() {
    log_test "1. Testing Docker Compose configuration..."

    cd "$REPO_ROOT"

    # Check if docker-compose.yaml is valid
    if docker-compose config > /dev/null 2>&1; then
        log_pass "Docker Compose configuration is valid"
    else
        log_fail "Docker Compose configuration is invalid"
        return 1
    fi

    # Check if all services are properly defined
    local services=("memtech" "redis" "postgres" "agents-runner" "orchestrator")
    for service in "${services[@]}"; do
        if docker-compose config | grep -q "name: $service"; then
            log_pass "Service '$service' properly defined"
        else
            log_fail "Service '$service' missing or misconfigured"
        fi
    done
}

# Test 2: PM2 Configuration
test_pm2_config() {
    log_test "2. Testing PM2 ecosystem configuration..."

    cd "$REPO_ROOT"

    # Check if ecosystem.config.cjs is valid JavaScript
    if node -c ecosystem.config.cjs 2>/dev/null; then
        log_pass "PM2 ecosystem configuration is valid JavaScript"
    else
        log_fail "PM2 ecosystem configuration has syntax errors"
        return 1
    fi

    # Check if all required apps are defined
    local apps=("orchestrator" "security-agent" "quality-agent" "documentation-agent" "architecture-agent" "pr-reviewer-agent")
    for app in "${apps[@]}"; do
        if grep -q "name: '$app'" ecosystem.config.cjs; then
            log_pass "App '$app' properly defined in PM2 config"
        else
            log_fail "App '$app' missing from PM2 config"
        fi
    done

    # Check if log directories exist
    if [[ -d "obs/logs" ]]; then
        log_pass "PM2 logs directory exists"
    else
        log_fail "PM2 logs directory missing"
    fi
}

# Test 3: CLI Wrapper Functionality
test_cli_wrapper() {
    log_test "3. Testing CLI wrapper functionality..."

    local script_path="$REPO_ROOT/scripts/run-agents.sh"

    # Check if script exists and is executable
    if [[ -f "$script_path" && -x "$script_path" ]]; then
        log_pass "CLI wrapper script exists and is executable"
    else
        log_fail "CLI wrapper script missing or not executable"
        return 1
    fi

    # Test help command
    if "$script_path" --help > /dev/null 2>&1; then
        log_pass "CLI wrapper help command works"
    else
        log_fail "CLI wrapper help command failed"
    fi

    # Test invalid command handling
    if "$script_path" invalid-agent 2>/dev/null; then
        log_fail "CLI wrapper should fail for invalid agent"
    else
        log_pass "CLI wrapper properly handles invalid commands"
    fi
}

# Test 4: MemTech Connection
test_memtech_connection() {
    log_test "4. Testing MemTech connection..."

    # Check if MemTech is running on port 8080
    local memtech_health
    memtech_health=$(curl -s http://localhost:8080/health 2>/dev/null || echo "unhealthy")

    if [[ "$memtech_health" != "unhealthy" ]]; then
        log_pass "MemTech service is accessible and healthy"
    else
        log_fail "MemTech service is not accessible or unhealthy"
        log_info "  Start MemTech with: cd /Users/felipe/Developer/memtech-universal && docker-compose up -d"
        return 1
    fi

    # Check if MemTech stats endpoint works
    local memtech_stats
    memtech_stats=$(curl -s http://localhost:8080/stats 2>/dev/null || echo "no-stats")

    if [[ "$memtech_stats" != "no-stats" ]]; then
        log_pass "MemTech stats endpoint is working"
    else
        log_fail "MemTech stats endpoint not working"
    fi
}

# Test 5: Skills-fabrik CLI Integration
test_skills_fabrik_integration() {
    log_test "5. Testing Skills-fabrik CLI integration..."

    local skills_cli="/Users/felipe/Developer/skills-fabrik/packages/skills-cli/dist/index.js"

    # Check if skills-fabrik CLI exists
    if [[ -f "$skills_cli" ]]; then
        log_pass "Skills-fabrik CLI found"
    else
        log_fail "Skills-fabrik CLI not found"
        return 1
    fi

    # Test if skills CLI is functional
    if node "$skills_cli" --version > /dev/null 2>&1; then
        log_pass "Skills-fabrik CLI is functional"
    else
        log_fail "Skills-fabrik CLI is not functional"
    fi

    # Test prompt-builder availability
    if node "$skills_cli" prompt-builder --help > /dev/null 2>&1; then
        log_pass "Skills-fabrik prompt-builder is available"
    else
        log_fail "Skills-fabrik prompt-builder not available"
    fi

    # Check if skill-rules.json exists
    if [[ -f "$REPO_ROOT/configs/skill-rules.json" ]]; then
        log_pass "Skill rules configuration exists"
    else
        log_fail "Skill rules configuration missing"
    fi
}

# Main execution
main() {
    echo -e "${BLUE}🧪 Phase 1 TEST GATES - Infrastructure Foundation${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo ""

    # Run all tests
    test_docker_compose
    echo ""

    test_pm2_config
    echo ""

    test_cli_wrapper
    echo ""

    test_memtech_connection
    echo ""

    test_skills_fabrik_integration
    echo ""

    # Results
    echo -e "${BLUE}📊 TEST RESULTS${NC}"
    echo -e "${BLUE}================${NC}"
    echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
    echo -e "Total Tests:  $TOTAL_TESTS"
    echo ""

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}🎉 ALL TESTS PASSED! Phase 1 is complete.${NC}"
        echo -e "${GREEN}✅ Ready to proceed to Phase 2: Python SAST Agents${NC}"
        exit 0
    else
        echo -e "${RED}❌ $TESTS_FAILED test(s) failed. Fix issues before proceeding.${NC}"
        echo -e "${YELLOW}💡 Run individual tests to identify specific problems.${NC}"
        exit 1
    fi
}

# Execute main function
main "$@"
# Resolve repository root dynamically
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
