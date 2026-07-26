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
    '^@nestjs/core(.*)$': '<rootDir>/../node_modules/@nestjs/core$1',
    '^@nestjs/common(.*)$': '<rootDir>/../node_modules/@nestjs/common$1',
    '^@nestjs/typeorm(.*)$': '<rootDir>/../node_modules/@nestjs/typeorm$1',
    '^typeorm(.*)$': '<rootDir>/../node_modules/typeorm$1',
    '^@new-hros/libs-core$': '<rootDir>/../../../api-factory/libs/libs-core/dist/index.js',
    '^@new-hros/libs-core/(.*)$': '<rootDir>/../../../api-factory/libs/libs-core/dist/$1',
    '^@new-hros/libs-apis$': '<rootDir>/../../../api-factory/libs/libs-apis/dist/index.js',
    '^@new-hros/libs-apis/(.*)$': '<rootDir>/../../../api-factory/libs/libs-apis/dist/$1',
    '^@new-hros/libs-sql$': '<rootDir>/../../../api-factory/libs/libs-sql/dist/index.js',
    '^@new-hros/libs-sql/(.*)$': '<rootDir>/../../../api-factory/libs/libs-sql/dist/$1',
  },
};
