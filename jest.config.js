export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ESNext',
        target: 'ES2022',
        moduleResolution: 'node'
      }
    }]
  },
  testEnvironment: 'node',
  testMatch: ['**/tests/server/**/*.test.ts'],
  collectCoverageFrom: [
    'server/**/*.ts',
    '!server/index.ts',
    '!server/**/*.d.ts'
  ],
  coverageDirectory: 'test-results/coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.js'],
  testTimeout: 30000,
  verbose: true
};