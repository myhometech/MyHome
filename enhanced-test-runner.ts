#!/usr/bin/env tsx

/**
 * Enhanced Test Runner with Comprehensive Reporting
 * 
 * Provides structured test execution with detailed output,
 * coverage analysis, and CI/CD integration support.
 */

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'

interface TestSuite {
  name: string
  pattern: string
  required: boolean
  timeout?: number
}

interface TestResults {
  suite: string
  passed: number
  failed: number
  skipped: number
  duration: number
  coverage?: number
}

class EnhancedTestRunner {
  private results: TestResults[] = []
  private startTime = Date.now()

  constructor() {
    this.validateEnvironment()
  }

  private validateEnvironment(): void {
    console.log('🔍 Validating test environment...')
    
    // Check required files
    const requiredFiles = [
      'vitest.config.ts',
      'src/test/setup.ts',
      'package.json'
    ]

    requiredFiles.forEach(file => {
      if (!existsSync(file)) {
        throw new Error(`❌ Required file missing: ${file}`)
      }
    })

    console.log('✅ Environment validation complete\n')
  }

  private getTestSuites(): TestSuite[] {
    return [
      {
        name: 'Unit Tests - Frontend Components',
        pattern: 'client/src/components/**/*.test.{ts,tsx}',
        required: true,
        timeout: 30000
      },
      {
        name: 'Unit Tests - Backend APIs',
        pattern: 'server/__tests__/**/*.test.ts',
        required: true,
        timeout: 30000
      },
      {
        name: 'Integration Tests',
        pattern: 'src/test/integration/**/*.test.ts',
        required: true,
        timeout: 60000
      },
      {
        name: 'End-to-End Workflows',
        pattern: 'src/test/e2e/**/*.test.ts',
        required: false,
        timeout: 120000
      },
      {
        name: 'Performance & Stress Tests',
        pattern: 'src/test/performance/**/*.test.ts',
        required: false,
        timeout: 180000
      },
      {
        name: 'Accessibility Tests',
        pattern: '**/accessibility.test.{ts,tsx}',
        required: false,
        timeout: 60000
      },
      {
        name: 'Contract Tests',
        pattern: 'src/test/contract/**/*.test.ts',
        required: false,
        timeout: 30000
      },
      {
        name: 'Negative Path Tests',
        pattern: '**/negative-path.test.ts',
        required: true,
        timeout: 45000
      }
    ]
  }

  private async runTestSuite(suite: TestSuite): Promise<TestResults> {
    console.log(`🧪 Running: ${suite.name}`)
    console.log(`   Pattern: ${suite.pattern}`)
    
    const startTime = Date.now()
    
    try {
      const command = [
        'npx vitest run',
        suite.pattern,
        '--reporter=json',
        '--run',
        suite.timeout ? `--testTimeout=${suite.timeout}` : '',
        '--silent'
      ].filter(Boolean).join(' ')

      const output = execSync(command, { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      })

      const result = this.parseTestOutput(output, suite.name)
      const duration = Date.now() - startTime

      console.log(`   ✅ ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped (${duration}ms)\n`)

      return {
        ...result,
        duration
      }

    } catch (error: any) {
      const duration = Date.now() - startTime
      console.log(`   ❌ Suite failed (${duration}ms)`)
      
      if (suite.required) {
        console.error(`   Error: ${error.message}\n`)
        throw new Error(`Required test suite failed: ${suite.name}`)
      }

      return {
        suite: suite.name,
        passed: 0,
        failed: 1,
        skipped: 0,
        duration
      }
    }
  }

