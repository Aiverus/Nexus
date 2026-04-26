const map = L.map('map', { zoomControl: true }).setView([21.0285, 105.8542], 13)

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map)

let allPins = []
let unlockedCount = 1
let activeMarkers = []
let lines = []
let selectedLat = null
let selectedLng = null
let tempMarker = null
let currentPinIndex = null
let selectedFiles = []

const RED = '#c0392b'
const RED_DIM = '#7b1a1a'
const WHITE = '#ffffff'

// ── Sidebar expand toggle ────────────────────────────────────────

function toggleExpand() {
  const sidebar = document.getElementById('sidebar')
  const btn = document.getElementById('expand-btn')
  sidebar.classList.toggle('expanded')
  btn.textContent = sidebar.classList.contains('expanded') ? '⤡ Collapse' : '⤢ Expand'
}

// ── File preview on selection ────────────────────────────────────

document.getElementById('input-file').addEventListener('change', (e) => {
  selectedFiles = Array.from(e.target.files)
  const list = document.getElementById('media-preview-list')
  list.innerHTML = ''

  selectedFiles.forEach((file, i) => {
    const item = document.createElement('div')
    item.className = 'media-preview-item'

    const ext = file.name.split('.').pop().toLowerCase()
    const url = URL.createObjectURL(file)

    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      const img = document.createElement('img')
      img.src = url
      item.appendChild(img)
    } else if (['mp4', 'webm', 'mov'].includes(ext)) {
      const video = document.createElement('video')
      video.src = url
      video.controls = true
      item.appendChild(video)
    } else if (['mp3', 'wav', 'ogg'].includes(ext)) {
      const audio = document.createElement('audio')
      audio.src = url
      audio.controls = true
      item.appendChild(audio)
    }

    const caption = document.createElement('input')
    caption.type = 'text'
    caption.placeholder = 'Caption for this media...'
    caption.dataset.index = i
    item.appendChild(caption)

    list.appendChild(item)
  })
})

// ── Markers ──────────────────────────────────────────────────────

function makeMarker(pin, index, unlocked) {
  const marker = L.circleMarker([pin.lat, pin.lng], {
    radius: 9,
    color: WHITE,
    fillColor: unlocked ? RED : '#333',
    fillOpacity: unlocked ? 1 : 0.4,
    weight: 2,
    opacity: unlocked ? 1 : 0.3
  }).addTo(map)

  marker.bindTooltip(pin.title || 'Untitled', {
    permanent: false,
    direction: 'top',
    className: 'pin-tooltip'
  })

  marker.on('click', () => {
    if (index < unlockedCount) {
      map.flyTo([pin.lat, pin.lng], map.getZoom(), { duration: 0.8 })
      setTimeout(() => showDetail(pin, index), 400)
    }
  })

  activeMarkers[index] = marker
  return marker
}

// ── Animated line ────────────────────────────────────────────────

function drawAnimatedLine(fromPin, toPin, onComplete) {
  const from = L.latLng(fromPin.lat, fromPin.lng)
  const to = L.latLng(toPin.lat, toPin.lng)

  const baseLine = L.polyline([from, to], {
    color: RED_DIM,
    weight: 1.5,
    opacity: 0.4,
    dashArray: '6 6'
  }).addTo(map)

  lines.push(baseLine)

  const steps = 60
  let step = 0

  const dot = L.circleMarker(from, {
    radius: 5,
    color: RED,
    fillColor: '#ff6b6b',
    fillOpacity: 1,
    weight: 0
  }).addTo(map)

  const interval = setInterval(() => {
    step++
    const t = step / steps
    const lat = fromPin.lat * (1 - t) + toPin.lat * t
    const lng = fromPin.lng * (1 - t) + toPin.lng * t
    dot.setLatLng([lat, lng])

    if (step >= steps) {
      clearInterval(interval)
      map.removeLayer(dot)
      map.removeLayer(baseLine)
      lines.pop()

      const solidLine = L.polyline([from, to], {
        color: RED,
        weight: 2,
        opacity: 0.85
      }).addTo(map)

      lines.push(solidLine)
      if (onComplete) onComplete()
    }
  }, 18)
}

// ── Render media stack in sidebar ────────────────────────────────

