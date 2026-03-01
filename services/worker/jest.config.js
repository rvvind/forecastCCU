/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  moduleNameMapper: {
    '^@forecastccu/schema$': '<rootDir>/../../libs/schema/src/index.ts',
  },
  testTimeout: 60000,
};
