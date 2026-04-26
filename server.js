const express = require('express')
const fs2 = require('fs')
const path = require('path')
const app = express()

app.use(express.static(__dirname))
app.use('/media', express.static(path.join(__dirname, 'media')))
app.use(express.json({ limit: '50mb' }))

app.post('/upload', (req, res) => {
  const base64 = req.body.data
  const filename = req.body.filename
  const buffer = Buffer.from(base64, 'base64')
  const filepath = path.join(__dirname, 'media', filename)
  fs2.writeFileSync(filepath, buffer)
  res.json({ success: true })
})

app.post('/save-pin', (req, res) => {
  const raw = fs2.readFileSync('data.json', 'utf8').replace(/^﻿/, '')
  const pins = JSON.parse(raw)
  pins.push(req.body)
  fs2.writeFileSync('data.json', JSON.stringify(pins, null, 2), 'utf8')
  res.json({ success: true })
})

app.get('/pins', (req, res) => {
  const raw = fs2.readFileSync('data.json', 'utf8').replace(/^﻿/, '')
  const pins = JSON.parse(raw)
  res.json(pins)
})

app.post('/delete-pin', (req, res) => {
  const { lat, lng } = req.body
  const raw = fs2.readFileSync('data.json', 'utf8').replace(/^﻿/, '')
  let pins = JSON.parse(raw)
  pins = pins.filter(p => p.lat !== lat || p.lng !== lng)
  fs2.writeFileSync('data.json', JSON.stringify(pins, null, 2), 'utf8')
  res.json({ success: true })
})

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000')
})