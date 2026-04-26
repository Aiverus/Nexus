const fs = require('fs')

const code = `require('dotenv').config()
const express = require('express')
const fs2 = require('fs')
const path = require('path')
const cloudinary = require('cloudinary').v2
const app = express()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

app.use(express.static(__dirname))
app.use('/media', express.static(path.join(__dirname, 'media')))
app.use(express.json({ limit: '50mb' }))

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

app.post('/save-pin', (req, res) => {
  try {
    const raw = fs2.readFileSync('data.json', 'utf8').replace(/^\uFEFF/, '')
    const pins = JSON.parse(raw)
    pins.push(req.body)
    fs2.writeFileSync('data.json', JSON.stringify(pins, null, 2), 'utf8')
    res.json({ success: true })
  } catch (err) {
    console.error('Save pin error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/pins', (req, res) => {
  try {
    const raw = fs2.readFileSync('data.json', 'utf8').replace(/^\uFEFF/, '')
    const pins = JSON.parse(raw)
    res.json(pins)
  } catch (err) {
    console.error('Load pins error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/delete-pin', (req, res) => {
  try {
    const { lat, lng } = req.body
    const raw = fs2.readFileSync('data.json', 'utf8').replace(/^\uFEFF/, '')
    let pins = JSON.parse(raw)
    pins = pins.filter(p => p.lat !== lat || p.lng !== lng)
    fs2.writeFileSync('data.json', JSON.stringify(pins, null, 2), 'utf8')
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