function renderMediaStack(mediaItems) {
  const stack = document.createElement('div')
  stack.className = 'media-stack'

  // Handle legacy pins with single filename string
  if (!mediaItems || mediaItems.length === 0) return stack

  mediaItems.forEach(item => {
    const url = item.url || item
    const caption = item.caption || ''
    const ext = url.split('.').pop().split('?')[0].toLowerCase()

    const wrap = document.createElement('div')
    wrap.className = 'media-stack-item'

    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      const img = document.createElement('img')
      img.src = url
      wrap.appendChild(img)
    } else if (['mp4', 'webm', 'mov'].includes(ext)) {
      const video = document.createElement('video')
      video.src = url
      video.controls = true
      wrap.appendChild(video)
    } else if (['mp3', 'wav', 'ogg'].includes(ext)) {
      const audio = document.createElement('audio')
      audio.src = url
      audio.controls = true
      wrap.appendChild(audio)
    }

    if (caption) {
      const cap = document.createElement('p')
      cap.className = 'media-caption'
      cap.textContent = caption
      wrap.appendChild(cap)
    }

    stack.appendChild(wrap)
  })

  return stack
}

// ── Detail sidebar ───────────────────────────────────────────────

function showDetail(pin, index) {
  currentPinIndex = index

  document.getElementById('form-section').style.display = 'none'
  document.getElementById('detail-section').style.display = 'block'

  document.getElementById('detail-title').textContent = pin.title || 'Untitled'
  document.getElementById('detail-description').innerHTML = pin.description
    .split('\n')
    .map(line => line.trim() === '' ? '<br>' : `<p>${line}</p>`)
    .join('')
  document.getElementById('detail-coords').textContent = `${pin.lat}, ${pin.lng}`

  // Media stack
  const wrap = document.getElementById('detail-media-wrap')
  wrap.innerHTML = ''

  // Support both new media array and legacy single filename
  if (pin.media && pin.media.length > 0) {
    wrap.appendChild(renderMediaStack(pin.media))
  } else if (pin.filename) {
    wrap.appendChild(renderMediaStack([{ url: pin.filename.startsWith('http') ? pin.filename : '/media/' + pin.filename, caption: '' }]))
  }

  // Clear old buttons
  const oldNav = document.getElementById('nav-row')
  if (oldNav) oldNav.remove()
  const oldDel = document.getElementById('delete-btn')
  if (oldDel) oldDel.remove()

  // Navigation row
  const navRow = document.createElement('div')
  navRow.id = 'nav-row'
  navRow.className = 'nav-row'

  if (index > 0) {
    const backBtn = document.createElement('button')
    backBtn.textContent = '← Back'
    backBtn.className = 'nav-btn back'
    backBtn.addEventListener('click', () => {
      const prevPin = allPins[index - 1]
      map.flyTo([prevPin.lat, prevPin.lng], map.getZoom(), { duration: 0.8 })
      setTimeout(() => showDetail(prevPin, index - 1), 400)
    })
    navRow.appendChild(backBtn)
  }

  if (index < allPins.length - 1) {
    const isNextLocked = index === unlockedCount - 1

    const fwdBtn = document.createElement('button')
    fwdBtn.textContent = isNextLocked ? 'Continue →' : 'Next →'
    fwdBtn.className = isNextLocked ? 'nav-btn unlock' : 'nav-btn forward'

    fwdBtn.addEventListener('click', () => {
      if (isNextLocked) {
        unlockNext(index)
        fwdBtn.remove()
      } else {
        const nextPin = allPins[index + 1]
        map.flyTo([nextPin.lat, nextPin.lng], map.getZoom(), { duration: 0.8 })
        setTimeout(() => showDetail(nextPin, index + 1), 400)
      }
    })

    navRow.appendChild(fwdBtn)
  }

  document.getElementById('detail-section').appendChild(navRow)

  // Delete button
  const deleteBtn = document.createElement('button')
  deleteBtn.id = 'delete-btn'
  deleteBtn.textContent = 'Remove pin'
  deleteBtn.style.cssText = `
    margin-top: 10px;
    width: 100%;
    padding: 10px;
    background: #2a2a2a;
    color: #555;
    border: 1px solid #2a2a2a;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
  `
  deleteBtn.addEventListener('click', async () => {
    await fetch('/delete-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: pin.lat, lng: pin.lng })
    })
    map.removeLayer(activeMarkers[index])
    document.getElementById('form-section').style.display = 'block'
    document.getElementById('detail-section').style.display = 'none'
    await loadPins()
  })

  document.getElementById('detail-section').appendChild(deleteBtn)
}

