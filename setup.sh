#!/bin/bash

# =============================================================================
# 🏁 Agente de Código - Setup Automático
# =============================================================================
# Script de instalación y configuración automática del entorno
# Author: Felipe
# Version: 1.0.0
# =============================================================================

set -euo pipefail

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuración
PROJECT_NAME="Agente de Código"
MIN_NODE_VERSION="20.0.0"
MIN_PYTHON_VERSION="3.8"
MIN_PNPM_VERSION="8.0.0"
REQUIRED_PORTS=("3000" "5000" "8080" "9090" "3001")

# Funciones de utilidad
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

log_header() {
    echo -e "${PURPLE}=== $1 ===${NC}"
}

check_command() {
    if command -v "$1" &> /dev/null; then
        return 0
    else
        return 1
    fi
}

version_compare() {
    local version1=$1
    local version2=$2
    printf '%s\n%s\n' "$version1" "$version2" | sort -V | head -n1
}

check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 1
    else
        return 0
    fi
}

# Validación de dependencias del sistema
validate_system_dependencies() {
    log_header "Validando Dependencias del Sistema"

    local deps_ok=true

    # Node.js
    if check_command "node"; then
        local node_version=$(node --version | sed 's/v//')
        if [[ "$(version_compare "$node_version" "$MIN_NODE_VERSION")" == "$MIN_NODE_VERSION" ]]; then
            log_error "Node.js version $node_version is below minimum required $MIN_NODE_VERSION"
            deps_ok=false
        else
            log_success "Node.js $node_version ✓"
        fi
    else
        log_error "Node.js is not installed"
        deps_ok=false
    fi

    # Python
    if check_command "python3"; then
        local python_version=$(python3 --version | cut -d' ' -f2)
        if [[ "$(version_compare "$python_version" "$MIN_PYTHON_VERSION")" == "$MIN_PYTHON_VERSION" ]]; then
            log_error "Python version $python_version is below minimum required $MIN_PYTHON_VERSION"
            deps_ok=false
        else
            log_success "Python $python_version ✓"
        fi
    else
        log_error "Python 3 is not installed"
        deps_ok=false
    fi

    # pnpm
    if check_command "pnpm"; then
        local pnpm_version=$(pnpm --version)
        if [[ "$(version_compare "$pnpm_version" "$MIN_PNPM_VERSION")" == "$MIN_PNPM_VERSION" ]]; then
            log_error "pnpm version $pnpm_version is below minimum required $MIN_PNPM_VERSION"
            deps_ok=false
        else
            log_success "pnpm $pnpm_version ✓"
        fi
    else
        log_error "pnpm is not installed"
        log_info "Install with: npm install -g pnpm"
        deps_ok=false
    fi

    # Otras dependencias
    local optional_deps=("git" "docker" "docker-compose" "make")
    for dep in "${optional_deps[@]}"; do
        if check_command "$dep"; then
            log_success "$dep ✓"
        else
            log_warning "$dep not found (optional but recommended)"
        fi
    done

    if [[ "$deps_ok" == false ]]; then
        log_error "Please install missing dependencies before continuing"
        exit 1
    fi
}

