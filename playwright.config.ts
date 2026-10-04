import { defineConfig } from '@playwright/test'

// The e2e build always points at a fake Supabase host; tests mock its network.
export const FAKE_SUPABASE = 'https://example.supabase.co'

export default defineConfig({
  testDir: 'e2e',
  // On GitHub, print each failure as an annotation so it can be read without downloading logs.
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://localhost:4173', ...(process.env.PW_TZ ? { timezoneId: process.env.PW_TZ } : {}) },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_SUPABASE_URL: FAKE_SUPABASE, VITE_SUPABASE_ANON_KEY: 'e2e-placeholder' },
  },
})