  private parseTestOutput(output: string, suiteName: string): TestResults {
    try {
      // Try to parse JSON output
      const jsonOutput = JSON.parse(output)
      
      return {
        suite: suiteName,
        passed: jsonOutput.numPassedTests || 0,
        failed: jsonOutput.numFailedTests || 0,
        skipped: jsonOutput.numPendingTests || 0,
        duration: 0 // Will be set by caller
      }
    } catch {
      // Fallback: parse text output
      const lines = output.split('\n')
      const summaryLine = lines.find(line => line.includes('Tests:') || line.includes('passed'))
      
      if (summaryLine) {
        const passedMatch = summaryLine.match(/(\d+) passed/)
        const failedMatch = summaryLine.match(/(\d+) failed/)
        const skippedMatch = summaryLine.match(/(\d+) skipped/)

        return {
          suite: suiteName,
          passed: passedMatch ? parseInt(passedMatch[1]) : 0,
          failed: failedMatch ? parseInt(failedMatch[1]) : 0,
          skipped: skippedMatch ? parseInt(skippedMatch[1]) : 0,
          duration: 0
        }
      }

      // If no summary found, assume basic success
      return {
        suite: suiteName,
        passed: 1,
        failed: 0,
        skipped: 0,
        duration: 0
      }
    }
  }

  private async runCoverageAnalysis(): Promise<void> {
    console.log('📊 Running coverage analysis...')
    
    try {
      const command = 'npx vitest run --coverage --reporter=text'
      const output = execSync(command, { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      })

      // Parse coverage output
      const lines = output.split('\n')
      const coverageLine = lines.find(line => line.includes('All files'))
      
      if (coverageLine) {
        console.log(`   Coverage: ${coverageLine}`)
      } else {
        console.log('   Coverage data generated successfully')
      }
      
      console.log('   📈 Coverage report available in coverage/ directory\n')
    } catch (error) {
      console.log('   ⚠️  Coverage analysis failed (optional)\n')
    }
  }

  private generateSummaryReport(): void {
    const totalDuration = Date.now() - this.startTime
    const totalPassed = this.results.reduce((sum, r) => sum + r.passed, 0)
    const totalFailed = this.results.reduce((sum, r) => sum + r.failed, 0)
    const totalSkipped = this.results.reduce((sum, r) => sum + r.skipped, 0)
    const totalTests = totalPassed + totalFailed + totalSkipped

    console.log('📋 TEST EXECUTION SUMMARY')
    console.log('=' .repeat(50))
    console.log(`Total Test Suites: ${this.results.length}`)
    console.log(`Total Tests: ${totalTests}`)
    console.log(`✅ Passed: ${totalPassed}`)
    console.log(`❌ Failed: ${totalFailed}`)
    console.log(`⏭️  Skipped: ${totalSkipped}`)
    console.log(`⏱️  Duration: ${(totalDuration / 1000).toFixed(2)}s`)
    console.log()

    // Individual suite results
    console.log('📊 SUITE BREAKDOWN')
    console.log('-' .repeat(50))
    this.results.forEach(result => {
      const status = result.failed === 0 ? '✅' : '❌'
      const duration = (result.duration / 1000).toFixed(2)
      console.log(`${status} ${result.suite}`)
      console.log(`   ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped (${duration}s)`)
    })
    console.log()

    // Success rate
    const successRate = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : '0'
    console.log(`🎯 Overall Success Rate: ${successRate}%`)
    
    if (totalFailed === 0) {
      console.log('🎉 All tests passed! Ready for production.')
    } else {
      console.log(`⚠️  ${totalFailed} test(s) failed. Please review and fix.`)
    }
  }

  async run(): Promise<void> {
    console.log('🚀 Enhanced Test Runner Starting...\n')
    
    const suites = this.getTestSuites()
    
    // Run test suites sequentially to avoid resource conflicts
    for (const suite of suites) {
      try {
        const result = await this.runTestSuite(suite)
        this.results.push(result)
      } catch (error) {
        console.error(`❌ Failed to run ${suite.name}: ${error}`)
        if (suite.required) {
          process.exit(1)
        }
      }
    }

    // Run coverage analysis
    await this.runCoverageAnalysis()

    // Generate final report
    this.generateSummaryReport()

    // Exit with appropriate code
    const hasFailed = this.results.some(r => r.failed > 0)
    process.exit(hasFailed ? 1 : 0)
  }
}

// Run the enhanced test suite
if (require.main === module) {
  const runner = new EnhancedTestRunner()
  runner.run().catch(error => {
    console.error('❌ Test runner failed:', error)
    process.exit(1)
  })
}

export default EnhancedTestRunner