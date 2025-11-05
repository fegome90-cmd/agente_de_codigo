#!/usr/bin/env node

/**
 * Version Validation Script
 * Validates that all dependencies meet version requirements and security standards
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import * as https from 'https';
import * as http from 'http';

interface Vulnerability {
  severity: 'low' | 'moderate' | 'high' | 'critical';
  title: string;
  url: string;
}

interface PackageInfo {
  name: string;
  version: string;
  type: 'dependencies' | 'devDependencies' | 'optionalDependencies';
}

interface VersionRule {
  package: string;
  minVersion?: string;
  maxVersion?: string;
  exactVersion?: string;
  blockedVersions?: string[];
  reason: string;
  severity: 'warning' | 'error';
}

class VersionValidator {
  private versionRules: VersionRule[] = [
    // Security-critical packages - exact versions required
    {
      package: 'semgrep',
      exactVersion: '1.78.0',
      reason: 'Security scanning tool - exact version required for consistent results',
      severity: 'error'
    },
    {
      package: 'gitleaks',
      exactVersion: '8.18.4',
      reason: 'Secret scanning tool - exact version required for consistent results',
      severity: 'error'
    },
    {
      package: 'tree-sitter',
      exactVersion: '0.22.4',
      reason: 'AST parser - specific version required for agent compatibility',
      severity: 'error'
    },
    {
      package: 'tree-sitter-python',
      exactVersion: '0.23.6',
      reason: 'Python AST parser - required for architecture agent',
      severity: 'error'
    },
    {
      package: 'tree-sitter-typescript',
      exactVersion: '0.23.2',
      reason: 'TypeScript AST parser - required for type analysis',
      severity: 'error'
    },
    {
      package: 'tree-sitter-javascript',
      exactVersion: '0.23.1',
      reason: 'JavaScript AST parser - required for code analysis',
      severity: 'error'
    },

    // Quality tools - strict version ranges
    {
      package: 'ruff',
      minVersion: '0.1.15',
      maxVersion: '0.2.0',
      reason: 'Python linter - stay within minor version for API stability',
      severity: 'warning'
    },
    {
      package: 'eslint',
      exactVersion: '8.55.0',
      reason: 'JavaScript linter - exact version for consistent rules',
      severity: 'warning'
    },

    // Core dependencies - prevent major version updates
    {
      package: 'typescript',
      minVersion: '5.9.0',
      maxVersion: '5.10.0',
      reason: 'TypeScript compiler - stay within minor version',
      severity: 'warning'
    },
    {
      package: 'axios',
      minVersion: '1.6.2',
      reason: 'HTTP client - minimum version for security patches',
      severity: 'error'
    },

    // Blocked versions with known vulnerabilities
    {
      package: 'lodash',
      blockedVersions: ['<4.17.21'],
      reason: 'Prototype pollution vulnerability',
      severity: 'error'
    },
    {
      package: 'node-forge',
      blockedVersions: ['<1.3.1'],
      reason: 'RSA PKCS#1 signature validation vulnerability',
      severity: 'error'
    },
    {
      package: 'minimist',
      blockedVersions: ['<1.2.8'],
      reason: 'Prototype pollution vulnerability',
      severity: 'error'
    },
    {
      package: 'qs',
      blockedVersions: ['<6.11.2'],
      reason: 'Prototype pollution vulnerability',
      severity: 'error'
    },
    {
      package: 'json5',
      blockedVersions: ['<2.2.3'],
      reason: 'Prototype pollution vulnerability',
      severity: 'error'
    },
    {
      package: 'glob-parent',
      blockedVersions: ['<6.0.2'],
      reason: 'Regular expression denial of service (ReDoS)',
      severity: 'error'
    }
  ];

  public async validateProject(): Promise<void> {
    console.log('🔍 Starting version validation...\n');

    const packageJson = this.readPackageJson();
    if (!packageJson) {
      console.error('❌ package.json not found');
      process.exit(1);
    }

    const packages = this.extractPackages(packageJson);
    console.log(`📦 Found ${packages.length} packages to validate\n`);

    const violations = await this.validateVersions(packages);

    if (violations.length > 0) {
      this.displayViolations(violations);

      const errors = violations.filter(v => v.severity === 'error');
      if (errors.length > 0) {
        console.log(`\n❌ Validation failed with ${errors.length} error(s)`);
        process.exit(1);
      } else {
        console.log(`\n⚠️  Validation completed with ${violations.length} warning(s)`);
      }
    } else {
      console.log('✅ All packages meet version requirements');
    }

    // Check for security vulnerabilities
    await this.checkSecurityVulnerabilities();
  }

  private readPackageJson(): any {
    try {
      const content = readFileSync('package.json', 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error('❌ Error reading package.json:', error);
      return null;
    }
  }

  private extractPackages(packageJson: any): PackageInfo[] {
    const packages: PackageInfo[] = [];

    const extractFromSection = (section: string, type: PackageInfo['type']) => {
      if (packageJson[section]) {
        for (const [name, version] of Object.entries(packageJson[section])) {
          packages.push({
            name,
            version: version as string,
            type
          });
        }
      }
    };

    extractFromSection('dependencies', 'dependencies');
    extractFromSection('devDependencies', 'devDependencies');
    extractFromSection('optionalDependencies', 'optionalDependencies');

    return packages;
  }

  private async validateVersions(packages: PackageInfo[]): Promise<any[]> {
    const violations: any[] = [];

    for (const pkg of packages) {
      const rule = this.versionRules.find(r => r.package === pkg.name);
      if (!rule) continue;

      const violation = this.checkPackageRule(pkg, rule);
      if (violation) {
        violations.push(violation);
      }
    }

    return violations;
  }

  private checkPackageRule(pkg: PackageInfo, rule: VersionRule): any | null {
    const version = pkg.version;

    // Check exact version requirement
    if (rule.exactVersion) {
      if (version !== rule.exactVersion && !version.startsWith(`npm:${rule.exactVersion}@`)) {
        return {
          package: pkg.name,
          currentVersion: version,
          expectedVersion: rule.exactVersion,
          rule: 'exact',
          reason: rule.reason,
          severity: rule.severity,
          type: pkg.type
        };
      }
    }

    // Check minimum version
    if (rule.minVersion && !this.meetsMinVersion(version, rule.minVersion)) {
      return {
        package: pkg.name,
        currentVersion: version,
        expectedVersion: `>= ${rule.minVersion}`,
        rule: 'minVersion',
        reason: rule.reason,
        severity: rule.severity,
        type: pkg.type
      };
    }

    // Check maximum version
    if (rule.maxVersion && !this.meetsMaxVersion(version, rule.maxVersion)) {
      return {
        package: pkg.name,
        currentVersion: version,
        expectedVersion: `<= ${rule.maxVersion}`,
        rule: 'maxVersion',
        reason: rule.reason,
        severity: rule.severity,
        type: pkg.type
      };
    }

    // Check blocked versions
    if (rule.blockedVersions) {
      for (const blocked of rule.blockedVersions) {
        if (this.matchesVersion(version, blocked)) {
          return {
            package: pkg.name,
            currentVersion: version,
            blockedVersion: blocked,
            rule: 'blocked',
            reason: rule.reason,
            severity: rule.severity,
            type: pkg.type
          };
        }
      }
    }

    return null;
  }

  private meetsMinVersion(version: string, minVersion: string): boolean {
    try {
      // Remove npm: prefix if present
      const cleanVersion = version.replace(/^npm:/, '').split('@')[0];
      return this.compareVersions(cleanVersion, minVersion) >= 0;
    } catch {
      return false;
    }
  }

  private meetsMaxVersion(version: string, maxVersion: string): boolean {
    try {
      const cleanVersion = version.replace(/^npm:/, '').split('@')[0];
      return this.compareVersions(cleanVersion, maxVersion) <= 0;
    } catch {
      return false;
    }
  }

  private matchesVersion(version: string, pattern: string): boolean {
    const cleanVersion = version.replace(/^npm:/, '').split('@')[0];

    if (pattern.startsWith('<')) {
      return this.compareVersions(cleanVersion, pattern.substring(1)) < 0;
    } else if (pattern.startsWith('>')) {
      return this.compareVersions(cleanVersion, pattern.substring(1)) > 0;
    } else if (pattern.startsWith('<=')) {
      return this.compareVersions(cleanVersion, pattern.substring(2)) <= 0;
    } else if (pattern.startsWith('>=')) {
      return this.compareVersions(cleanVersion, pattern.substring(2)) >= 0;
    } else {
      return cleanVersion === pattern;
    }
  }

  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    const maxLength = Math.max(aParts.length, bParts.length);

    for (let i = 0; i < maxLength; i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;

      if (aPart > bPart) return 1;
      if (aPart < bPart) return -1;
    }

    return 0;
  }

  private displayViolations(violations: any[]): void {
    console.log(`\n🚨 Version Policy Violations (${violations.length}):\n`);

    for (const violation of violations) {
      const icon = violation.severity === 'error' ? '❌' : '⚠️';
      console.log(`${icon} ${violation.package} (${violation.type})`);
      console.log(`   Current: ${violation.currentVersion}`);
      console.log(`   Expected: ${violation.expectedVersion || violation.blockedVersion}`);
      console.log(`   Rule: ${violation.rule}`);
      console.log(`   Reason: ${violation.reason}\n`);
    }
  }

  private async checkSecurityVulnerabilities(): Promise<void> {
    console.log('🔒 Checking for security vulnerabilities...\n');

    try {
      // Run pnpm audit
      const auditOutput = execSync('pnpm audit --json', {
        encoding: 'utf8',
        stdio: 'pipe'
      });

      const auditResult = JSON.parse(auditOutput);

      if (auditResult.vulnerabilities && Object.keys(auditResult.vulnerabilities).length > 0) {
        console.log('🚨 Security Vulnerabilities Found:\n');

        for (const [pkgName, vuln] of Object.entries(auditResult.vulnerabilities as any)) {
          const vulnerability = vuln as any;
          console.log(`❌ ${pkgName}@${vulnerability.version}`);
          console.log(`   Severity: ${vulnerability.severity}`);
          console.log(`   Title: ${vulnerability.title}`);
          console.log(`   Fix: ${vulnerability.fixAvailable ? 'Available' : 'Not available'}`);
          if (vulnerability.url) {
            console.log(`   URL: ${vulnerability.url}`);
          }
          console.log();
        }

        // Check for critical vulnerabilities
        const criticalVulns = Object.values(auditResult.vulnerabilities as any)
          .filter((v: any) => v.severity === 'critical');

        if (criticalVulns.length > 0) {
          console.log(`❌ Found ${criticalVulns.length} critical vulnerabilities`);
          process.exit(1);
        }
      } else {
        console.log('✅ No security vulnerabilities found');
      }

    } catch (error) {
      // pnpm audit exits with non-zero code if vulnerabilities are found
      try {
        const errorOutput = (error as any).stdout?.toString() || (error as any).stderr?.toString();
        if (errorOutput && errorOutput.includes('{')) {
          const auditResult = JSON.parse(errorOutput);

          if (auditResult.vulnerabilities && Object.keys(auditResult.vulnerabilities).length > 0) {
            console.log('⚠️  Security vulnerabilities detected (audit failed):\n');

            for (const [pkgName, vuln] of Object.entries(auditResult.vulnerabilities as any)) {
              const vulnerability = vuln as any;
              const icon = vulnerability.severity === 'critical' || vulnerability.severity === 'high' ? '❌' : '⚠️';
              console.log(`${icon} ${pkgName}@${vulnerability.version} (${vulnerability.severity})`);
              console.log(`   ${vulnerability.title}`);
            }
          }
        } else {
          console.log('⚠️  Could not run security audit');
        }
      } catch {
        console.log('⚠️  Could not parse security audit results');
      }
    }

    // Check for Python dependencies if pyproject.toml exists
    if (existsSync('pyproject.toml')) {
      await this.checkPythonVulnerabilities();
    }
  }

  private async checkPythonVulnerabilities(): Promise<void> {
    console.log('\n🐍 Checking Python dependencies for vulnerabilities...');

    try {
      // Run safety check
      execSync('safety check --json', {
        encoding: 'utf8',
        stdio: 'pipe'
      });
      console.log('✅ No Python security vulnerabilities found');
    } catch (error) {
      try {
        const errorOutput = (error as any).stdout?.toString() || (error as any).stderr?.toString();
        if (errorOutput) {
          console.log('⚠️  Python security vulnerabilities detected');
          console.log('Run: pip install safety && safety check');
        }
      } catch {
        console.log('⚠️  Could not check Python vulnerabilities');
      }
    }
  }
}

// CLI interface
if (require.main === module) {
  const validator = new VersionValidator();
  validator.validateProject().catch(error => {
    console.error('❌ Version validation failed:', error);
    process.exit(1);
  });
}

export { VersionValidator };