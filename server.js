import express from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000
const distPath = path.join(__dirname, 'dist')
const indexPath = path.join(distPath, 'index.html')

// Health check
app.get('/health', (req, res) => {
  res.status(200).send('ok')
})

// Check dist exists
if (!fs.existsSync(indexPath)) {
  console.error('ERROR: dist/index.html not found! Build may have failed.')
  console.error('Files in project root:', fs.readdirSync(__dirname).join(', '))
}

app.use(express.static(distPath))

// SPA fallback — all routes serve index.html
app.use((req, res) => {
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath)
  } else {
    res.status(500).send('Build artifacts not found. Check deploy logs.')
  }
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Órion Escala running on port ${PORT}`)
  console.log(`Serving from: ${distPath}`)
  console.log(`index.html exists: ${fs.existsSync(indexPath)}`)
})
