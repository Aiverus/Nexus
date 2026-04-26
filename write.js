const fs = require('fs')

const code = `require('dotenv').config()
const express = require('express')
const path = require('path')
const cloudinary = require('cloudinary').v2
const { Pool } = require('pg')

const app = express()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

app.use(express.static(__dirname))
app.use('/media', express.static(path.join(__dirname, 'media')))
app.use(express.json({ limit: '100mb' }))

app.post('/upload', async (req, res) => {
  try {
    const base64 = req.body.data
    const filename = req.body.filename
    const ext = filename.split('.').pop().toLowerCase()

    let resourceType = 'image'
    if (['mp4', 'webm', 'mov'].includes(ext)) resourceType = 'video'
    if (['mp3', 'wav', 'ogg'].includes(ext)) resourceType = 'raw'

    const result = await cloudinary.uploader.upload(
      'data:application/octet-stream;base64,' + base64,
      {
        public_id: filename.replace(/\.[^.]+$/, ''),
        resource_type: resourceType,
        overwrite: true
      }
    )

    res.json({ success: true, url: result.secure_url })
  } catch (err) {
    console.error('Upload error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/save-pin', async (req, res) => {
  try {
    const { lat, lng, title, description, media } = req.body
    await pool.query(
      'INSERT INTO pins (lat, lng, title, description, media) VALUES ($1, $2, $3, $4, $5)',
      [lat, lng, title, description, JSON.stringify(media || [])]
    )
    res.json({ success: true })
  } catch (err) {
    console.error('Save pin error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/pins', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pins ORDER BY created_at ASC')
    res.json(result.rows)
  } catch (err) {
    console.error('Load pins error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/delete-pin', async (req, res) => {
  try {
    const { lat, lng } = req.body
    await pool.query('DELETE FROM pins WHERE lat = $1 AND lng = $2', [lat, lng])
    res.json({ success: true })
  } catch (err) {
    console.error('Delete pin error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.listen(process.env.PORT || 3000, () => {
  console.log('Server running at http://localhost:3000')
})`

fs.writeFileSync('server.js', code)
console.log('server.js written')