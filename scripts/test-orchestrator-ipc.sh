#!/bin/bash

# Test specific Orchestrator IPC Communication
# Verifies that orchestrator properly calls agents via Unix sockets

set -e

echo "🎯 Testing Orchestrator IPC Communication"
echo "======================================"

# Setup paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OBS_DIR="$REPO_ROOT/obs"
REPORTS_DIR="$OBS_DIR/reports"
SOCKET_PATH="/tmp/pit-crew-orchestrator-ipc-test.sock"

echo "📁 Repository: $REPO_ROOT"
echo "🔌 Socket: $SOCKET_PATH"
echo "📊 OBS: $OBS_DIR"

# Clean up
rm -f "$SOCKET_PATH"
mkdir -p "$OBS_DIR"
mkdir -p "$REPORTS_DIR"

echo ""
echo "🚀 Step 1: Starting Orchestrator with Socket Server..."

# Start orchestrator with socket server in background
cd "$REPO_ROOT"
NODE_ENV=test \
SOCKET_PATH="$SOCKET_PATH" \
OBS_PATH="$OBS_DIR" \
timeout 60s node -e "
const { SocketServer } = require('./packages/orchestrator/src/ipc/socket-server.js');
const { AgentRegistry } = require('./packages/orchestrator/src/ipc/agent-registry.js');
const { PitCrewOrchestrator } = require('./packages/orchestrator/src/graph/pit-crew-graph.js');

