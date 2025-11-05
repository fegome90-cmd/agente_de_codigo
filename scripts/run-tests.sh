#!/bin/bash

# Pit Crew Testing Suite Runner
# Comprehensive test execution for the multi-agent system

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo -e "${BLUE}🧪 Pit Crew Testing Suite${NC}"
echo "=================================="
echo "Repository: $REPO_ROOT"
echo ""

# Function to print colored output
print_status() {
    local status=$1
    local message=$2

    case $status in
        "INFO")
            echo -e "${BLUE}ℹ️  $message${NC}"
            ;;
        "SUCCESS")
            echo -e "${GREEN}✅ $message${NC}"
            ;;
        "WARNING")
            echo -e "${YELLOW}⚠️  $message${NC}"
            ;;
        "ERROR")
            echo -e "${RED}❌ $message${NC}"
            ;;
        "HEADER")
            echo -e "${BLUE}🔷 $message${NC}"
            ;;
    esac
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to run tests and capture results
run_test_suite() {
    local suite_name=$1
    local command=$2
    local description=$3

    print_status "HEADER" "Running $suite_name Tests"
    echo "Description: $description"
    echo "Command: $command"
    echo ""

    local start_time=$(date +%s)
    local exit_code=0

    # Run the test
    if eval "$command"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        print_status "SUCCESS" "$suite_name tests passed (${duration}s)"
        return 0
    else
        exit_code=$?
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        print_status "ERROR" "$suite_name tests failed (${duration}s)"
        return $exit_code
    fi
}

# Check dependencies
print_status "INFO" "Checking dependencies..."

MISSING_DEPS=""

if ! command_exists node; then
    MISSING_DEPS="$MISSING_DEPS node"
fi

if ! command_exists pnpm; then
    MISSING_DEPS="$MISSING_DEPS pnpm"
elif ! pnpm --version >/dev/null 2>&1; then
    MISSING_DEPS="$MISSING_DEPS pnpm"
fi

if ! command_exists python3; then
    MISSING_DEPS="$MISSING_DEPS python3"
fi

if [ -n "$MISSING_DEPS" ]; then
    print_status "ERROR" "Missing dependencies:$MISSING_DEPS"
    echo "Please install the missing dependencies and try again."
    exit 1
fi

print_status "SUCCESS" "All dependencies found"

# Change to repository root
cd "$REPO_ROOT"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    print_status "INFO" "Installing Node.js dependencies..."
    if command_exists pnpm; then
        pnpm install
    else
        npm install
    fi
fi

# Parse command line arguments
TEST_TYPE="all"
COVERAGE=false
WATCH=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --unit)
            TEST_TYPE="unit"
            shift
            ;;
        --integration)
            TEST_TYPE="integration"
            shift
            ;;
        --e2e)
            TEST_TYPE="e2e"
            shift
            ;;
        --coverage)
            COVERAGE=true
            shift
            ;;
        --watch)
            WATCH=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --unit        Run unit tests only"
            echo "  --integration Run integration tests only"
            echo "  --e2e         Run end-to-end tests only"
            echo "  --coverage    Generate coverage report"
            echo "  --watch       Run tests in watch mode"
            echo "  --verbose     Verbose output"
            echo "  --help        Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                    # Run all tests"
            echo "  $0 --unit            # Run unit tests only"
            echo "  $0 --coverage        # Run tests with coverage"
            echo "  $0 --e2e --verbose   # Run E2E tests with verbose output"
            exit 0
            ;;
        *)
            print_status "ERROR" "Unknown option: $1"
            echo "Use --help for usage information."
            exit 1
            ;;
    esac
done

# Build test commands
JEST_OPTIONS=""

if [ "$VERBOSE" = true ]; then
    JEST_OPTIONS="$JEST_OPTIONS --verbose"
fi

if [ "$WATCH" = true ]; then
    JEST_OPTIONS="$JEST_OPTIONS --watch"
fi

if [ "$COVERAGE" = true ]; then
    JEST_OPTIONS="$JEST_OPTIONS --coverage"
fi

if [ -x "$REPO_ROOT/node_modules/.bin/jest" ]; then
    JEST_CMD="$REPO_ROOT/node_modules/.bin/jest"
elif [ -x "$REPO_ROOT/packages/documentation-agent/node_modules/.bin/jest" ]; then
    JEST_CMD="$REPO_ROOT/packages/documentation-agent/node_modules/.bin/jest"
elif command_exists pnpm; then
    JEST_CMD="pnpm --filter @pit-crew/documentation-agent exec jest"
else
    JEST_CMD="npx jest"
fi

UNIT_CMD="$JEST_CMD tests/unit $JEST_OPTIONS"
INTEGRATION_CMD="$JEST_CMD tests/integration $JEST_OPTIONS"
E2E_CMD="$JEST_CMD tests/e2e $JEST_OPTIONS --testTimeout=60000"

PYTHON_UNIT_CMD="python3 -m pytest tests/unit -v"
PYTHON_INTEGRATION_CMD="python3 -m pytest tests/integration -v"

# Run tests based on type
OVERALL_EXIT_CODE=0

