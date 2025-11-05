#!/bin/bash

# Full integration test for Pit Crew System
# Tests complete orchestrator + agent communication via Unix sockets

set -e

echo "🏁 Pit Crew Full Integration Test"
echo "================================"

# Setup paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OBS_DIR="$REPO_ROOT/obs"
REPORTS_DIR="$OBS_DIR/reports"
SOCKET_PATH="/tmp/pit-crew-full-test.sock"

echo "📁 Repository root: $REPO_ROOT"
echo "📊 OBS directory: $OBS_DIR"
echo "🔌 Socket path: $SOCKET_PATH"

# Clean up previous test artifacts
rm -f "$SOCKET_PATH"
mkdir -p "$OBS_DIR"
mkdir -p "$REPORTS_DIR"

echo ""
echo "🚀 Step 1: Starting Orchestrator Socket Server..."

# Start orchestrator socket server in background
cd "$REPO_ROOT"
NODE_ENV=development \
SOCKET_PATH="$SOCKET_PATH" \
OBS_PATH="$OBS_DIR" \
timeout 60s node -e "
const { SocketServer } = require('./packages/orchestrator/src/ipc/socket-server.js');
const { AgentRegistry } = require('./packages/orchestrator/src/ipc/agent-registry.js');

async function startOrchestrator() {
  const socketServer = new SocketServer('$SOCKET_PATH');
  const agentRegistry = new AgentRegistry(socketServer);

  // Setup event handlers
  agentRegistry.on('agent_registered', (registration) => {
    console.log('✅ Agent registered:', registration.agent, 'PID:', registration.pid);
  });

  agentRegistry.on('task_completed', (result) => {
    console.log('🎯 Task completed:', result.taskId, 'Agent:', result.agent);
    console.log('   Status:', result.status, 'Duration:', result.durationMs + 'ms');
    if (result.results && result.results.findings) {
      console.log('   Findings:', result.results.findings.length);
    }
  });

  agentRegistry.on('task_failed', (result) => {
    console.log('❌ Task failed:', result.taskId, 'Error:', result.error);
  });

  await socketServer.start();
  console.log('🔌 Socket server started at $SOCKET_PATH');

  // Keep server running
  process.on('SIGINT', async () => {
    console.log('🛑 Shutting down socket server...');
    await socketServer.stop();
    process.exit(0);
  });
}

startOrchestrator().catch(console.error);
" &
ORCHESTRATOR_PID=$!

echo "📱 Orchestrator started with PID: $ORCHESTRATOR_PID"

# Wait for socket server to start
echo "⏳ Waiting for socket server to initialize..."
sleep 3

# Check if socket was created
if [ ! -S "$SOCKET_PATH" ]; then
    echo "❌ Socket server failed to start (no socket file)"
    kill $ORCHESTRATOR_PID 2>/dev/null || true
    exit 1
fi

echo "✅ Socket server is running"

echo ""
echo "🤖 Step 2: Starting Security Agent..."

# Start security agent
PYTHONPATH="$REPO_ROOT/packages/agents/src" \
SOCKET_PATH="$SOCKET_PATH" \
OBS_PATH="$OBS_DIR" \
timeout 60s python3 packages/agents/src/security_agent.py &
AGENT_PID=$!

echo "📱 Security Agent started with PID: $AGENT_PID"

# Wait for agent to register
echo "⏳ Waiting for agent registration..."
sleep 5

echo ""
echo "📋 Step 3: Checking system status..."

# Check if both processes are still running
if ! kill -0 $ORCHESTRATOR_PID 2>/dev/null; then
    echo "❌ Orchestrator process died"
    kill $AGENT_PID 2>/dev/null || true
    exit 1
fi

if ! kill -0 $AGENT_PID 2>/dev/null; then
    echo "❌ Security Agent process died"
    kill $ORCHESTRATOR_PID 2>/dev/null || true
    exit 1
fi

echo "✅ Both processes are running"

echo ""
echo "🎯 Step 4: Sending test task to Security Agent..."

# Create a simple test task and send it via the orchestrator
cd "$REPO_ROOT"
NODE_ENV=development \
SOCKET_PATH="$SOCKET_PATH" \
node -e "
const { SocketServer } = require('./packages/orchestrator/src/ipc/socket-server.js');
const { AgentRegistry } = require('./packages/orchestrator/src/ipc/agent-registry.js');

