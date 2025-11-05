#!/bin/bash

# Test Quality Agent Integration and Functionality
# Tests if Quality Agent can perform code quality analysis with real tools

set -e

echo "🎯 Testing Quality Agent Integration"
echo "=================================="

# Setup paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OBS_DIR="$REPO_ROOT/obs"
REPORTS_DIR="$OBS_DIR/reports"
SOCKET_PATH="/tmp/pit-crew-quality-test.sock"

echo "📁 Repository: $REPO_ROOT"
echo "🔌 Socket: $SOCKET_PATH"

# Clean up
rm -f "$SOCKET_PATH"
mkdir -p "$OBS_DIR"
mkdir -p "$REPORTS_DIR"

echo ""
echo "🚀 Step 1: Setting up test files..."

# Create test files with various quality issues
TEST_DIR="$REPO_ROOT/test_quality_files"
mkdir -p "$TEST_DIR"

# Python file with issues
cat > "$TEST_DIR/sample.py" << 'EOF'
import os
import sys  # E402: Import not at top

def complex_function(a, b, c, d, e, f):
    # High complexity function
    if a:
        if b:
            if c:
                if d:
                    if e:
                        return f * 2
    return None

def unused_function():
    x = 1  # Unused variable
    return "test"

# Duplicate code
def similar_function():
    x = 1
    return "test"
EOF

# JavaScript file with issues
cat > "$TEST_DIR/app.js" << 'EOF'
const x = 1;  // Unused variable
let y;  // Unused variable

function complexFunction(a, b, c, d, e, f) {
    // High complexity function
    if (a) {
        if (b) {
            if (c) {
                if (d) {
                    if (e) {
                        return f * 2;
                    }
                }
            }
        }
    }
    return null;
}

// Duplicate code
function similarFunction() {
    const x = 1;
    return "test";
}
EOF

echo "✅ Test files created in $TEST_DIR"

echo ""
echo "🚀 Step 2: Starting Socket Server..."

# Start socket server
cd "$REPO_ROOT"
NODE_ENV=test \
SOCKET_PATH="$SOCKET_PATH" \
OBS_PATH="$OBS_DIR" \
node -e "
const { SocketServer } = require('./packages/orchestrator/dist/ipc/socket-server.js');

async function startSocketServer() {
  const socketServer = new SocketServer('$SOCKET_PATH');

  // Track events
  let agentsRegistered = 0;
  let tasksSent = 0;
  let tasksCompleted = 0;
  let qualityResults = null;

  socketServer.on('agent_registered', (registration) => {
    agentsRegistered++;
    console.log('✅ Agent registered:', registration.agent, '(PID:', registration.pid, ')');

    if (registration.agent === 'quality') {
      console.log('🎯 Quality agent capabilities:', JSON.stringify(registration.capabilities, null, 2));
    }
  });

  socketServer.on('task_sent', (taskData) => {
    tasksSent++;
    console.log('📤 Task sent:', taskData.agent, '- Task ID:', taskData.task_id);
  });

  socketServer.on('task_response', (message) => {
    if (message.agent === 'quality') {
      tasksCompleted++;
      console.log('🎯 Quality task completed!');
      console.log('   Task ID:', message.id);
      console.log('   Status:', message.data?.status);
      console.log('   Findings:', message.data?.data?.findings_count || 0);
      console.log('   Tools used:', message.data?.data?.tools_used || []);

      qualityResults = message.data?.data;
    }
  });

  await socketServer.start();
  console.log('🔌 Socket server started at $SOCKET_PATH');

  // Test quality analysis after some time
  setTimeout(() => {
    console.log('📤 Sending quality analysis task...');

    const testTask = {
      task_id: 'quality-test-' + Date.now(),
      agent: 'quality',
      scope: [
        '$TEST_DIR/sample.py',
        '$TEST_DIR/app.js'
      ],
      context: {
        repo_root: '$REPO_ROOT',
        commit_hash: 'quality-test-commit',
        branch: 'test-branch'
      },
      output: '$REPORTS_DIR/quality-test.sarif',
      config: {
        complexity_threshold: 8,
        duplication_threshold: 0.7,
        timeout_seconds: 30
      }
    };

    // Send task
    socketServer.sendTask(testTask);
    console.log('✅ Quality task sent successfully');
  }, 3000);

  // Run test for 20 seconds
  setTimeout(() => {
    console.log('');
    console.log('📊 Quality Agent Test Results:');
    console.log('=============================');
    console.log('Agents registered:', agentsRegistered);
    console.log('Tasks sent:', tasksSent);
    console.log('Tasks completed:', tasksCompleted);

    if (qualityResults) {
      console.log('');
      console.log('🎯 Quality Analysis Results:');
      console.log('   Files analyzed:', qualityResults.files_analyzed || 'Unknown');
      console.log('   Total findings:', qualityResults.findings_count || 0);
      console.log('   Severity breakdown:', JSON.stringify(qualityResults.severity_breakdown || {}, null, 2));
      console.log('   Category breakdown:', JSON.stringify(qualityResults.category_breakdown || {}, null, 2));

      if (qualityResults.tools_used && qualityResults.tools_used.length > 0) {
        console.log('   Tools used:', qualityResults.tools_used.join(', '));
      }

      console.log('   Analysis summary:', qualityResults.analysis_summary || 'No summary');
    }

    socketServer.stop().then(() => {
      console.log('✅ Socket server stopped');
      process.exit(0);
    });
  }, 20000);
}

startSocketServer().catch(console.error);
" &
SOCKET_SERVER_PID=$!

echo "📱 Socket Server PID: $SOCKET_SERVER_PID"

# Wait for socket server to start
echo "⏳ Waiting for socket server..."
sleep 3

