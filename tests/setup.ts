// Setup executado ANTES de cada arquivo de teste importar server/database.
// Define env vars e isola o banco de dados num arquivo temporário.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const TEST_DB_DIR = path.join(__dirname, '.tmp')
if (!fs.existsSync(TEST_DB_DIR)) fs.mkdirSync(TEST_DB_DIR, { recursive: true })

// Cada arquivo de teste recebe um DB próprio (carimbado pelo timestamp).
// Isso evita cross-contamination quando rodar em paralelo no futuro.
const TEST_DB_PATH = path.join(
  TEST_DB_DIR,
  `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`,
)

process.env.NODE_ENV = 'test'
process.env.DB_PATH = TEST_DB_PATH
process.env.JWT_SECRET = 'test-jwt-secret-only-for-vitest-never-in-prod'
process.env.APP_URL = 'http://localhost:3000'
process.env.SEED_ADMIN_PASSWORD = 'lucas123'
process.env.SEED_VIVIAN_PASSWORD = 'vivian123'
process.env.SEED_SUPERVISOR_PASSWORD = 'super123'
process.env.SEED_RH_PASSWORD = 'rh1234'
process.env.SEED_MIGUEL_PASSWORD = 'miguel123'
process.env.SEED_ANNA_PASSWORD = 'anna1234'

// Cleanup na saída do processo
process.on('exit', () => {
  try {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH)
  } catch { /* ignore */ }
})