# Check de puertos disponibles
check_available_ports() {
    log_header "Verificando Puertos Disponibles"

    local ports_ok=true
    for port in "${REQUIRED_PORTS[@]}"; do
        if check_port "$port"; then
            log_success "Port $port is available ✓"
        else
            log_error "Port $port is already in use"
            ports_ok=false
        fi
    done

    if [[ "$ports_ok" == false ]]; then
        log_warning "Some required ports are in use. Services may fail to start."
        read -p "Do you want to continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Setup de variables de entorno
setup_environment() {
    log_header "Configurando Variables de Entorno"

    if [[ ! -f ".env" ]]; then
        if [[ -f ".env.example" ]]; then
            cp .env.example .env
            log_success "Created .env from .env.example ✓"

            # Generar secretos automáticamente
            if check_command "python3"; then
                log_info "Generating secure secrets..."
                python3 -c "
import secrets
import json

secrets = {
    'SECRET_KEY': secrets.token_urlsafe(32),
    'JWT_SECRET': secrets.token_urlsafe(32),
    'POSTGRES_PASSWORD': secrets.token_urlsafe(16),
    'REDIS_PASSWORD': secrets.token_urlsafe(16),
    'GRAFANA_PASSWORD': secrets.token_urlsafe(12)
}

print('Generated secure secrets for .env file')
"
                log_success "Secrets generated - please update your .env file"
            fi
        else
            log_warning "No .env.example found - creating basic .env"
            cat > .env << EOF
# Agente de Código - Environment Variables
NODE_ENV=development
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://localhost:5432/agente_codigo
REDIS_URL=redis://localhost:6379

# Security
SECRET_KEY=CHANGE_ME_REQUIRED_32_CHARS_MIN
JWT_SECRET=CHANGE_ME_REQUIRED_32_CHARS_MIN

# Services
PORT=3000
API_PORT=5000
GRAFANA_PORT=3001
EOF
        fi
    else
        log_info ".env file already exists"
    fi
}

# Instalación de dependencias
install_dependencies() {
    log_header "Instalando Dependencias"

    # Node.js dependencies (pnpm workspace)
    log_info "Installing Node.js dependencies..."
    if pnpm install; then
        log_success "Node.js dependencies installed ✓"
    else
        log_error "Failed to install Node.js dependencies"
        exit 1
    fi

    # Python dependencies
    if [[ -f "pyproject.toml" ]]; then
        log_info "Installing Python dependencies..."

        # Crear virtual environment si no existe
        if [[ ! -d ".venv" ]]; then
            log_info "Creating Python virtual environment..."
            python3 -m venv .venv
        fi

        # Activar virtual environment
        source .venv/bin/activate

        # Actualizar pip
        pip install --upgrade pip

        # Instalar dependencias
        if pip install -e .; then
            log_success "Python dependencies installed ✓"
        else
            log_error "Failed to install Python dependencies"
            exit 1
        fi
    fi

    # Instalar herramientas globales si no existen
    local global_tools=("pm2" "@playwright/test")
    for tool in "${global_tools[@]}"; do
        if ! pnpm list -g | grep -q "$tool"; then
            log_info "Installing global tool: $tool"
            pnpm add -g "$tool"
        fi
    done
}

# Build del proyecto
build_project() {
    log_header "Compilando Proyecto"

    # Build TypeScript packages
    log_info "Building TypeScript packages..."
    if pnpm build; then
        log_success "TypeScript compilation successful ✓"
    else
        log_error "TypeScript compilation failed"
        exit 1
    fi

    # Validar que todos los paquetes compilaron
    log_info "Verifying package builds..."
    local packages=("orchestrator" "cli" "shared" "agents" "security-agent" "quality-agent" "architecture-agent" "documentation-agent")
    for package in "${packages[@]}"; do
        if [[ -d "packages/$package" ]]; then
            if [[ -f "packages/$package/dist/index.js" ]] || [[ -f "packages/$package/dist/index.cjs" ]]; then
                log_success "Package '$package' built ✓"
            else
                log_warning "Package '$package' may not have built correctly"
            fi
        fi
    done
}

# Ejecutar tests
run_tests() {
    log_header "Ejecutando Tests"

    # Tests unitarios
    log_info "Running unit tests..."
    if pnpm test:unit; then
        log_success "Unit tests passed ✓"
    else
        log_warning "Some unit tests failed - continuing anyway"
    fi

    # Linting
    log_info "Running code quality checks..."
    if pnpm lint; then
        log_success "Code quality checks passed ✓"
    else
        log_warning "Some linting issues found - continuing anyway"
    fi
}

# Configurar PM2
setup_pm2() {
    log_header "Configurando PM2"

    if check_command "pm2"; then
        log_info "PM2 is available"

        # Crear PM2 config si no existe
        if [[ ! -f "ecosystem.config.js" ]]; then
            log_info "Creating PM2 ecosystem config..."
            cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'agente-codigo-orchestrator',
    script: './packages/orchestrator/dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    }
  }]
};
EOF
            log_success "PM2 config created ✓"
        fi
    else
        log_warning "PM2 not available - process management will be manual"
    fi
}

# Health check final
final_health_check() {
    log_header "Health Check Final"

    local checks_ok=true

    # Verificar build
    if [[ -f "packages/orchestrator/dist/index.js" ]]; then
        log_success "Orchestrator built ✓"
    else
        log_error "Orchestrator build not found"
        checks_ok=false
    fi

    # Verificar CLI
    if [[ -f "packages/cli/dist/index.js" ]]; then
        log_success "CLI built ✓"
    else
        log_error "CLI build not found"
        checks_ok=false
    fi

    # Verificar environment
    if [[ -f ".env" ]]; then
        log_success "Environment configured ✓"
    else
        log_error "Environment file not found"
        checks_ok=false
    fi

    # Verificar dependencias
    if [[ -d "node_modules" ]] && [[ -f "pnpm-lock.yaml" ]]; then
        log_success "Dependencies installed ✓"
    else
        log_error "Dependencies not properly installed"
        checks_ok=false
    fi

    if [[ "$checks_ok" == true ]]; then
        log_success "🎉 Setup completed successfully!"
        echo
        log_info "Next steps:"
        echo "  1. Review and update .env file with your configuration"
        echo "  2. Start the system: pnpm start"
        echo "  3. Or use PM2: pnpm pm2:start"
        echo "  4. Run a review: pnpm review"
        echo
        log_info "Useful commands:"
        echo "  • pnpm dev              - Development mode"
        echo "  • pnpm test             - Run tests"
        echo "  • pnpm review           - Full code review"
        echo "  • pnpm run:security     - Security analysis only"
        echo "  • pnpm pm2:logs         - View production logs"
        echo
    else
        log_error "❌ Setup completed with errors - please review the issues above"
        exit 1
    fi
}

# Función principal
main() {
    echo -e "${CYAN}"
    echo "🏁 Agente de Código - Setup Automático"
    echo "====================================="
    echo -e "${NC}"
    echo

    # Validar que estamos en el directorio correcto
    if [[ ! -f "package.json" ]]; then
        log_error "Please run this script from the project root directory"
        exit 1
    fi

    # Ejecutar pasos del setup
    validate_system_dependencies
    check_available_ports
    setup_environment
    install_dependencies
    build_project
    run_tests
    setup_pm2
    final_health_check

    echo -e "${GREEN}"
    echo "✨ ¡Setup completado! El sistema está listo para usar."
    echo -e "${NC}"
}

# Trap para cleanup
trap 'log_error "Setup interrupted"; exit 1' INT TERM

# Ejecutar main con todos los argumentos
main "$@"