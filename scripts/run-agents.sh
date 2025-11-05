#!/bin/bash

# CLI Wrapper for Agent System
# Provides unified interface for running different agents

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
AGENT_TIMEOUT=${AGENT_TIMEOUT:-120000}
MAX_CONCURRENT_AGENTS=${MAX_CONCURRENT_AGENTS:-5}

# Source environment variables
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    source "$PROJECT_ROOT/.env"
fi

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check dependencies
check_dependencies() {
    local deps=("docker" "pm2" "curl")

    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            log_error "Dependency '$dep' not found. Please install it first."
            exit 1
        fi
    done

    log_success "All dependencies found"
}

# Check Docker services
check_docker_services() {
    log_info "Checking Docker services..."

    # Check if containers are running
    if ! docker ps | grep -q "agente-memtech"; then
        log_warning "MemTech container not running. Starting Docker services..."
        cd "$PROJECT_ROOT"
        docker-compose up -d
        sleep 10
    fi

    # Check MemTech health
    local memtech_health
    memtech_health=$(curl -s http://localhost:8080/health 2>/dev/null || echo "unhealthy")
    if [[ "$memtech_health" != "unhealthy" ]]; then
        log_success "MemTech service is healthy"
    else
        log_error "MemTech service is not healthy"
        exit 1
    fi
}

# Show help
show_help() {
    cat << EOF
Agent System CLI - Multi-Agent Code Review System

USAGE:
    $0 <AGENT_TYPE> [OPTIONS] [SCOPE]

AGENT TYPES:
    security         Run Security Agent (SAST scanning)
    quality          Run Quality Agent (code quality)
    documentation    Run Documentation Agent (OpenAPI validation)
    architecture     Run Architecture Agent (design patterns)
    pr-reviewer      Run PR Reviewer (meta-agent synthesis)
    full-review      Run complete review with all agents

SCOPE:
    .                Current directory (default)
    <path>           Specific directory or file
    --help, -h       Show this help message

OPTIONS:
    --output FILE    Save results to specified file
    --format json    Output in JSON format
    --verbose        Verbose output
    --timeout N      Set timeout in seconds (default: 120)

EXAMPLES:
    $0 security                    # Security scan current directory
    $0 quality src/               # Quality analysis of src directory
    $0 full-review --verbose      # Complete review with verbose output
    $0 documentation --json       # Documentation validation in JSON

ENVIRONMENT VARIABLES:
    ANTHROPIC_API_KEY    Claude API key
    GLM_API_KEY          GLM-4.6 API key
    AGENT_TIMEOUT        Agent timeout in milliseconds
    MAX_CONCURRENT_AGENTS Maximum concurrent agents

EOF
}

# Run Security Agent
run_security_agent() {
    local scope="${1:-.}"
    local output_file=""
    local format="text"

    # Parse arguments
    shift
    while [[ $# -gt 0 ]]; do
        case $1 in
            --output)
                output_file="$2"
                shift 2
                ;;
            --format)
                format="$2"
                shift 2
                ;;
            *)
                scope="$1"
                shift
                ;;
        esac
    done

    log_info "🔒 Running Security Agent on: $scope"

    # Use PM2 to run the agent
    cd "$PROJECT_ROOT"

    if [[ -n "$output_file" ]]; then
        pm2 start security-agent -- --scope "$scope" --output "$output_file" --format "$format"
    else
        pm2 start security-agent -- --scope "$scope" --format "$format"
    fi

    # Wait for completion and show results
    pm2 logs security-agent --lines 50
    pm2 stop security-agent

    log_success "Security analysis completed"
}

# Run Quality Agent
run_quality_agent() {
    local scope="${1:-.}"
    local output_file=""
    local format="text"

    # Parse arguments
    shift
    while [[ $# -gt 0 ]]; do
        case $1 in
            --output)
                output_file="$2"
                shift 2
                ;;
            --format)
                format="$2"
                shift 2
                ;;
            *)
                scope="$1"
                shift
                ;;
        esac
    done

    log_info "✨ Running Quality Agent on: $scope"

    cd "$PROJECT_ROOT"

    if [[ -n "$output_file" ]]; then
        pm2 start quality-agent -- --scope "$scope" --output "$output_file" --format "$format"
    else
        pm2 start quality-agent -- --scope "$scope" --format "$format"
    fi

    pm2 logs quality-agent --lines 50
    pm2 stop quality-agent

    log_success "Quality analysis completed"
}

# Run Full Review (all agents)
run_full_review() {
    local scope="${1:-.}"
    local output_dir="${2:-obs/reports}"

    log_info "🏁 Running Complete Review on: $scope"
    log_info "Output directory: $output_dir"

    # Create output directory
    mkdir -p "$output_dir"

    cd "$PROJECT_ROOT"

    # Start all agents in parallel (limited concurrency)
    local agents=("security-agent" "quality-agent")
    local timestamp=$(date +%Y%m%d_%H%M%S)

    # Run agents
    for agent in "${agents[@]}"; do
        log_info "Starting $agent..."
        pm2 start "$agent" -- --scope "$scope" --output "$output_dir/${agent}_${timestamp}.json"
    done

    # Wait for completion
    log_info "Waiting for agents to complete..."
    sleep 30

    # Check results
    for agent in "${agents[@]}"; do
        local status
        status=$(pm2 jlist | jq -r ".[] | select(.name==\"$agent\") | .pm2_env.status" 2>/dev/null || echo "unknown")

        if [[ "$status" == "stopped" ]]; then
            log_success "$agent completed successfully"
        else
            log_warning "$agent may still be running"
        fi

        pm2 stop "$agent"
    done

    # Run PR Reviewer to synthesize results
    log_info "📝 Synthesizing results with PR Reviewer..."
    pm2 start pr-reviewer-agent -- --scope "$scope" --input-dir "$output_dir" --output "$output_dir/pr_review_${timestamp}.md"

    pm2 logs pr-reviewer-agent --lines 20
    pm2 stop pr-reviewer-agent

    log_success "Full review completed!"
    log_info "Results saved to: $output_dir"
    log_info "PR Review: $output_dir/pr_review_${timestamp}.md"
}

# Main execution
main() {
    local agent_type="${1:-}"

    # Show help if no arguments or help requested
    if [[ -z "$agent_type" || "$agent_type" == "--help" || "$agent_type" == "-h" ]]; then
        show_help
        exit 0
    fi

    # Check dependencies
    check_dependencies

    # Check Docker services
    check_docker_services

    # Route to appropriate agent
    case "$agent_type" in
        "security")
            shift
            run_security_agent "$@"
            ;;
        "quality")
            shift
            run_quality_agent "$@"
            ;;
        "documentation")
            log_warning "Documentation agent not yet implemented (Phase 3)"
            exit 1
            ;;
        "architecture")
            log_warning "Architecture agent not yet implemented (Phase 3)"
            exit 1
            ;;
        "pr-reviewer")
            log_warning "PR Reviewer not yet implemented (Phase 4)"
            exit 1
            ;;
        "full-review")
            shift
            run_full_review "$@"
            ;;
        *)
            log_error "Unknown agent type: $agent_type"
            show_help
            exit 1
            ;;
    esac
}

# Execute main function with all arguments
main "$@"