case $TEST_TYPE in
    "unit")
        run_test_suite "JavaScript Unit" "$UNIT_CMD" "Unit tests for orchestrator components"
        UNIT_EXIT_CODE=$?

        print_status "INFO" "Running Python unit tests..."
        if run_test_suite "Python Unit" "$PYTHON_UNIT_CMD" "Unit tests for security agent"; then
            PYTHON_UNIT_EXIT_CODE=0
        else
            PYTHON_UNIT_EXIT_CODE=$?
        fi

        OVERALL_EXIT_CODE=$((UNIT_EXIT_CODE + PYTHON_UNIT_EXIT_CODE))
        ;;

    "integration")
        run_test_suite "JavaScript Integration" "$INTEGRATION_CMD" "Integration tests for IPC communication"
        INTEGRATION_EXIT_CODE=$?

        print_status "INFO" "Running Python integration tests..."
        if run_test_suite "Python Integration" "$PYTHON_INTEGRATION_CMD" "Integration tests for agent communication"; then
            PYTHON_INTEGRATION_EXIT_CODE=0
        else
            PYTHON_INTEGRATION_EXIT_CODE=$?
        fi

        OVERALL_EXIT_CODE=$((INTEGRATION_EXIT_CODE + PYTHON_INTEGRATION_EXIT_CODE))
        ;;

    "e2e")
        # Check if system dependencies are available for E2E tests
        if ! command_exists git; then
            print_status "WARNING" "git not found, some E2E tests may fail"
        fi

        run_test_suite "End-to-End" "$E2E_CMD" "Complete workflow tests"
        OVERALL_EXIT_CODE=$?
        ;;

    "all")
        # Run all test suites
        print_status "INFO" "Running complete test suite..."

        # Unit tests
        if run_test_suite "JavaScript Unit" "$UNIT_CMD" "Unit tests for orchestrator components"; then
            UNIT_EXIT_CODE=0
        else
            UNIT_EXIT_CODE=$?
        fi

        # Python unit tests
        print_status "INFO" "Running Python unit tests..."
        if run_test_suite "Python Unit" "$PYTHON_UNIT_CMD" "Unit tests for security agent"; then
            PYTHON_UNIT_EXIT_CODE=0
        else
            PYTHON_UNIT_EXIT_CODE=$?
        fi

        # Integration tests
        if run_test_suite "JavaScript Integration" "$INTEGRATION_CMD" "Integration tests for IPC communication"; then
            INTEGRATION_EXIT_CODE=0
        else
            INTEGRATION_EXIT_CODE=$?
        fi

        # Python integration tests
        print_status "INFO" "Running Python integration tests..."
        if run_test_suite "Python Integration" "$PYTHON_INTEGRATION_CMD" "Integration tests for agent communication"; then
            PYTHON_INTEGRATION_EXIT_CODE=0
        else
            PYTHON_INTEGRATION_EXIT_CODE=$?
        fi

        # E2E tests
        if run_test_suite "End-to-End" "$E2E_CMD" "Complete workflow tests"; then
            E2E_EXIT_CODE=0
        else
            E2E_EXIT_CODE=$?
        fi

        OVERALL_EXIT_CODE=$((UNIT_EXIT_CODE + PYTHON_UNIT_EXIT_CODE + INTEGRATION_EXIT_CODE + PYTHON_INTEGRATION_EXIT_CODE + E2E_EXIT_CODE))

        # Summary
        echo ""
        print_status "HEADER" "Test Suite Summary"
        echo "========================"
        echo "JavaScript Unit Tests:     $([ $UNIT_EXIT_CODE -eq 0 ] && echo 'PASS' || echo 'FAIL')"
        echo "Python Unit Tests:         $([ $PYTHON_UNIT_EXIT_CODE -eq 0 ] && echo 'PASS' || echo 'FAIL')"
        echo "Integration Tests:        $([ $INTEGRATION_EXIT_CODE -eq 0 ] && echo 'PASS' || echo 'FAIL')"
        echo "Python Integration Tests: $([ $PYTHON_INTEGRATION_EXIT_CODE -eq 0 ] && echo 'PASS' || echo 'FAIL')"
        echo "End-to-End Tests:          $([ $E2E_EXIT_CODE -eq 0 ] && echo 'PASS' || echo 'FAIL')"
        echo ""

        # Generate coverage summary if coverage was requested
        if [ "$COVERAGE" = true ] && [ -d "coverage" ]; then
            print_status "INFO" "Coverage report generated:"
            echo "HTML Report: coverage/lcov-report/index.html"
            echo "LCOV Report: coverage/lcov.info"
            echo ""
        fi
        ;;
esac

# Final result
echo ""
if [ $OVERALL_EXIT_CODE -eq 0 ]; then
    print_status "SUCCESS" "All tests passed! 🎉"
    echo ""
    echo "🚀 The Pit Crew multi-agent system is ready for production!"
else
    print_status "ERROR" "Some tests failed! 💥"
    echo ""
    echo "Please review the test output above and fix the failing tests."
    echo "Run with --verbose for more detailed output."
    exit $OVERALL_EXIT_CODE
fi