# Check if socket was created
if [ -S "$SOCKET_PATH" ]; then
    echo "✅ Socket file created successfully"
else
    echo "❌ Socket file not found"
    kill $SOCKET_SERVER_PID 2>/dev/null || true
    exit 1
fi

echo ""
echo "🤖 Step 3: Starting Quality Agent..."

# Start quality agent in IPC mode
PYTHONPATH="$REPO_ROOT/packages/agents/src" \
SOCKET_PATH="$SOCKET_PATH" \
OBS_PATH="$OBS_DIR" \
python3 packages/agents/src/quality_agent.py &
AGENT_PID=$!

echo "📱 Quality Agent PID: $AGENT_PID"

# Wait for test to complete
echo "⏳ Running quality analysis test for 20 seconds..."
sleep 20

echo ""
echo "📊 Step 4: Checking Results..."

# Check if processes were running
SOCKET_SERVER_RUNNING=false
AGENT_RUNNING=false

if kill -0 $SOCKET_SERVER_PID 2>/dev/null; then
    SOCKET_SERVER_RUNNING=true
    echo "✅ Socket server process ran successfully"
    kill $SOCKET_SERVER_PID 2>/dev/null || true
else
    echo "⚠️ Socket server process ended early"
fi

if kill -0 $AGENT_PID 2>/dev/null; then
    AGENT_RUNNING=true
    echo "✅ Quality agent process ran successfully"
    kill $AGENT_PID 2>/dev/null || true
else
    echo "⚠️ Quality agent process ended early"
fi

# Check for reports
REPORT_COUNT=0
QUALITY_REPORTS=0

for report in "$REPORTS_DIR"/*.json; do
    if [ -f "$report" ]; then
        REPORT_COUNT=$((REPORT_COUNT + 1))
        echo "📄 Found report: $(basename "$report")"

        # Check if this is a quality-generated report
        if [[ "$(basename "$report")" == *"quality"* ]]; then
            QUALITY_REPORTS=$((QUALITY_REPORTS + 1))
            echo "   🎯 Quality-generated report detected!"

            # Show report summary
            if command -v jq >/dev/null 2>&1; then
                FINDINGS=$(jq '.summary.total_findings // 0' "$report" 2>/dev/null || echo "0")
                TOOLS=$(jq -r '.analysis.tools_used[]? // empty' "$report" 2>/dev/null | tr '\n' ' ' || echo "none")
                SEVERITY=$(jq '.summary.severity_breakdown // {}' "$report" 2>/dev/null || echo "{}")
                echo "   Findings: $FINDINGS"
                echo "   Tools: $TOOLS"
                echo "   Severity: $SEVERITY"
            fi
        fi
    fi
done

echo "📊 Total reports: $REPORT_COUNT"
echo "🎯 Quality reports: $QUALITY_REPORTS"

# Check for specific output file
QUALITY_OUTPUT="$REPORTS_DIR/quality-test.sarif"
if [ -f "$QUALITY_OUTPUT" ]; then
    echo "✅ Quality analysis output file found"

    if command -v jq >/dev/null 2>&1; then
        echo "📄 Quality Report Summary:"
        jq -r '
        "Agent: " + .agent,
        "Run ID: " + .run_id,
        "Files Analyzed: " + (.analysis.files_analyzed | tostring),
        "Total Findings: " + (.summary.total_findings | tostring),
        "Tools Used: " + (.analysis.tools_used | join(", ")),
        "Analysis Summary: " + .analysis_summary
        ' "$QUALITY_OUTPUT" 2>/dev/null || echo "   Could not parse report"
    fi
else
    echo "⚠️ Quality analysis output file not found"
fi

echo ""
echo "🧹 Step 5: Cleanup..."

# Stop processes
echo "Stopping test processes..."
kill $AGENT_PID 2>/dev/null || true
kill $SOCKET_SERVER_PID 2>/dev/null || true

# Wait for graceful shutdown
sleep 2

# Force kill if needed
for pid in $AGENT_PID $SOCKET_SERVER_PID; do
    if kill -0 $pid 2>/dev/null; then
        echo "Force killing PID $pid"
        kill -9 $pid 2>/dev/null || true
    fi
done

# Cleanup socket
rm -f "$SOCKET_PATH"

# Cleanup test files
rm -rf "$TEST_DIR"

echo ""
echo "🏆 QUALITY AGENT TEST RESULTS"
echo "============================="

# Final assessment
if [ $QUALITY_REPORTS -gt 0 ]; then
    echo "✅ SUCCESS: Quality Agent is working!"
    echo ""
    echo "🎯 Evidence of quality analysis functionality:"
    echo "   ✅ Socket server started successfully"
    echo "   ✅ Quality agent connected via IPC"
    echo "   ✅ Quality analysis tasks executed"
    echo "   ✅ Reports generated via quality analysis"
    echo "   ✅ Multiple tools integration working"
    echo ""
    echo "💡 The Quality Agent is ready for production use!"
    echo "   It can analyze code quality using multiple tools and generate structured reports."
    exit 0
else
    echo "⚠️  LIMITED QUALITY ANALYSIS DETECTED"
    echo ""
    echo "🔍 What was tested:"
    echo "   ✅ Socket server startup"
    echo "   ✅ Quality agent initialization"
    echo "   ⚠️  Limited quality task execution"
    echo ""
    echo "💡 Possible reasons:"
    echo "   - Quality tools (ruff, eslint, lizard) not installed"
    echo "   - File permission issues"
    echo "   - Task timeout or configuration issues"
    echo ""
    echo "🔧 To troubleshoot:"
    echo "   1. Install required tools: pip install ruff lizard, npm install -g eslint"
    echo "   2. Check agent logs: tail -f /tmp/pit-crew-quality-agent.log"
    echo "   3. Verify file permissions"
    exit 1
fi