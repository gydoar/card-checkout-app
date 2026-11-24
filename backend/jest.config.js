/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  collectCoverageFrom: [
    'src/**/*.ts',
    // Puntos de arranque y wiring sin lógica: se validan con el despliegue, no con unit tests
    '!src/main.ts',
    '!src/lambda.ts',
    '!src/migrate.lambda.ts',
    '!src/**/*.module.ts',
    '!src/**/migrations/**',
    '!src/infrastructure/persistence/typeorm/data-source.ts',
    '!src/infrastructure/persistence/seed/run-seed.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
};