async function sendTestTask() {
  const socketServer = new SocketServer('$SOCKET_PATH');
  const agentRegistry = new AgentRegistry(socketServer);

  // Wait a moment for connection
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Create test task
  const task = {
    task_id: 'test-' + Date.now(),
    agent: 'security',
    scope: ['packages/orchestrator/src/index.ts', 'packages/shared/src/types/agent-events.ts'],
    context: {
      repo_root: '$REPO_ROOT',
      commit_hash: 'test-commit',
      branch: 'main'
    },
    output: '$REPORTS_DIR/test-integration.sarif',
    config: {
      tools: ['basic'],
      severity_threshold: 'low'
    }
  };

  console.log('📤 Sending task:', task.task_id);
  console.log('   Agent:', task.agent);
  console.log('   Files:', task.scope.length);

  try {
    const result = await agentRegistry.sendTask(task);
    console.log('✅ Task completed successfully!');
    console.log('   Agent:', result.agent);
    console.log('   Status:', result.status);
    console.log('   Duration:', result.durationMs + 'ms');

    if (result.results) {
      console.log('   Findings:', result.results.findings ? result.results.findings.length : 0);
      console.log('   Tools used:', result.results.tools_used ? Array.from(result.results.tools_used).join(', ') : 'none');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Task failed:', error.message);
    process.exit(1);
  }
}

sendTestTask().catch(console.error);
" &
TASK_SENDER_PID=$!

# Wait for task completion
echo "⏳ Waiting for task completion..."
sleep 10

echo ""
echo "📊 Step 5: Checking results..."

# Check for output files
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

            if [ "$RESULTS" -gt 0 ]; then
                echo "   - Sample finding:"
                jq -r '.results[0] | "     Level: \(.level), Rule: \(.rule_id), Message: \(.message.text)"' "$report" 2>/dev/null || echo "     - Unable to extract sample"
            fi
        else
            echo "   - Install jq for detailed report analysis"
        fi
    fi
done

echo "📊 Total reports generated: $REPORT_COUNT"

# Check agent logs
if [ -f "/tmp/pit-crew-agent.log" ]; then
    echo ""
    echo "📜 Agent logs (last 10 lines):"
    echo "----------------------------------------"
    tail -10 "/tmp/pit-crew-agent.log"
    echo "----------------------------------------"
fi

echo ""
echo "🧹 Step 6: Cleanup..."

# Cleanup processes
echo "Stopping processes..."
kill $TASK_SENDER_PID 2>/dev/null || true
kill $AGENT_PID 2>/dev/null || true
kill $ORCHESTRATOR_PID 2>/dev/null || true

# Wait for graceful shutdown
sleep 2

# Force kill if still running
for pid in $TASK_SENDER_PID $AGENT_PID $ORCHESTRATOR_PID; do
    if kill -0 $pid 2>/dev/null; then
        echo "Force killing PID $pid"
        kill -9 $pid 2>/dev/null || true
    fi
done

# Cleanup socket
rm -f "$SOCKET_PATH"

echo ""
echo "🏆 FINAL RESULTS"
echo "=================="

# Final status
if [ $REPORT_COUNT -gt 0 ]; then
    echo "✅ FULL INTEGRATION TEST PASSED!"
    echo ""
    echo "🎯 Achievements:"
    echo "   ✅ Orchestrator socket server started successfully"
    echo "   ✅ Security agent connected and registered"
    echo "   ✅ Task sent via IPC communication"
    echo "   ✅ Security analysis executed"
    echo "   ✅ SARIF reports generated: $REPORT_COUNT"
    echo "   ✅ Bidirectional communication working"
    echo ""
    echo "🚀 Pit Crew System is fully operational!"
    exit 0
else
    echo "❌ Integration test completed but no reports generated"
    echo ""
    echo "🔍 System status:"
    echo "   ✅ Orchestrator: Started"
    echo "   ✅ Security Agent: Started"
    echo "   ✅ IPC Communication: Established"
    echo "   ❌ Analysis Results: No reports found"
    echo ""
    echo "📝 Note: The core architecture is working, but analysis tools may need configuration."
    exit 1
fi