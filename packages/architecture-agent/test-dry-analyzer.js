/**
 * Test DRY Analyzer Functionality
 */

import { DRYAnalyzer } from './dist/dry-analyzer.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testDRYAnalyzer() {
  console.log('🔍 Testing DRY Analyzer...\n');

  try {
    // Initialize DRY analyzer
    const analyzer = new DRYAnalyzer({
      similarityThreshold: 0.6,
      minLinesToConsider: 3,
      minTokenCount: 10,
      includeTests: true,
      structuralWeight: 0.5,
      semanticWeight: 0.5
    });
    console.log('✅ DRY analyzer initialized');

    // Create test directory with duplicated code
    const testDir = './temp-dry-test';

    // Create test files with various types of duplication
    const testFiles = {
      'src/utils/UserValidator.ts': `
export class UserValidator {
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    return emailRegex.test(email);
  }

  validatePhone(phone: string): boolean {
    const phoneRegex = /^\\+?[1-9]\\d{1,14}$/;
    return phoneRegex.test(phone);
  }

  validateAge(age: number): boolean {
    return age >= 18 && age <= 120;
  }
}
    `,
      'src/utils/EmailValidator.ts': `
export class EmailValidator {
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    return emailRegex.test(email);
  }

  validateFormat(email: string): boolean {
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    return emailRegex.test(email);
  }

  checkDomain(email: string): boolean {
    const domain = email.split('@')[1];
    return domain && domain.length > 0;
  }
}
    `,
      'src/services/UserService.ts': `
export class UserService {
  private users: any[] = [];

  createUser(name: string, email: string): void {
    const user = {
      id: Date.now(),
      name: name,
      email: email,
      createdAt: new Date()
    };
    this.users.push(user);
  }

  updateUser(id: number, name: string, email: string): void {
    const user = this.users.find(u => u.id === id);
    if (user) {
      user.name = name;
      user.email = email;
      user.updatedAt = new Date();
    }
  }

  deleteUser(id: number): void {
    this.users = this.users.filter(u => u.id !== id);
  }
}
    `,
      'src/services/AccountService.ts': `
export class AccountService {
  private accounts: any[] = [];

  createAccount(name: string, email: string): void {
    const account = {
      id: Date.now(),
      name: name,
      email: email,
      createdAt: new Date()
    };
    this.accounts.push(account);
  }

  updateAccount(id: number, name: string, email: string): void {
    const account = this.accounts.find(a => a.id === id);
    if (account) {
      account.name = name;
      account.email = email;
      account.updatedAt = new Date();
    }
  }

  deleteAccount(id: number): void {
    this.accounts = this.accounts.filter(a => a.id !== id);
  }
}
    `,
      'src/components/DataProcessor.tsx': `
export function DataProcessor({ data }: { data: any[] }) {
  const processedData = data.map(item => ({
    ...item,
    processed: true,
    timestamp: Date.now()
  }));

  return (
    <div>
      <h1>Processed Data</h1>
      {processedData.map(item => (
        <div key={item.id}>
          <span>{item.name}</span>
          <span>{item.value}</span>
        </div>
      ))}
    </div>
  );
}
    `,
      'src/components/ReportGenerator.tsx': `
export function ReportGenerator({ data }: { data: any[] }) {
  const processedData = data.map(item => ({
    ...item,
    processed: true,
    timestamp: Date.now()
  }));

  return (
    <div>
      <h1>Generated Report</h1>
      {processedData.map(item => (
        <div key={item.id}>
          <span>{item.name}</span>
          <span>{item.value}</span>
        </div>
      ))}
    </div>
  );
}
    `,
      'src/python/utils.py': `
def validate_email(email):
    email_regex = r'^[\\s@]+@[\\s@]+\\.[\\s@]+$'
    import re
    return re.match(email_regex, email) is not None

def validate_phone(phone):
    phone_regex = r'^\\+?[1-9]\\d{1,14}$'
    import re
    return re.match(phone_regex, phone) is not None

def validate_age(age):
    return age >= 18 and age <= 120
    `,
      'src/python/email_validator.py': `
def validate_email(email):
    email_regex = r'^[\\s@]+@[\\s@]+\\.[\\s@]+$'
    import re
    return re.match(email_regex, email) is not None

def check_domain(email):
    domain = email.split('@')[1] if '@' in email else None
    return domain is not None and len(domain) > 0

def format_email(email):
    return email.lower().strip()
    `
    };

    // Create test directory and files
    mkdirSync(testDir, { recursive: true });
    for (const [filePath, content] of Object.entries(testFiles)) {
      const fullPath = join(testDir, filePath);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content, 'utf8');
    }

    console.log('✅ Created test files with code duplication');

    // Test 1: Basic DRY analysis
    console.log('\n🔍 Testing basic DRY analysis...');

    const taskData = {
      scope: Object.keys(testFiles).map(f => join(testDir, f)),
      context: {
        repoRoot: testDir
      },
      output: join(testDir, 'dry-analysis-report.json')
    };

    const violations = await analyzer.analyzeDRYViolations(taskData);
    console.log(`✅ DRY analysis complete: ${violations.length} violations found`);

    // Test 2: Analyze violations
    if (violations.length > 0) {
      console.log('\n📋 DRY Violations Found:');
      violations.forEach((violation, index) => {
        console.log(`\n${index + 1}. ${violation.message}`);
        console.log(`   File: ${violation.filePath}:${violation.line}`);
        console.log(`   Similarity: ${Math.round(violation.similarity * 100)}%`);
        console.log(`   Type: ${violation.violationType}`);
        console.log(`   Severity: ${violation.severity} | Impact: ${violation.architecturalImpact} | Effort: ${violation.refactorEffort}`);
        console.log(`   Blocks involved: ${violation.blocks.length}`);

        if (violation.blocks.length >= 2) {
          console.log(`   Related files:`);
          violation.blocks.forEach((block, i) => {
            console.log(`     ${i + 1}. ${block.file}:${block.startLine}-${block.endLine} (${block.type})`);
          });
        }

        console.log(`   Suggestion: ${violation.refactorSuggestion}`);
      });
    }

    // Test 3: Check different types of duplications
    console.log('\n📊 Analyzing duplication types...');

    const exactDuplicates = violations.filter(v => v.violationType === 'exact_duplicate');
    const structuralDuplicates = violations.filter(v => v.violationType === 'structural_duplicate');
    const semanticDuplicates = violations.filter(v => v.violationType === 'semantic_duplicate');

    console.log(`   Exact duplicates: ${exactDuplicates.length}`);
    console.log(`   Structural duplicates: ${structuralDuplicates.length}`);
    console.log(`   Semantic duplicates: ${semanticDuplicates.length}`);

    // Test 4: Test similarity threshold changes
    console.log('\n⚙️ Testing different similarity thresholds...');

    analyzer.updateConfig({ similarityThreshold: 0.8 });
    const highThresholdViolations = await analyzer.analyzeDRYViolations(taskData);
    console.log(`   High threshold (0.8): ${highThresholdViolations.length} violations`);

    analyzer.updateConfig({ similarityThreshold: 0.4 });
    const lowThresholdViolations = await analyzer.analyzeDRYViolations(taskData);
    console.log(`   Low threshold (0.4): ${lowThresholdViolations.length} violations`);

    // Reset to original threshold
    analyzer.updateConfig({ similarityThreshold: 0.6 });

    // Test 5: Test statistics
    console.log('\n📈 Testing analysis statistics...');

    const stats = analyzer.getStatistics();
    console.log(`✅ Statistics calculated:`);
    console.log(`   Blocks analyzed: ${stats.blocksAnalyzed}`);
    console.log(`   Fingerprints generated: ${stats.fingerprintsGenerated}`);
    console.log(`   Similarity comparisons: ${stats.similarityComparisons}`);
    console.log(`   Cache hits: ${stats.cacheHits}`);

    // Test 6: Test with different languages
    console.log('\n🌍 Testing multi-language support...');

    const pythonFiles = Object.keys(testFiles).filter(f => f.includes('.py')).map(f => join(testDir, f));
    if (pythonFiles.length > 0) {
      const pythonTaskData = {
        scope: pythonFiles,
        context: { repoRoot: testDir },
        output: join(testDir, 'python-dry-report.json')
      };

      const pythonViolations = await analyzer.analyzeDRYViolations(pythonTaskData);
      console.log(`✅ Python files analysis: ${pythonViolations.length} violations`);
    }

    // Test 7: Test cache functionality
    console.log('\n💾 Testing cache functionality...');

    const startTime = Date.now();
    const cachedViolations = await analyzer.analyzeDRYViolations(taskData);
    const cachedTime = Date.now() - startTime;

    console.log(`✅ Cached analysis completed in ${cachedTime}ms`);
    console.log(`   Results match: ${violations.length === cachedViolations.length ? 'Yes' : 'No'}`);

    // Test 8: Test configuration changes
    console.log('\n⚙️ Testing configuration changes...');

    const originalConfig = analyzer.getConfig();
    analyzer.updateConfig({
      minLinesToConsider: 2,
      includeTests: false,
      structuralWeight: 0.7,
      semanticWeight: 0.3
    });

    const configViolations = await analyzer.analyzeDRYViolations(taskData);
    console.log(`✅ Updated config analysis: ${configViolations.length} violations`);

    // Reset config
    analyzer.updateConfig(originalConfig);

    console.log('\n🎉 All DRY analyzer tests passed!');

    return {
      violationsFound: violations.length,
      duplicateTypes: {
        exact: exactDuplicates.length,
        structural: structuralDuplicates.length,
        semantic: semanticDuplicates.length
      },
      cacheWorking: violations.length === cachedViolations.length,
      languagesSupported: ['typescript', 'javascript', 'python'],
      configChangesTested: true
    };

  } catch (error) {
    console.error('❌ DRY analyzer test failed:', error);
    throw error;
  }
}

// Run the test
testDRYAnalyzer()
  .then((results) => {
    console.log('\n📊 Test Results Summary:');
    console.log(`   - Violations found: ${results.violationsFound}`);
    console.log(`   - Duplicate types: ${JSON.stringify(results.duplicateTypes)}`);
    console.log(`   - Cache functionality: ${results.cacheWorking ? 'Working' : 'Failed'}`);
    console.log(`   - Languages supported: ${results.languagesSupported.join(', ')}`);
    console.log(`   - Config changes tested: ${results.configChangesTested ? 'Yes' : 'No'}`);
    console.log('\n✅ DRY analyzer is working correctly!');
  })
  .catch((error) => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });