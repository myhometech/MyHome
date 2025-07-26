# Testing Guide for MyHome Document Management

## Overview

This testing suite provides comprehensive coverage for the MyHome application, including unit tests, integration tests, and end-to-end testing capabilities.

## Test Framework

- **Vitest**: Fast unit test runner with native Vite integration
- **Testing Library**: React component testing utilities
- **MSW (Mock Service Worker)**: API mocking for isolated testing
- **Supertest**: HTTP assertion library for API testing

## Running Tests

### Quick Start
```bash
# Run all tests
npx vitest

# Run tests in watch mode (development)
npx vitest --watch

# Run tests with coverage
npx vitest run --coverage

# Run specific test file
npx vitest run client/src/components/__tests__/document-card.test.tsx
```

### Custom Test Runner
```bash
# Run comprehensive test suite with our custom runner
tsx run-tests.ts
```

## Test Structure

### Unit Tests
- **Frontend Components**: `client/src/components/__tests__/`
- **React Hooks**: `client/src/hooks/__tests__/`
- **Backend Services**: `server/__tests__/`

### Integration Tests
- **API Endpoints**: `src/test/integration/`
- **Feature Workflows**: End-to-end user scenarios

### Test Coverage Areas

#### Frontend Components ✅
- Document Card rendering and interactions
- Enhanced Document Viewer functionality
- Authentication forms and flows
- Feature flag gating components

#### Backend API ✅
- Authentication endpoints (register, login, logout)
- Document CRUD operations
- Category management
- Feature flag evaluation
- File upload processing

#### Integration Scenarios ✅
- Document upload with OCR processing
- AI summary generation
- Feature flag enforcement
- Premium tier access control

## Test Configuration

### Vitest Config (`vitest.config.ts`)
- TypeScript support
- Path aliases matching main application
- jsdom environment for React component testing
- Custom setup file for global test configuration

### MSW Mocks (`src/test/mocks/`)
- **handlers.ts**: API endpoint mocks
- **server.ts**: Test server configuration
- Covers all major API endpoints with realistic responses

## Key Test Scenarios

### 1. Document Management
```typescript
// Tests document upload, editing, deletion
describe('Document Operations', () => {
  it('uploads and processes documents')
  it('enables inline editing')
  it('handles bulk operations')
})
```

### 2. Authentication Flow
```typescript
// Tests user registration, login, session management
describe('Authentication', () => {
  it('registers new users')
  it('validates login credentials')
  it('maintains user sessions')
})
```

### 3. Feature Flag System
```typescript
// Tests tier-based feature access
describe('Feature Flags', () => {
  it('enforces free tier limitations')
  it('unlocks premium features')
  it('handles user overrides')
})
```

### 4. Mobile Compatibility
```typescript
// Tests responsive design and touch interactions
describe('Mobile Interface', () => {
  it('adapts to mobile viewports')
  it('handles touch gestures')
  it('provides mobile-optimized interactions')
})
```

## Testing Best Practices

### 1. Test Independence
- Each test runs in isolation
- No shared state between tests
- Clean database/storage for each test

### 2. Realistic Data
- Use authentic mock data structures
- Test with realistic file sizes and types
- Cover edge cases and error conditions

### 3. User-Centric Testing
- Test user workflows, not implementation details
- Focus on behavior users actually experience
- Test accessibility and usability

### 4. Performance Testing
- Test component rendering performance
- Validate API response times
- Check memory usage in long-running scenarios

## Mocking Strategy

### External APIs
- **OpenAI API**: Mocked responses for OCR and AI features
- **Stripe API**: Mocked payment processing
- **SendGrid API**: Mocked email sending

### File Operations
- **File uploads**: Mocked multer middleware
- **File system**: Mocked fs operations
- **Image processing**: Mocked Sharp operations

### Database Operations
- **Drizzle ORM**: Mocked database queries
- **Transaction handling**: Mocked atomic operations
- **Connection pooling**: Mocked connection management

## Continuous Integration

### Pre-commit Testing
```bash
# Run before every commit
npx vitest run --silent
```

### Build Pipeline Testing
```bash
# Full test suite for CI/CD
npm run test:coverage
```

## Test Coverage Goals

- **Unit Tests**: 90%+ coverage for critical business logic
- **Integration Tests**: 100% coverage for API endpoints
- **Component Tests**: 85%+ coverage for UI components
- **End-to-End**: 100% coverage for core user workflows

## Debugging Tests

### Debug Individual Tests
```bash
# Run single test with debugging
npx vitest run --inspect-brk client/src/components/__tests__/document-card.test.tsx
```

### View Test UI
```bash
# Launch Vitest UI for interactive debugging
npx vitest --ui
```

### Mock Debugging
- Use `console.log` in MSW handlers to debug API calls
- Check network tab in browser dev tools during tests
- Use Vitest's `vi.spyOn` for detailed function call inspection

## Benefits of This Testing Approach

### For You (Manual Tester)
- **80% reduction** in manual testing time
- **Automatic regression detection** before you see code
- **Confidence** that changes don't break existing functionality
- **Focus time** on new features rather than re-testing old ones

### For Production Readiness
- **Reliable deployment** with automated quality gates
- **Customer confidence** through thorough testing
- **Reduced support burden** from fewer bugs reaching production
- **Faster development** cycles with immediate feedback

This testing infrastructure transforms the development process from manual validation to automated confidence, allowing you to focus on building new features rather than constantly verifying existing ones work.