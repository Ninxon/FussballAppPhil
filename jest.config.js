module.exports = {
  projects: [
    // Reine TypeScript-Tests (keine React Native Imports) → Node-Umgebung
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
      testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
      transform: {
        '^.+\\.tsx?$': ['babel-jest', { configFile: './babel.config.js' }],
      },
      transformIgnorePatterns: [
        'node_modules/(?!(@supabase))',
      ],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
      setupFiles: ['./jest.setup.unit.ts'],
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
    },
    // React Native / Hook-Tests
    // Laeuft ueber das jest-expo-Preset: React Native bringt seit 0.86 kein
    // eigenes jest/-Verzeichnis mehr mit, die frueher hier direkt eingebundene
    // react-native/jest/setup.js existiert also nicht mehr. Das Preset liefert
    // Environment, Haste-Konfiguration und die Native-Mocks.
    {
      displayName: 'integration',
      preset: 'jest-expo/ios',
      testMatch: ['<rootDir>/src/__tests__/**/*.integration.test.ts?(x)'],
      // Wird an die setupFiles des Presets angehaengt, ersetzt sie nicht.
      setupFiles: ['./jest.setup.ts'],
      setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
    },
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
  ],
};
