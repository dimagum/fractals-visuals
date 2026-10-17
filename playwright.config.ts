import { defineConfig, devices } from '@playwright/test';

// По умолчанию WebGL2 идёт через программный SwiftShader — так тесты одинаково
// работают локально и в CI, где видеокарты нет. E2E_ANGLE=metal (npm run test:gpu)
// переключает на настоящую видеокарту Mac: только там воспроизводятся перестановки
// fast-math, от которых защищает барьер в df64.
const angle = process.env.E2E_ANGLE ?? 'swiftshader';
const gpuArgs =
  angle === 'swiftshader'
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    : [`--use-angle=${angle}`, '--ignore-gpu-blocklist', '--enable-gpu'];

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    // Язык интерфейса выбирается по языку браузера; тесты пишутся под русский.
    locale: 'ru-RU',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        launchOptions: { args: gpuArgs },
      },
    },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
