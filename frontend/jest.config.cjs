/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', module: 'commonjs', esModuleInterop: true, isolatedModules: true } }],
  },
  moduleNameMapper: {
    '\\.(css)$': 'identity-obj-proxy',
    '\\.(svg|png|webp|avif)$': '<rootDir>/src/test/file-stub.ts',
  },
  globals: { __API_BASE_URL__: 'http://api.test/api/v1' },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/main.tsx', '!src/test/**', '!src/**/*.d.ts'],
  coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary'],
  coverageThreshold: { global: { branches: 80, functions: 80, lines: 80, statements: 80 } },
};
