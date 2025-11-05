#!/bin/bash

# Simple integration test for Security Agent
# Tests that the Python agent can start and run basic analysis

set -e

echo "🚀 Starting Security Agent Integration Test"

# Setup paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OBS_DIR="$REPO_ROOT/obs"
REPORTS_DIR="$OBS_DIR/reports"
SOCKET_PATH="/tmp/pit-crew-test.sock"

echo "📁 Repository root: $REPO_ROOT"
echo "📊 OBS directory: $OBS_DIR"

# Create directories
mkdir -p "$OBS_DIR"
mkdir -p "$REPORTS_DIR"

# Clean up previous test artifacts
rm -f "$SOCKET_PATH"
find "$REPORTS_DIR" -name "test-*.sarif" -delete 2>/dev/null || true

echo "🐍 Starting Security Agent..."

# Start security agent in standalone mode
cd "$REPO_ROOT"
PYTHONPATH="$REPO_ROOT/packages/agents/src" \
STANDALONE_MODE="true" \
OBS_PATH="$OBS_DIR" \
python3 packages/agents/src/security_agent.py &
AGENT_PID=$!

echo "📱 Agent started with PID: $AGENT_PID"

# Wait for agent to start
echo "⏳ Waiting for agent to initialize..."
sleep 3

# Check if agent is still running
if ! kill -0 $AGENT_PID 2>/dev/null; then
    echo "❌ Agent failed to start"
    exit 1
fi

echo "✅ Agent is running"

# Test: Let the agent run its built-in analysis for a few seconds
echo "🔍 Running security analysis..."

# Wait for analysis
sleep 5

# Check for output files
echo "📋 Checking for analysis results..."

REPORT_COUNT=0
for report in "$REPORTS_DIR"/*.sarif; do
    if [ -f "$report" ]; then
        REPORT_COUNT=$((REPORT_COUNT + 1))
        echo "📄 Found report: $(basename "$report")"

        # Show basic info about the report
        if command -v jq >/dev/null 2>&1; then
            RESULTS=$(jq '.results | length' "$report" 2>/dev/null || echo "0")
            TOOL=$(jq '.runs[0].tool.driver.name' "$report" 2>/dev/null || echo "unknown")
            echo "   - Tool: $TOOL"
            echo "   - Results: $RESULTS findings"
        else
            echo "   - Install jq for detailed report analysis"
        fi
    fi
done

echo "📊 Total reports generated: $REPORT_COUNT"

# Check agent logs
if [ -f "/tmp/pit-crew-agent.log" ]; then
    echo "📜 Agent logs:"
    echo "----------------------------------------"
    tail -10 "/tmp/pit-crew-agent.log"
    echo "----------------------------------------"
fi

# Cleanup
echo "🧹 Cleaning up..."
kill $AGENT_PID 2>/dev/null || true
wait $AGENT_PID 2>/dev/null || true
rm -f "$SOCKET_PATH"

# Final status
if [ $REPORT_COUNT -gt 0 ]; then
    echo "✅ Integration test PASSED - Security agent generated $REPORT_COUNT report(s)"
    exit 0
else
    echo "❌ Integration test FAILED - No reports generated"
    exit 1
fi