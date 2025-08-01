// Jest setup file
import '@testing-library/jest-dom'

// Mock environment variables for testing
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = ':memory:'
process.env.JWT_SECRET = 'test-jwt-secret-key-at-least-32-characters-long'
process.env.ENCRYPTION_MASTER_KEY = 'test-encryption-key-at-least-32-characters-long'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'

// Mock console methods in tests to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

// Global test utilities
global.createTestData = (overrides = {}) => ({
  id: 'test-id',
  name: 'Test Item',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

// Cleanup function for tests
global.cleanupTest = async () => {
  // Reset all mocks
  jest.clearAllMocks()
  jest.resetAllMocks()
  
  // Add any cleanup logic here
}

// Setup timeout for async tests
jest.setTimeout(30000)