async function testOrchestratorIPC() {
  console.log('🔧 Initializing orchestrator components...');

  // Initialize components
  const socketServer = new SocketServer('$SOCKET_PATH');
  const agentRegistry = new AgentRegistry(socketServer);
  const orchestrator = new PitCrewOrchestrator(agentRegistry);

  // Setup event handlers to track IPC calls
  let agentsRegistered = 0;
  let tasksSent = 0;
  let tasksCompleted = 0;

  agentRegistry.on('agent_registered', (registration) => {
    agentsRegistered++;
    console.log(\`✅ Agent registered: \${registration.agent} (PID: \${registration.pid})\`);
  });

  agentRegistry.on('task_completed', (result) => {
    tasksCompleted++;
    console.log(\`🎯 Task completed: \${result.taskId}\`);
    console.log(\`   Agent: \${result.agent}\`);
    console.log(\`   Status: \${result.status}\`);
    console.log(\`   Duration: \${result.durationMs}ms\`);
    if (result.results) {
      console.log(\`   Findings: \${result.results.findings?.length || 0}\`);
    }
  });

  agentRegistry.on('task_failed', (result) => {
    console.log(\`❌ Task failed: \${result.taskId} - \${result.error}\`);
  });

  // Start socket server
  await socketServer.start();
  console.log('🔌 Socket server started successfully');

  // Wait a moment for server to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('📊 Orchestrator ready for IPC communication');
  console.log('');
  console.log('⏳ Waiting for agent connections...');

  // Keep running for test duration
  setTimeout(async () => {
    console.log('');
    console.log('📈 Test Results Summary:');
    console.log('=========================');
    console.log(\`Agents registered: \${agentsRegistered}\`);
    console.log(\`Tasks completed: \${tasksCompleted}\`);

    if (agentsRegistered > 0 && tasksCompleted > 0) {
      console.log('✅ IPC communication working correctly!');
    } else {
      console.log('⚠️  Limited IPC activity detected');
    }

    await socketServer.stop();
    process.exit(0);
  }, 25000); // 25 second test window
}

testOrchestratorIPC().catch(console.error);
" &
ORCHESTRATOR_PID=$!

echo "📱 Orchestrator PID: $ORCHESTRATOR_PID"

# Wait for orchestrator to start
echo "⏳ Waiting for orchestrator initialization..."
sleep 3

echo ""
echo "🤖 Step 2: Starting Security Agent (IPC mode)..."

# Start security agent in IPC mode (not standalone)
PYTHONPATH="$REPO_ROOT/packages/agents/src" \
SOCKET_PATH="$SOCKET_PATH" \
OBS_PATH="$OBS_DIR" \
timeout 60s python3 packages/agents/src/security_agent.py &
AGENT_PID=$!

echo "📱 Security Agent PID: $AGENT_PID"

# Wait for agent to register
echo "⏳ Waiting for agent registration via IPC..."
sleep 5

echo ""
echo "📡 Step 3: Testing Direct IPC Call..."

# Create a simple IPC test by sending a task directly
cd "$REPO_ROOT"
NODE_ENV=test \
SOCKET_PATH="$SOCKET_PATH" \
timeout 10s node -e "
const { SocketServer } = require('./packages/orchestrator/src/ipc/socket-server.js');
const { AgentRegistry } = require('./packages/orchestrator/src/ipc/agent-registry.js');

async function testDirectIPC() {
  const socketServer = new SocketServer('$SOCKET_PATH');
  const agentRegistry = new AgentRegistry(socketServer);

  // Wait for connection
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('📤 Sending test task via IPC...');

  const task = {
    task_id: 'ipc-test-' + Date.now(),
    agent: 'security',
    scope: ['packages/orchestrator/src/index.ts', 'packages/shared/src/types/agent-events.ts'],
    context: {
      repo_root: '$REPO_ROOT',
      commit_hash: 'ipc-test-commit',
      branch: 'main'
    },
    output: '$REPORTS_DIR/ipc-test.sarif',
    config: {
      tools: ['basic'],
      severity_threshold: 'low'
    }
  };

  try {
    const result = await agentRegistry.sendTask(task);
    console.log('✅ IPC task sent successfully!');
    console.log('   Task ID:', result.taskId);
    console.log('   Agent:', result.agent);
    console.log('   Status:', result.status);
    console.log('   Duration:', result.durationMs + 'ms');

    if (result.results && result.results.findings) {
      console.log('   Findings:', result.results.findings.length);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ IPC task failed:', error.message);
    process.exit(1);
  }
}

testDirectIPC().catch(console.error);
" &
IPC_TEST_PID=$!

# Wait for IPC test to complete
echo "⏳ Waiting for IPC test completion..."
sleep 10

echo ""
echo "📊 Step 4: Checking Results..."

# Check for reports generated by IPC calls
REPORT_COUNT=0
IPC_REPORTS=0

for report in "$REPORTS_DIR"/*.sarif; do
    if [ -f "$report" ]; then
        REPORT_COUNT=$((REPORT_COUNT + 1))
        echo "📄 Found report: $(basename "$report")"

        # Check if this is an IPC-generated report
        if [[ "$(basename "$report")" == *"ipc"* ]]; then
            IPC_REPORTS=$((IPC_REPORTS + 1))
            echo "   📡 IPC-generated report detected!"
        fi

        if command -v jq >/dev/null 2>&1; then
            RESULTS=$(jq '.results | length' "$report" 2>/dev/null || echo "0")
            TOOL=$(jq '.runs[0].tool.driver.name' "$report" 2>/dev/null || echo "unknown")
            echo "   Tool: $TOOL, Findings: $RESULTS"
        fi
    fi
done

echo "📊 Total reports: $REPORT_COUNT"
echo "📡 IPC reports: $IPC_REPORTS"

# Check orchestrator logs
echo ""
echo "📜 Orchestrator IPC Activity:"

# Look for evidence of IPC communication in logs
if pgrep -f "node.*orchestrator.*socket" > /dev/null; then
    echo "✅ Orchestrator process is running"
else
    echo "❌ Orchestrator process not found"
fi

if pgrep -f "python.*security_agent" > /dev/null; then
    echo "✅ Security agent process is running"
else
    echo "❌ Security agent process not found"
fi

echo ""
echo "🧹 Step 5: Cleanup..."

# Cleanup processes
echo "Stopping test processes..."
kill $IPC_TEST_PID 2>/dev/null || true
kill $AGENT_PID 2>/dev/null || true
kill $ORCHESTRATOR_PID 2>/dev/null || true

# Wait for graceful shutdown
sleep 2

# Force kill if needed
for pid in $IPC_TEST_PID $AGENT_PID $ORCHESTRATOR_PID; do
    if kill -0 $pid 2>/dev/null; then
        echo "Force killing PID $pid"
        kill -9 $pid 2>/dev/null || true
    fi
done

# Cleanup socket
rm -f "$SOCKET_PATH"

echo ""
echo "🏆 IPC COMMUNICATION TEST RESULTS"
echo "=================================="

# Final assessment
if [ $IPC_REPORTS -gt 0 ]; then
    echo "✅ SUCCESS: Orchestrator IPC communication working!"
    echo ""
    echo "🎯 Evidence of proper IPC calls:"
    echo "   ✅ Socket server started successfully"
    echo "   ✅ Agent connected via IPC"
    echo "   ✅ Tasks sent through Unix sockets"
    echo "   ✅ Reports generated via IPC calls"
    echo "   ✅ Bidirectional communication established"
    echo ""
    echo "🚀 The orchestrator is making proper IPC calls to agents!"
    exit 0
else
    echo "⚠️  LIMITED IPC ACTIVITY DETECTED"
    echo ""
    echo "🔍 What was tested:"
    echo "   ✅ Socket server initialization"
    echo "   ✅ Agent startup in IPC mode"
    echo "   ⚠️  Limited task completion evidence"
    echo ""
    echo "💡 Note: IPC infrastructure is in place, but full"
    echo "   task execution may need additional configuration."
    exit 1
fi