#!/usr/bin/env python3
"""
Unix Socket IPC Client for Python Agents
F1 Pit Stop Architecture - Communication layer between agents and orchestrator
"""

import socket
import json
import time
import threading
import signal
import sys
import os
from typing import Dict, Any, Optional, Callable
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [IPC_CLIENT]: %(message)s",
    handlers=[logging.StreamHandler(), logging.FileHandler("/tmp/pit-crew-agent.log")],
)

logger = logging.getLogger(__name__)


@dataclass
class IPCMessage:
    """IPC message structure"""

    id: str
    type: str  # 'task', 'event', 'heartbeat', 'ping', 'pong'
    agent: Optional[str] = None
    timestamp: str = ""
    data: Optional[Dict[str, Any]] = None

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now(timezone.utc).isoformat()


class SocketClient:
    """Unix socket client for agent communication"""

    def __init__(self, socket_path: str, agent_name: str):
        self.socket_path = socket_path
        self.agent_name = agent_name
        self.socket: Optional[socket.socket] = None
        self.is_connected = False
        self.is_running = False
        self.active_tasks: Dict[str, Dict[str, Any]] = {}
        self.heartbeat_interval = 30  # seconds (reduced from 5 to 30)
        self.reconnect_interval = 10  # seconds (increased from 2 to 10)
        self.max_reconnect_attempts = 30  # increased from 10 to 30
        self.max_active_tasks = (
            10  # NEW: Limit concurrent tasks to prevent memory leaks
        )

        # Thread management for proper cleanup
        self.heartbeat_thread: Optional[threading.Thread] = None
        self.listen_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()  # NEW: Explicit stop event for threads

        # Connection health monitoring and metrics
        self.connection_metrics = {
            "connect_count": 0,
            "disconnect_count": 0,
            "reconnect_count": 0,
            "last_connect_time": 0,
            "total_connected_duration": 0,
            "average_connection_duration": 0,
            "failed_connections": 0,
            "heartbeat_success_count": 0,
            "heartbeat_failure_count": 0,
        }
        self._connection_start_time: Optional[float] = None

        # Callbacks for message handling
        self.message_handlers: Dict[str, Callable] = {
            "task": self._handle_task,
            "ping": self._handle_ping,
            "pong": self._handle_pong,
        }

        # Setup signal handlers
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

        logger.info(f"Socket client initialized for agent {agent_name}")

    def connect(self) -> bool:
        """Connect to the orchestrator socket"""
        try:
            self.socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self.socket.settimeout(60)  # 60 second timeout

            self.socket.connect(self.socket_path)
            self.is_connected = True
            self._connection_start_time = time.time()

            # Update connection metrics
            self.connection_metrics["connect_count"] += 1
            self.connection_metrics["last_connect_time"] = self._connection_start_time
            logger.info(f"Connected to orchestrator via {self.socket_path}")

            # Send registration message
            self._send_registration()

            return True

        except (socket.error, OSError) as e:
            logger.error(f"Failed to connect to orchestrator: {e}")
            self.is_connected = False
            return False

    def disconnect(self):
        """Disconnect from the orchestrator"""
        if self.socket:
            # Track connection duration before disconnecting
            if self._connection_start_time:
                connection_duration = time.time() - self._connection_start_time
                self.connection_metrics["total_connected_duration"] += (
                    connection_duration
                )

                # Update average connection duration
                if self.connection_metrics["disconnect_count"] > 0:
                    total_disconnects = self.connection_metrics["disconnect_count"]
                    self.connection_metrics["average_connection_duration"] = (
                        self.connection_metrics["total_connected_duration"]
                        / total_disconnects
                    )

            try:
                # Shutdown socket before closing
                try:
                    self.socket.shutdown(socket.SHUT_RDWR)
                except (OSError, socket.error):
                    pass  # Socket might already be closed

                self.socket.close()
            except (OSError, socket.error) as e:
                logger.error(f"Error closing socket: {e}")
            except Exception as e:
                logger.error(f"Unexpected error closing socket: {e}")
            finally:
                self.socket = None

        # Update connection metrics
        self.connection_metrics["disconnect_count"] += 1
        self._connection_start_time = None
        self.is_connected = False
        logger.info("Disconnected from orchestrator")

    def __del__(self):
        """Cleanup on object destruction"""
        try:
            if hasattr(self, "is_running") and self.is_running:
                self.stop()
            elif hasattr(self, "socket") and self.socket:
                try:
                    self.disconnect()
                except Exception:
                    pass  # Don't raise exceptions in __del__
        except Exception:
            pass  # Silence all errors in __del__

    def start(self):
        """Start the client with automatic reconnection and heartbeat"""
        if self.is_running:
            logger.warning("Client already running")
            return

        self.is_running = True
        logger.info(f"Starting client for agent {self.agent_name}")

        # Reset stop event
        self._stop_event.clear()

        # Start heartbeat thread (store reference for proper cleanup)
        self.heartbeat_thread = threading.Thread(
            target=self._heartbeat_loop,
            daemon=False,  # Changed from daemon=True to allow proper cleanup
        )
        self.heartbeat_thread.start()
        logger.debug(f"Heartbeat thread started: {self.heartbeat_thread.name}")

        # Start message listening thread (store reference for proper cleanup)
        self.listen_thread = threading.Thread(
            target=self._listen_loop,
            daemon=False,  # Changed from daemon=True to allow proper cleanup
        )
        self.listen_thread.start()
        logger.debug(f"Listen thread started: {self.listen_thread.name}")

        # Main loop (runs in main thread)
        self._main_loop()

    def stop(self):
        """Stop the client"""
        logger.info("Stopping client")
        self.is_running = False

        # Signal threads to stop
        self._stop_event.set()

        # Clean up threads with proper termination and joining
        threads_joined = 0
        max_join_timeout = 5  # seconds

        # Store thread references before clearing them
        threads_to_clean = [
            ("heartbeat", self.heartbeat_thread),
            ("listen", self.listen_thread),
        ]

        # Clear thread references early to prevent new references
        self.heartbeat_thread = None
        self.listen_thread = None

        # Join threads after clearing references
        for thread_name, thread in threads_to_clean:
            if thread and thread.is_alive():
                logger.debug(f"Waiting for {thread_name} thread to finish...")
                try:
                    thread.join(timeout=max_join_timeout)
                    if thread.is_alive():
                        logger.warning(
                            f"{thread_name} thread did not stop within {max_join_timeout}s"
                        )
                    else:
                        threads_joined += 1
                        logger.debug(f"{thread_name} thread stopped successfully")
                except Exception as e:
                    logger.error(f"Error joining {thread_name} thread: {e}")

        logger.info(f"Stopped {threads_joined} threads")

        self.disconnect()

    def send_message(self, message: IPCMessage) -> bool:
        """Send a message to the orchestrator"""
        if not self.is_connected or not self.socket:
            logger.error("Not connected to orchestrator")
            return False

        try:
            # Add agent name if not present
            if not message.agent:
                message.agent = self.agent_name

            # Ensure timestamp
            if not message.timestamp:
                message.timestamp = datetime.now(timezone.utc).isoformat()

            message_data = json.dumps(asdict(message)) + "\n"
            self.socket.send(message_data.encode("utf-8"))

            logger.debug(f"Message sent: {message.type} (id: {message.id})")
            return True

        except (socket.error, OSError, json.JSONEncodeError) as e:
            logger.error(f"Failed to send message: {e}")
            self.is_connected = False
            return False

    def send_task_response(
        self,
        task_id: str,
        status: str,
        results: Dict[str, Any],
        duration_ms: Optional[int] = None,
    ) -> bool:
        """Send task completion response"""
        message = IPCMessage(
            id=task_id,
            type="task",
            data={
                "status": status,
                "results": results,
                "duration_ms": duration_ms,
                "agent": self.agent_name,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

        # Remove from active tasks
        if task_id in self.active_tasks:
            del self.active_tasks[task_id]

        return self.send_message(message)

    def send_event(self, event_type: str, data: Dict[str, Any]) -> bool:
        """Send an event message"""
        message = IPCMessage(
            id=f"event-{int(time.time())}",
            type="event",
            data={
                "type": event_type,
                "agent": self.agent_name,
                "status": "active",
                **data,
            },
        )
        return self.send_message(message)

    def add_message_handler(self, message_type: str, handler: Callable):
        """Add a custom message handler"""
        self.message_handlers[message_type] = handler

    def _send_registration(self):
        """Send registration message"""
        registration_data = {
            "agent": self.agent_name,
            "pid": os.getpid(),
            "version": "1.0.0",
            "capabilities": self._get_capabilities(),
        }

        message = IPCMessage(id="registration", type="event", data=registration_data)

        self.send_message(message)

    def _get_capabilities(self) -> Dict[str, Any]:
        """Get agent capabilities (to be overridden by subclasses)"""
        return {
            "supports_heartbeat": True,
            "supports_tasks": True,
            "supports_events": True,
        }

    def _cleanup_timed_out_tasks(self):
        """Clean up tasks that have exceeded their timeout"""
        current_time = time.time()
        timed_out_tasks = []

        for task_id, task_info in self.active_tasks.items():
            start_time = task_info.get("start_time", current_time)
            timeout = task_info.get("timeout", 300)  # Default 5 minutes

            if current_time - start_time > timeout:
                timed_out_tasks.append(task_id)
                logger.warning(f"Task {task_id} timed out after {timeout}s")

        # Remove timed out tasks
        for task_id in timed_out_tasks:
            if task_id in self.active_tasks:
                del self.active_tasks[task_id]
                # Send timeout response
                self.send_task_response(
                    task_id,
                    "timeout",
                    {"error": f"Task exceeded {timeout}s timeout", "task_id": task_id},
                )

    def _heartbeat_loop(self):
        """Send periodic heartbeat messages"""
        logger.debug("Heartbeat loop started")
        consecutive_errors = 0
        max_consecutive_errors = 5

        while not self._stop_event.is_set():
            try:
                # Reset error count on successful iteration
                consecutive_errors = 0

                # Clean up timed out tasks first
                self._cleanup_timed_out_tasks()

                if self.is_connected:
                    heartbeat_data = {
                        "agent": self.agent_name,
                        "pid": os.getpid(),
                        "status": "idle" if not self.active_tasks else "busy",
                        "active_tasks": len(self.active_tasks),
                        "active_tasks_limit": self.max_active_tasks,
                        "uptime": time.time(),
                    }

                    message = IPCMessage(
                        id=f"heartbeat-{int(time.time())}",
                        type="heartbeat",
                        data=heartbeat_data,
                    )

                    self.send_message(message)

                # Use wait with timeout instead of sleep for responsive shutdown
                self._stop_event.wait(self.heartbeat_interval)

            except Exception as e:
                consecutive_errors += 1
                logger.error(f"Heartbeat error (count: {consecutive_errors}): {e}")

                # If too many consecutive errors, stop the thread
                if consecutive_errors >= max_consecutive_errors:
                    logger.error(
                        f"Too many heartbeat errors ({consecutive_errors}), stopping thread"
                    )
                    break

                # Wait before retry
                if not self._stop_event.is_set():
                    self._stop_event.wait(1)  # Wait 1 second before retry

        logger.debug("Heartbeat loop ended")

    def _listen_loop(self):
        """Listen for incoming messages"""
        logger.debug("Listen loop started")
        consecutive_errors = 0
        max_consecutive_errors = 5

        while not self._stop_event.is_set():
            try:
                # Reset error count on successful iteration
                consecutive_errors = 0

                if not self.is_connected:
                    # Wait for connection with stop event support
                    self._stop_event.wait(1)
                    continue

                # Set socket timeout to allow responsive shutdown
                if self.socket:
                    self.socket.settimeout(
                        1.0
                    )  # 1 second timeout for responsive shutdown

                try:
                    # Receive data with timeout
                    data = self.socket.recv(4096)
                    if not data:
                        logger.warning("Connection closed by orchestrator")
                        self.is_connected = False
                        continue

                    # Process message
                    try:
                        message_str = data.decode("utf-8").strip()
                        if not message_str:
                            continue

                        messages = message_str.split("\n")
                        for msg in messages:
                            if msg.strip():
                                self._process_message(msg.strip())

                    except (json.JSONDecodeError, UnicodeDecodeError) as e:
                        logger.error(f"Failed to parse message: {e}")

                except socket.timeout:
                    # Timeout is expected, just continue
                    pass
                except (socket.error, OSError) as e:
                    logger.error(f"Listen error: {e}")
                    self.is_connected = False
                    # Brief pause before retry
                    if not self._stop_event.is_set():
                        self._stop_event.wait(1)

            except Exception as e:
                consecutive_errors += 1
                logger.error(f"Listen loop error (count: {consecutive_errors}): {e}")

                # If too many consecutive errors, stop the thread
                if consecutive_errors >= max_consecutive_errors:
                    logger.error(
                        f"Too many listen errors ({consecutive_errors}), stopping thread"
                    )
                    break

                # Brief pause before retry
                if not self._stop_event.is_set():
                    self._stop_event.wait(1)

        logger.debug("Listen loop ended")

    def _process_message(self, message_str: str):
        """Process incoming message"""
        try:
            message_data = json.loads(message_str)
            message = IPCMessage(**message_data)

            logger.debug(f"Message received: {message.type} (id: {message.id})")

            # Route to appropriate handler
            handler = self.message_handlers.get(message.type)
            if handler:
                handler(message)
            else:
                logger.warning(f"No handler for message type: {message.type}")

        except Exception as e:
            logger.error(f"Error processing message: {e}")

    def _handle_task(self, message: IPCMessage):
        """Handle task message from orchestrator"""
        if not message.data:
            logger.error("Task message missing data")
            return

        task_data = message.data
        task_id = message.id

        logger.info(f"Received task: {task_id}")

        # Check if we've exceeded max active tasks
        if len(self.active_tasks) >= self.max_active_tasks:
            logger.error(
                f"Max active tasks ({self.max_active_tasks}) reached, rejecting task {task_id}"
            )
            self.send_task_response(
                task_id,
                "rejected",
                {
                    "error": f"Agent overloaded: {len(self.active_tasks)}/{self.max_active_tasks} tasks running"
                },
            )
            return

        # Store active task
        self.active_tasks[task_id] = {
            "task_data": task_data,
            "start_time": time.time(),
            "timeout": task_data.get(
                "timeout_seconds", 300
            ),  # Default 5 minutes timeout
        }

        # Call abstract task handler
        try:
            # Create an async event loop if needed
            import asyncio

            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # If loop is already running, create task
                    asyncio.create_task(self.handle_task(task_id, task_data))
                else:
                    # Run the async function
                    loop.run_until_complete(self.handle_task(task_id, task_data))
            except RuntimeError:
                # No event loop, create new one
                asyncio.run(self.handle_task(task_id, task_data))
        except Exception as e:
            logger.error(f"Task handler failed: {e}")
            self.send_task_response(task_id, "failed", {"error": str(e)})

    def _handle_ping(self, message: IPCMessage):
        """Handle ping message"""
        pong_message = IPCMessage(
            id=f"pong-{message.id}",
            type="pong",
            data={
                "agent": self.agent_name,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "uptime": time.time(),
            },
        )
        self.send_message(pong_message)

    def _handle_pong(self, message: IPCMessage):
        """Handle pong response"""
        if message.data and "server_time" in message.data:
            server_time = message.data["server_time"]
            client_time = time.time()
            latency = client_time - server_time
            logger.debug(f"Server latency: {latency:.3f}s")

    async def handle_task(self, task_id: str, task_data: Dict[str, Any]):
        """Abstract method to handle tasks (to be implemented by subclasses)"""
        logger.error("handle_task must be implemented by subclass")
        self.send_task_response(
            task_id, "failed", {"error": "handle_task not implemented"}
        )

    def _main_loop(self):
        """Main connection loop with reconnection and exponential backoff"""
        reconnect_attempts = 0
        base_reconnect_interval = self.reconnect_interval
        max_reconnect_interval = 60  # Cap at 60 seconds

        while self.is_running:
            if not self.is_connected:
                if reconnect_attempts >= self.max_reconnect_attempts:
                    logger.error(
                        f"Max reconnection attempts ({self.max_reconnect_attempts}) reached"
                    )
                    logger.error("Agent will stop. Check orchestrator availability.")
                    break

                # Calculate backoff with exponential increase
                current_interval = min(
                    base_reconnect_interval * (2**reconnect_attempts),
                    max_reconnect_interval,
                )

                logger.info(
                    f"Attempting to connect (attempt {reconnect_attempts + 1}/{self.max_reconnect_attempts})"
                )
                logger.info(f"Next retry in {current_interval}s")

                if self.connect():
                    reconnect_attempts = 0
                    base_reconnect_interval = (
                        self.reconnect_interval
                    )  # Reset on success
                    logger.info("Connection established")
                else:
                    reconnect_attempts += 1
                    time.sleep(current_interval)
                    continue

            # Connection is alive - just sleep to prevent busy-wait
            time.sleep(1)

        logger.info("Main loop ended")

    def get_connection_stats(self) -> Dict[str, Any]:
        """Get connection health statistics"""
        current_connection_duration = (
            time.time() - self._connection_start_time
            if self._connection_start_time and self.is_connected
            else 0
        )

        stats = self.connection_metrics.copy()
        stats["current_connection_duration"] = current_connection_duration
        stats["is_connected"] = self.is_connected
        stats["connection_uptime_percent"] = (
            (stats["total_connected_duration"] + current_connection_duration)
            / max(time.time() - (stats["last_connect_time"] or time.time()), 1)
            * 100
            if stats["last_connect_time"]
            else 0
        )
        stats["heartbeat_success_rate"] = (
            stats["heartbeat_success_count"]
            / max(
                stats["heartbeat_success_count"] + stats["heartbeat_failure_count"], 1
            )
            * 100
        )

        return stats

    def _signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        logger.info(f"Received signal {signum}, shutting down")
        self.stop()
        sys.exit(0)


# Example usage
if __name__ == "__main__":
    # Example client for testing
    client = SocketClient("/tmp/pit-crew-orchestrator.sock", "test-agent")

    try:
        client.start()
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        client.stop()