// ── Unlock next pin ──────────────────────────────────────────────

function unlockNext(fromIndex) {
  const nextIndex = fromIndex + 1
  if (nextIndex >= allPins.length) return

  unlockedCount = nextIndex + 1

  drawAnimatedLine(allPins[fromIndex], allPins[nextIndex], () => {
    activeMarkers[nextIndex].setStyle({
      fillColor: RED,
      fillOpacity: 1,
      opacity: 1
    })

    map.flyTo([allPins[nextIndex].lat, allPins[nextIndex].lng], map.getZoom(), {
      duration: 1.2
    })

    setTimeout(() => {
      showDetail(allPins[nextIndex], nextIndex)
    }, 1400)
  })
}

// ── Add pin form ─────────────────────────────────────────────────

map.on('click', (e) => {
  selectedLat = e.latlng.lat.toFixed(5)
  selectedLng = e.latlng.lng.toFixed(5)

  if (tempMarker) map.removeLayer(tempMarker)

  tempMarker = L.circleMarker([selectedLat, selectedLng], {
    radius: 8,
    color: WHITE,
    fillColor: '#555',
    fillOpacity: 1,
    weight: 2
  }).addTo(map)

  document.getElementById('coords-display').textContent =
    `Selected: ${selectedLat}, ${selectedLng}`
  document.getElementById('save-btn').disabled = false
  document.getElementById('save-btn').textContent = 'Save pin'
})

document.getElementById('save-btn').addEventListener('click', async () => {
  const title = document.getElementById('input-title').value.trim()
  const description = document.getElementById('input-description').value.trim()

  if (!title) { alert('Please add a title.'); return }
  if (!description) { alert('Please add a description.'); return }

  const btn = document.getElementById('save-btn')
  btn.disabled = true
  btn.textContent = 'Saving...'

  // Upload all media files and collect urls + captions
  const mediaItems = []

  const captionInputs = document.querySelectorAll('#media-preview-list .media-preview-item input')

  for (let i = 0; i < selectedFiles.length; i++) {
    const file = selectedFiles[i]
    const caption = captionInputs[i] ? captionInputs[i].value.trim() : ''

    btn.textContent = `Uploading ${i + 1} of ${selectedFiles.length}...`

    const ext = file.name.split('.').pop().toLowerCase()
    let resourceType = 'image'
    if (['mp4', 'webm', 'mov'].includes(ext)) resourceType = 'video'
    if (['mp3', 'wav', 'ogg'].includes(ext)) resourceType = 'raw'

    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', 'geo_gallery')
    formData.append('public_id', Date.now() + '_' + file.name.replace(/\.[^.]+$/, ''))

    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/dr3bqqqj3/${resourceType}/upload`,
      { method: 'POST', body: formData }
    )

    const uploadData = await uploadRes.json()
    const url = uploadData.secure_url

    if (!url) {
      alert(`Failed to upload ${file.name}. Check console for details.`)
      console.error('Cloudinary error:', uploadData)
      btn.disabled = false
      btn.textContent = 'Save pin'
      return
    }

    mediaItems.push({ url, caption })
  }

  const pin = {
    lat: selectedLat,
    lng: selectedLng,
    title,
    description,
    media: mediaItems
  }

  await fetch('/save-pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pin)
  })

  if (tempMarker) map.removeLayer(tempMarker)
  tempMarker = null
  selectedLat = null
  selectedLng = null
  selectedFiles = []
  document.getElementById('input-title').value = ''
  document.getElementById('input-description').value = ''
  document.getElementById('input-file').value = ''
  document.getElementById('media-preview-list').innerHTML = ''
  document.getElementById('coords-display').textContent = 'No location selected yet'
  btn.disabled = true
  btn.textContent = 'Select a location first'

  await loadPins()
})

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── Load pins on startup ─────────────────────────────────────────

async function loadPins() {
  activeMarkers.forEach(m => { if (m) map.removeLayer(m) })
  lines.forEach(l => map.removeLayer(l))
  activeMarkers = []
  lines = []
  unlockedCount = 1

  const res = await fetch('/pins')
  allPins = await res.json()

  allPins.forEach((pin, index) => {
    makeMarker(pin, index, index === 0)
  })
}

loadPins()