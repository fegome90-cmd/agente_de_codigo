#!/bin/bash

# =============================================================================
# 🔄 Dependency Update Script
# =============================================================================
# Safely updates dependencies while maintaining version constraints
# Author: Felipe
# Version: 1.0.0
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
UPDATE_TYPES=("patch" "minor")
ALLOW_MAJOR=false
CHECK_SECURITY=true
DRY_RUN=false
BACKUP_LOCK=true

# Functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

show_help() {
    cat << EOF
Dependency Update Script

Usage: $0 [OPTIONS]

OPTIONS:
    --types TYPE1,TYPE2      Update types (patch,minor,major) [default: patch,minor]
    --allow-major            Allow major version updates
    --skip-security          Skip security vulnerability check
    --dry-run                Show what would be updated without making changes
    --no-backup             Don't backup lock files before updating
    --help                  Show this help message

EXAMPLES:
    $0                                          # Update patch and minor versions only
    $0 --types patch                            # Update patch versions only
    $0 --types patch,minor,major --allow-major  # Update all versions including major
    $0 --dry-run                               # Preview updates without applying them
EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --types)
            IFS=',' read -ra UPDATE_TYPES <<< "$2"
            shift 2
            ;;
        --allow-major)
            ALLOW_MAJOR=true
            shift
            ;;
        --skip-security)
            CHECK_SECURITY=false
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --no-backup)
            BACKUP_LOCK=false
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate update types
for type in "${UPDATE_TYPES[@]}"; do
    if [[ ! "$type" =~ ^(patch|minor|major)$ ]]; then
        log_error "Invalid update type: $type. Must be one of: patch, minor, major"
        exit 1
    fi
done

log_info "🔄 Dependency Update Script"
log_info "Update types: ${UPDATE_TYPES[*]}"
log_info "Allow major updates: $ALLOW_MAJOR"
log_info "Dry run: $DRY_RUN"
echo

# Check dependencies
if ! command -v pnpm &> /dev/null; then
    log_error "pnpm is not installed"
    exit 1
fi

if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed"
    exit 1
fi

# Backup lock files
if [[ "$BACKUP_LOCK" == true && "$DRY_RUN" == false ]]; then
    log_info "📋 Backing up lock files..."

    backup_dir="backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$backup_dir"

    if [[ -f "pnpm-lock.yaml" ]]; then
        cp pnpm-lock.yaml "$backup_dir/"
        log_success "Backed up pnpm-lock.yaml"
    fi

    if [[ -f "package-lock.json" ]]; then
        cp package-lock.json "$backup_dir/"
        log_success "Backed up package-lock.json"
    fi

    if [[ -f "yarn.lock" ]]; then
        cp yarn.lock "$backup_dir/"
        log_success "Backed up yarn.lock"
    fi

    if [[ -f "poetry.lock" ]]; then
        cp poetry.lock "$backup_dir/"
        log_success "Backed up poetry.lock"
    fi
fi

# Check for security vulnerabilities first
if [[ "$CHECK_SECURITY" == true ]]; then
    log_info "🔒 Checking for current security vulnerabilities..."

    if pnpm audit --audit-level moderate &>/dev/null; then
        log_success "No current security vulnerabilities found"
    else
        log_warning "Security vulnerabilities found!"
        log_info "Run 'pnpm audit --fix' to fix known vulnerabilities"

        if [[ "$DRY_RUN" == false ]]; then
            read -p "Fix security vulnerabilities first? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                log_info "Fixing security vulnerabilities..."
                pnpm audit --fix || true
            fi
        fi
    fi
    echo
fi

# Validate current versions
log_info "✅ Validating current package versions..."
if node scripts/validate-versions.js; then
    log_success "Current versions are valid"
else
    log_warning "Current version validation failed"
    if [[ "$DRY_RUN" == false ]]; then
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi
echo

# Show outdated packages
log_info "📦 Checking for outdated packages..."
outdated_output=$(pnpm outdated --json 2>/dev/null || echo '{}')

if [[ "$outdated_output" == "{}" ]]; then
    log_success "All packages are up to date"
    exit 0
fi

