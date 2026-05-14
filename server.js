require('dotenv').config()
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

const MAP_ID = process.env.MAP_ID || 'nexus-v1'

app.use(express.static(__dirname))
app.use('/media', express.static(path.join(__dirname, 'media')))
app.use(express.json({ limit: '100mb' }))

async function migrateDB() {
  await pool.query(`ALTER TABLE pins ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'`)
  await pool.query(`ALTER TABLE pins ADD COLUMN IF NOT EXISTS map_id TEXT DEFAULT 'nexus-v1'`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS concept_nodes (
      id     TEXT,
      label  TEXT NOT NULL,
      body   TEXT DEFAULT '',
      x      DOUBLE PRECISION,
      y      DOUBLE PRECISION,
      map_id TEXT DEFAULT 'nexus-v1',
      PRIMARY KEY (id, map_id)
    )
  `)
  await pool.query(`ALTER TABLE concept_nodes ADD COLUMN IF NOT EXISTS map_id TEXT DEFAULT 'nexus-v1'`)
  console.log('DB migration complete')
}

migrateDB().catch(err => console.error('Migration error:', err))

function slugify(str) {
  return str.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

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
    const { lat, lng, title, description, media, tags } = req.body
    const tagArray = Array.isArray(tags) ? tags : []

    await pool.query(
      'INSERT INTO pins (lat, lng, title, description, media, tags, map_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [lat, lng, title, description, JSON.stringify(media || []), tagArray, MAP_ID]
    )

    for (const tag of tagArray) {
      const id = slugify(tag)
      await pool.query(
        `INSERT INTO concept_nodes (id, label, body, map_id) VALUES ($1, $2, '', $3) ON CONFLICT (id, map_id) DO NOTHING`,
        [id, tag, MAP_ID]
      )
    }

    res.json({ success: true })
  } catch (err) {
    console.error('Save pin error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/pins', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pins WHERE map_id = $1 ORDER BY created_at ASC', [MAP_ID])
    res.json(result.rows)
  } catch (err) {
    console.error('Load pins error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/delete-pin', async (req, res) => {
  try {
    const { id } = req.body
    await pool.query('DELETE FROM pins WHERE id = $1 AND map_id = $2', [id, MAP_ID])
    res.json({ success: true })
  } catch (err) {
    console.error('Delete pin error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/concepts', async (req, res) => {
  try {
    const [nodesRes, pinsRes] = await Promise.all([
      pool.query('SELECT * FROM concept_nodes WHERE map_id = $1 ORDER BY label ASC', [MAP_ID]),
      pool.query('SELECT id, title, lat, lng, tags FROM pins WHERE map_id = $1 ORDER BY created_at ASC', [MAP_ID])
    ])

    const pins  = pinsRes.rows
    const nodes = nodesRes.rows.map(node => ({
      ...node,
      pin_ids: pins
        .filter(p => (p.tags || []).map(slugify).includes(node.id))
        .map(p => p.id)
    }))

    const edges = []
    const edgeSet = new Set()
    for (const pin of pins) {
      const slugged = (pin.tags || []).map(slugify)
      for (let i = 0; i < slugged.length; i++) {
        for (let j = i + 1; j < slugged.length; j++) {
          const key = [slugged[i], slugged[j]].sort().join('||')
          if (!edgeSet.has(key)) {
            edgeSet.add(key)
            edges.push({ source: slugged[i], target: slugged[j] })
          }
        }
      }
    }

    res.json({ nodes, edges, pins })
  } catch (err) {
    console.error('Concepts error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/update-concept', async (req, res) => {
  try {
    const { id, body, x, y } = req.body
    await pool.query(
      'UPDATE concept_nodes SET body=$1, x=$2, y=$3 WHERE id=$4 AND map_id=$5',
      [body ?? '', x ?? null, y ?? null, id, MAP_ID]
    )
    res.json({ success: true })
  } catch (err) {
    console.error('Update concept error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.listen(process.env.PORT || 3000, () => {
  console.log('Nexus running at http://localhost:3000')
})
