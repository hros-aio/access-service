process.env.JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY || 'mock-private-key';

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/node_modules/**',
    '!**/migrations/**',
    '!**/*.module.ts',
    '!**/main.ts',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@new-hros/libs-core(.*)$': '<rootDir>/../node_modules/@new-hros/libs-core$1',
    '^@nestjs/core(.*)$': '<rootDir>/../node_modules/@nestjs/core$1',
    '^@nestjs/common(.*)$': '<rootDir>/../node_modules/@nestjs/common$1',
    '^@nestjs/typeorm(.*)$': '<rootDir>/../node_modules/@nestjs/typeorm$1',
    '^typeorm(.*)$': '<rootDir>/../node_modules/typeorm$1',
  },
};