# Parse outdated packages
echo "$outdated_output" | node -e "
const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const allowedTypes = [${UPDATE_TYPES[@]/#/'"'}${UPDATE_TYPES[@]/%/'"}];

function updateType(current, latest) {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);

    if (latestParts[0] > currentParts[0]) return 'major';
    if (latestParts[1] > currentParts[1]) return 'minor';
    if (latestParts[2] > currentParts[2]) return 'patch';
    return 'none';
}

let updates = [];
for (const [name, info] of Object.entries(data)) {
    const type = updateType(info.current, info.latest);
    if (allowedTypes.includes(type) && (type !== 'major' || ${ALLOW_MAJOR})) {
        updates.push({
            name,
            current: info.current,
            latest: info.latest,
            type,
            workspace: info.workspace || false
        });
    }
}

if (updates.length === 0) {
    console.log('No updates available for specified types');
    process.exit(0);
}

console.log('\\n📋 Available Updates:');
updates.forEach(pkg => {
    const typeIcon = pkg.type === 'major' ? '🔴' : pkg.type === 'minor' ? '🟡' : '🟢';
    const workspace = pkg.workspace ? ' (workspace)' : '';
    console.log(\`\${typeIcon} \${pkg.name}\${workspace}: \${pkg.current} → \${pkg.latest} (\${pkg.type})\`);
});
"

# Check if any updates were found
if [[ $? -ne 0 ]]; then
    log_info "No updates available for specified types"
    exit 0
fi

echo

# Ask for confirmation in dry run mode
if [[ "$DRY_RUN" == true ]]; then
    log_info "🔍 DRY RUN MODE - No changes will be made"
    echo
    log_info "To apply these updates, run:"
    echo "  $0 --types ${UPDATE_TYPES[*]}${ALLOW_MAJOR:+ --allow-major}"
    exit 0
fi

# Ask for confirmation
read -p "Proceed with updates? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Update cancelled"
    exit 0
fi

# Perform updates
log_info "🔄 Updating dependencies..."

# Update pnpm lockfile
if [[ -f "pnpm-lock.yaml" ]]; then
    log_info "Updating pnpm dependencies..."

    if [[ "${UPDATE_TYPES[*]}" == *"major"* && "$ALLOW_MAJOR" == true ]]; then
        pnpm update --latest
    else
        # Update only specific types
        for type in "${UPDATE_TYPES[@]}"; do
            case $type in
                patch)
                    pnpm update --depth 0
                    ;;
                minor)
                    pnpm update --depth 1
                    ;;
                major)
                    if [[ "$ALLOW_MAJOR" == true ]]; then
                        log_warning "Major updates require manual review"
                    fi
                    ;;
            esac
        done
    fi

    log_success "pnpm dependencies updated"
fi

# Update Python dependencies if present
if [[ -f "pyproject.toml" ]]; then
    log_info "Updating Python dependencies..."

    if command -v pip &> /dev/null; then
        if [[ -d ".venv" ]]; then
            source .venv/bin/activate
        fi

        # Update pip first
        pip install --upgrade pip

        # Update packages safely
        if [[ "${UPDATE_TYPES[*]}" == *"patch"* ]]; then
            pip list --outdated --format=freeze | grep -v '^\-e' | cut -d = -f 1 | xargs -n1 pip install -U
        fi

        log_success "Python dependencies updated"
    else
        log_warning "pip not available, skipping Python updates"
    fi
fi

echo

# Validate updated versions
log_info "✅ Validating updated package versions..."
if node scripts/validate-versions.js; then
    log_success "Updated versions are valid"
else
    log_error "Updated versions failed validation!"

    if [[ "$BACKUP_LOCK" == true ]]; then
        log_warning "Restoring backup..."
        if [[ -f "$backup_dir/pnpm-lock.yaml" ]]; then
            cp "$backup_dir/pnpm-lock.yaml" ./
            log_success "Restored pnpm-lock.yaml from backup"
        fi
    fi

    exit 1
fi

# Run tests if available
if [[ -f "package.json" ]] && grep -q '"test"' package.json; then
    log_info "🧪 Running tests to ensure updates didn't break anything..."

    if pnpm test; then
        log_success "All tests passed"
    else
        log_warning "Some tests failed after update"

        if [[ "$BACKUP_LOCK" == true ]]; then
            read -p "Restore backup and abort? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                log_warning "Restoring backup..."
                if [[ -f "$backup_dir/pnpm-lock.yaml" ]]; then
                    cp "$backup_dir/pnpm-lock.yaml" ./
                    log_success "Restored pnpm-lock.yaml from backup"
                fi
                exit 1
            fi
        fi
    fi
fi

# Final security check
if [[ "$CHECK_SECURITY" == true ]]; then
    log_info "🔒 Final security check..."

    if pnpm audit --audit-level moderate &>/dev/null; then
        log_success "No security vulnerabilities found after update"
    else
        log_warning "Security vulnerabilities detected after update"
        log_info "Run 'pnpm audit --fix' to address them"
    fi
fi

echo
log_success "🎉 Dependency update completed successfully!"

if [[ "$BACKUP_LOCK" == true ]]; then
    log_info "Backup files are stored in: $backup_dir"
    log_info "Remove with: rm -rf $backup_dir"
fi

echo
log_info "Next steps:"
echo "  1. Review the changes with 'git diff'"
echo "  2. Run your application to ensure everything works"
echo "  3. Commit the updated lock files"
echo
log_info "Commands to run:"
echo "  • git diff                    # Review changes"
echo "  • pnpm start                  # Test application"
echo "  • git add pnpm-lock.yaml     # Stage lock file"
echo "  • git commit -m 'chore: update dependencies'"