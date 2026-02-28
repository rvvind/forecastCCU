/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.integration.spec.ts'],
  moduleNameMapper: {
    '^@forecastccu/schema$': '<rootDir>/../../libs/schema/src/index.ts',
  },
  globalSetup: '<rootDir>/test/setup.ts',
  globalTeardown: '<rootDir>/test/teardown.ts',
  testTimeout: 30000,
};
