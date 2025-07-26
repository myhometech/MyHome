#!/usr/bin/env tsx

/**
 * Test Runner Script for MyHome Document Management System
 * 
 * This script runs all tests using Vitest and provides comprehensive test coverage
 * for both frontend React components and backend API endpoints.
 */

import { spawn } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
}

function log(message: string, color: string = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`)
}

function runCommand(command: string, args: string[] = []): Promise<number> {
  return new Promise((resolve) => {
    log(`\n${COLORS.blue}Running: ${command} ${args.join(' ')}${COLORS.reset}`)
    
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true
    })

    child.on('close', (code) => {
      resolve(code || 0)
    })

    child.on('error', (error) => {
      log(`Error: ${error.message}`, COLORS.red)
      resolve(1)
    })
  })
}

async function checkPrerequisites() {
  log(`${COLORS.bold}Checking test prerequisites...${COLORS.reset}`)
  
  const requiredFiles = [
    'vitest.config.ts',
    'src/test/setup.ts',
    'src/test/mocks/handlers.ts'
  ]

  for (const file of requiredFiles) {
    if (!existsSync(file)) {
      log(`Missing required file: ${file}`, COLORS.red)
      return false
    }
  }

  log('All prerequisites found ✓', COLORS.green)
  return true
}

async function runTests() {
  log(`${COLORS.bold}🧪 MyHome Document Management - Test Suite${COLORS.reset}`)
  log('==========================================\n')

  // Check prerequisites
  if (!(await checkPrerequisites())) {
    process.exit(1)
  }

  // Run different test suites
  const testSuites = [
    {
      name: 'Unit Tests - Frontend Components',
      command: 'npx',
      args: ['vitest', 'run', 'client/src/components/**/*.test.{ts,tsx}', '--reporter=verbose']
    },
    {
      name: 'Unit Tests - React Hooks',
      command: 'npx',
      args: ['vitest', 'run', 'client/src/hooks/**/*.test.{ts,tsx}', '--reporter=verbose']
    },
    {
      name: 'Unit Tests - Backend Services',
      command: 'npx',
      args: ['vitest', 'run', 'server/**/*.test.{ts,tsx}', '--reporter=verbose']
    },
    {
      name: 'Integration Tests',
      command: 'npx',
      args: ['vitest', 'run', 'src/test/integration/**/*.test.{ts,tsx}', '--reporter=verbose']
    }
  ]

  let totalFailures = 0

  for (const suite of testSuites) {
    log(`\n${COLORS.bold}Running: ${suite.name}${COLORS.reset}`)
    log('='.repeat(50))
    
    const exitCode = await runCommand(suite.command, suite.args)
    
    if (exitCode === 0) {
      log(`✓ ${suite.name} - PASSED`, COLORS.green)
    } else {
      log(`✗ ${suite.name} - FAILED`, COLORS.red)
      totalFailures++
    }
  }

  // Generate coverage report
  log(`\n${COLORS.bold}Generating Coverage Report...${COLORS.reset}`)
  await runCommand('npx', ['vitest', 'run', '--coverage', '--reporter=verbose'])

  // Summary
  log(`\n${COLORS.bold}Test Summary${COLORS.reset}`)
  log('='.repeat(30))
  
  if (totalFailures === 0) {
    log(`🎉 All test suites passed! System is ready for production.`, COLORS.green)
    process.exit(0)
  } else {
    log(`❌ ${totalFailures} test suite(s) failed. Please review and fix issues.`, COLORS.red)
    process.exit(1)
  }
}

// Run the tests
runTests().catch((error) => {
  log(`Fatal error: ${error.message}`, COLORS.red)
  process.exit(1)
})