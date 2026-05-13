// ═══════════════════════════════════════════════════════════════════════════════
// NEXUS — map.js
// Geo map (Leaflet) + Concept map (D3 force simulation), unified sidebar
// ═══════════════════════════════════════════════════════════════════════════════

// ── Colours (mirrors CSS vars for D3 use) ─────────────────────────────────────
const C = {
  ink:       '#0d0d0d',
  inkMid:    '#1a1917',
  inkSoft:   '#252420',
  inkLine:   '#2e2c28',
  ash:       '#7a776f',
  ashLight:  '#a09d96',
  paper:     '#e8e4dc',
  paperDim:  '#c4bfb5',
  ember:     '#c0392b',
  emberDim:  '#7b1a1a',
  emberGlow: '#e85d4a',
}

// ── App state ──────────────────────────────────────────────────────────────────
let currentMode     = 'geo'
let allPins         = []
let unlockedCount   = 1
let activeMarkers   = []
let lines           = []
let selectedLat     = null
let selectedLng     = null
let tempMarker      = null
let selectedFiles   = []
let currentTags     = []
let currentConceptNode = null  // concept node currently open in sidebar

// D3 concept graph state
let conceptData     = { nodes: [], edges: [], pins: [] }
let simulation      = null
let svg             = null
let zoomGroup       = null

// ── Helpers ────────────────────────────────────────────────────────────────────
function slugify(str) {
  return str.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

// ── Sidebar / panel ────────────────────────────────────────────────────────────
function toggleExpand() {
  const sidebar = document.getElementById('sidebar')
  const btn     = document.getElementById('expand-btn')
  sidebar.classList.toggle('expanded')
  btn.textContent = sidebar.classList.contains('expanded') ? '⤡ Collapse' : '⤢ Expand'
}

function showPanel(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
  document.getElementById(id).classList.add('active')
  document.getElementById('sidebar-body').scrollTop = 0
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODE SWITCHING
// ═══════════════════════════════════════════════════════════════════════════════

function setMode(mode) {
  currentMode = mode

  document.getElementById('btn-geo').classList.toggle('active',     mode === 'geo')
  document.getElementById('btn-concept').classList.toggle('active', mode === 'concept')
  document.getElementById('map').classList.toggle('hidden',                mode === 'concept')
  document.getElementById('concept-canvas').classList.toggle('visible',   mode === 'concept')

  if (mode === 'concept') {
    showPanel('form-panel')   // reset sidebar
    loadConceptMap()
  } else {
    // Returning to geo — invalidate Leaflet size
    setTimeout(() => map.invalidateSize(), 420)
    showPanel('form-panel')
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GEO MAP — Leaflet
// ═══════════════════════════════════════════════════════════════════════════════

const map = L.map('map', { zoomControl: true }).setView([16.5, 106.5], 6)
map.zoomControl.setPosition('bottomright')

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 20
}).addTo(map)

// ── Markers ────────────────────────────────────────────────────────────────────
function makeMarker(pin, index, unlocked) {
  const marker = L.circleMarker([pin.lat, pin.lng], {
    radius:      unlocked ? (index === 0 ? 10 : 9) : 7,
    color:       C.paper,
    fillColor:   unlocked ? C.ember : '#2e2c28',
    fillOpacity: unlocked ? 1 : 0.5,
    weight:      unlocked ? 2 : 1,
    opacity:     unlocked ? 1 : 0.4
  }).addTo(map)

  marker.bindTooltip(pin.title || 'Untitled', {
    permanent: false, direction: 'top', className: 'pin-tooltip', offset: [0, -6]
  })

  marker.on('click', () => {
    if (index < unlockedCount) {
      map.flyTo([pin.lat, pin.lng], Math.max(map.getZoom(), 10), { duration: 0.9 })
      setTimeout(() => showGeoDetail(pin, index), 450)
    }
  })

  activeMarkers[index] = marker
  return marker
}

// ── Lines ──────────────────────────────────────────────────────────────────────
function drawStaticLine(a, b) {
  const line = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
    color: C.ember, weight: 1.5, opacity: 0.7
  }).addTo(map)
  lines.push(line)
}

function drawAnimatedLine(fromPin, toPin, onComplete) {
  const from = L.latLng(fromPin.lat, fromPin.lng)
  const to   = L.latLng(toPin.lat, toPin.lng)

  const ghost = L.polyline([from, to], { color: C.emberDim, weight: 1, opacity: 0.3, dashArray: '4 8' }).addTo(map)
  lines.push(ghost)

  const dot = L.circleMarker(from, { radius: 5, color: C.emberGlow, fillColor: C.emberGlow, fillOpacity: 0.9, weight: 0 }).addTo(map)

  let step = 0
  const steps = 80
  const interval = setInterval(() => {
    step++
    const t    = step / steps
    const ease = t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t
    dot.setLatLng([fromPin.lat*(1-ease) + toPin.lat*ease, fromPin.lng*(1-ease) + toPin.lng*ease])

    if (step >= steps) {
      clearInterval(interval)
      map.removeLayer(dot)
      map.removeLayer(ghost)
      lines = lines.filter(l => l !== ghost)
      const solid = L.polyline([from, to], { color: C.ember, weight: 1.5, opacity: 0.7 }).addTo(map)
      lines.push(solid)
      if (onComplete) onComplete()
    }
  }, 16)
}

// ── Unlock ─────────────────────────────────────────────────────────────────────
function unlockNext(fromIndex) {
  const nextIndex = fromIndex + 1
  if (nextIndex >= allPins.length) return
  unlockedCount = nextIndex + 1
  drawAnimatedLine(allPins[fromIndex], allPins[nextIndex], () => {
    activeMarkers[nextIndex].setStyle({ fillColor: C.ember, fillOpacity: 1, opacity: 1, weight: 2, radius: 9 })
    map.flyTo([allPins[nextIndex].lat, allPins[nextIndex].lng], Math.max(map.getZoom(), 10), { duration: 1.3 })
    setTimeout(() => showGeoDetail(allPins[nextIndex], nextIndex), 1500)
  })
}

// ── Geo detail panel ───────────────────────────────────────────────────────────
function showGeoDetail(pin, index) {
  showPanel('detail-panel')
  document.getElementById('chapter-number').textContent = `Chapter ${index + 1}`
  document.getElementById('chapter-total').textContent  = `of ${allPins.length}`
  document.getElementById('chapter-progress-fill').style.width = ((index + 1) / allPins.length * 100) + '%'
  document.getElementById('detail-title').textContent   = pin.title || 'Untitled'
  document.getElementById('detail-coords').textContent  = `${parseFloat(pin.lat).toFixed(5)}, ${parseFloat(pin.lng).toFixed(5)}`

  document.getElementById('detail-description').innerHTML = (pin.description || '').split('\n')
    .filter(l => l.trim()).map(l => `<p>${l}</p>`).join('')

  // Tags
  const tagsWrap = document.getElementById('detail-tags')
  tagsWrap.innerHTML = ''
  ;(pin.tags || []).forEach(tag => {
    const pill = document.createElement('span')
    pill.className = 'detail-tag'
    pill.textContent = tag
    pill.title = 'View in concept map'
    pill.addEventListener('click', () => {
      setMode('concept')
      // After concept map loads, highlight this node
      setTimeout(() => highlightConceptNode(slugify(tag)), 600)
    })
    tagsWrap.appendChild(pill)
  })

  // Media
  const wrap = document.getElementById('detail-media-wrap')
  wrap.innerHTML = ''
  const media = pin.media && pin.media.length ? pin.media : (pin.filename ? [{ url: pin.filename, caption: '' }] : [])
  if (media.length) {
    wrap.appendChild(renderMediaStack(media))
    const div = document.createElement('div'); div.className = 'divider'; wrap.appendChild(div)
  }

  // Nav
  const navRow = document.getElementById('nav-row')
  navRow.innerHTML = ''
  if (index > 0) {
    const b = document.createElement('button'); b.textContent = '← Previous'; b.className = 'nav-btn back'
    b.addEventListener('click', () => { const p = allPins[index-1]; map.flyTo([p.lat,p.lng], Math.max(map.getZoom(),10),{duration:0.9}); setTimeout(()=>showGeoDetail(p,index-1),450) })
    navRow.appendChild(b)
  }
  if (index < allPins.length - 1) {
    const isLocked = index === unlockedCount - 1
    const f = document.createElement('button'); f.textContent = isLocked ? 'Continue →' : 'Next →'; f.className = isLocked ? 'nav-btn unlock' : 'nav-btn forward'
    f.addEventListener('click', () => { isLocked ? unlockNext(index) : (() => { const n=allPins[index+1]; map.flyTo([n.lat,n.lng],Math.max(map.getZoom(),10),{duration:0.9}); setTimeout(()=>showGeoDetail(n,index+1),450) })() })
    navRow.appendChild(f)
  }

  // Delete
  const dw = document.getElementById('delete-btn-wrap'); dw.innerHTML = ''
  const db = document.createElement('button'); db.id = 'delete-btn'; db.textContent = 'Remove pin'
  db.addEventListener('click', async () => {
    if (!confirm('Remove this pin? This cannot be undone.')) return
    await fetch('/delete-pin', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id: pin.id }) })
    map.removeLayer(activeMarkers[index])
    showPanel('form-panel')
    await loadPins()
  })
  dw.appendChild(db)
}

document.getElementById('back-to-form').addEventListener('click', () => showPanel('form-panel'))

// ── Media renderer ─────────────────────────────────────────────────────────────
function renderMediaStack(items) {
  const stack = document.createElement('div'); stack.className = 'media-stack'
  items.forEach(item => {
    const url     = item.url || item
    const caption = item.caption || ''
    const ext     = url.split('.').pop().split('?')[0].toLowerCase()
    const wrap    = document.createElement('div'); wrap.className = 'media-stack-item'

    if (['jpg','jpeg','png','gif','webp'].includes(ext)) {
      const img = document.createElement('img'); img.src = url; img.loading = 'lazy'; wrap.appendChild(img)
    } else if (['mp4','webm','mov'].includes(ext)) {
      const v = document.createElement('video'); v.src = url; v.controls = true; wrap.appendChild(v)
    } else if (['mp3','wav','ogg'].includes(ext)) {
      const a = document.createElement('audio'); a.src = url; a.controls = true; wrap.appendChild(a)
    }
    if (caption) { const p = document.createElement('p'); p.className = 'media-caption'; p.textContent = caption; wrap.appendChild(p) }
    stack.appendChild(wrap)
  })
  return stack
}

// ── Tags input ─────────────────────────────────────────────────────────────────
function renderTagPills() {
  const wrap   = document.getElementById('tags-input-wrap')
  const input  = document.getElementById('tag-text-input')
  wrap.querySelectorAll('.tag-pill').forEach(p => p.remove())

  currentTags.forEach((tag, i) => {
    const pill = document.createElement('span'); pill.className = 'tag-pill'
    pill.innerHTML = `${tag} <span class="remove-tag" data-i="${i}">×</span>`
    pill.querySelector('.remove-tag').addEventListener('click', () => { currentTags.splice(i, 1); renderTagPills() })
    wrap.insertBefore(pill, input)
  })
}

function addTag(raw) {
  const tag = raw.trim().replace(/,+$/, '').trim()
  if (!tag || currentTags.includes(tag)) return
  currentTags.push(tag)
  renderTagPills()
}

document.getElementById('tag-text-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addTag(e.target.value)
    e.target.value = ''
  }
  if (e.key === 'Backspace' && e.target.value === '' && currentTags.length > 0) {
    currentTags.pop(); renderTagPills()
  }
})
document.getElementById('tag-text-input').addEventListener('blur', (e) => {
  if (e.target.value) { addTag(e.target.value); e.target.value = '' }
})
document.getElementById('tags-input-wrap').addEventListener('click', () => document.getElementById('tag-text-input').focus())

// ── File preview ───────────────────────────────────────────────────────────────
document.getElementById('input-file').addEventListener('change', (e) => {
  selectedFiles = Array.from(e.target.files)
  const list = document.getElementById('media-preview-list'); list.innerHTML = ''
  selectedFiles.forEach((file, i) => {
    const item = document.createElement('div'); item.className = 'media-preview-item'
    const ext  = file.name.split('.').pop().toLowerCase()
    const url  = URL.createObjectURL(file)
    if (['jpg','jpeg','png','gif','webp'].includes(ext)) { const img = document.createElement('img'); img.src = url; item.appendChild(img) }
    else if (['mp4','webm','mov'].includes(ext)) { const v = document.createElement('video'); v.src=url; v.controls=true; item.appendChild(v) }
    else if (['mp3','wav','ogg'].includes(ext)) { const a = document.createElement('audio'); a.src=url; a.controls=true; item.appendChild(a) }
    const cap = document.createElement('input'); cap.type='text'; cap.placeholder='Caption…'; cap.dataset.index=i
    item.appendChild(cap); list.appendChild(item)
  })
})

// ── Map click ──────────────────────────────────────────────────────────────────
map.on('click', (e) => {
  if (!document.getElementById('form-panel').classList.contains('active')) return
  selectedLat = e.latlng.lat.toFixed(5)
  selectedLng = e.latlng.lng.toFixed(5)
  if (tempMarker) map.removeLayer(tempMarker)
  tempMarker = L.circleMarker([selectedLat, selectedLng], { radius: 8, color: C.paper, fillColor: '#555', fillOpacity: 1, weight: 2 }).addTo(map)
  document.getElementById('coords-display').textContent = `${selectedLat}, ${selectedLng}`
  const btn = document.getElementById('save-btn'); btn.disabled = false; btn.textContent = 'Save pin'
})  

// ── Save pin ───────────────────────────────────────────────────────────────────
document.getElementById('save-btn').addEventListener('click', async () => {
  const title       = document.getElementById('input-title').value.trim()
  const description = document.getElementById('input-description').value.trim()
  if (!title)       { alert('Please add a title.'); return }
  if (!description) { alert('Please add a description.'); return }

  // Flush any pending tag
  const tagInput = document.getElementById('tag-text-input')
  if (tagInput.value) { addTag(tagInput.value); tagInput.value = '' }

  const btn = document.getElementById('save-btn'); btn.disabled = true; btn.textContent = 'Saving…'

  const mediaItems    = []
  const captionInputs = document.querySelectorAll('#media-preview-list .media-preview-item input')

  for (let i = 0; i < selectedFiles.length; i++) {
    const file    = selectedFiles[i]
    const caption = captionInputs[i] ? captionInputs[i].value.trim() : ''
    btn.textContent = `Uploading ${i+1} of ${selectedFiles.length}…`
    const ext = file.name.split('.').pop().toLowerCase()
    let resourceType = ['mp4','webm','mov'].includes(ext) ? 'video' : ['mp3','wav','ogg'].includes(ext) ? 'raw' : 'image'
    const fd = new FormData(); fd.append('file',file); fd.append('upload_preset','geo_gallery'); fd.append('public_id', Date.now()+'_'+file.name.replace(/\.[^.]+$/,''))
    const up  = await fetch(`https://api.cloudinary.com/v1_1/dr3bqqqj3/${resourceType}/upload`, { method:'POST', body:fd })
    const upd = await up.json()
    if (!upd.secure_url) { alert(`Failed to upload ${file.name}`); console.error(upd); btn.disabled=false; btn.textContent='Save pin'; return }
    mediaItems.push({ url: upd.secure_url, caption })
  }

  await fetch('/save-pin', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ lat: selectedLat, lng: selectedLng, title, description, media: mediaItems, tags: currentTags })
  })

  // Reset
  if (tempMarker) { map.removeLayer(tempMarker); tempMarker = null }
  selectedLat = selectedLng = null; selectedFiles = []; currentTags = []
  document.getElementById('input-title').value          = ''
  document.getElementById('input-description').value    = ''
  document.getElementById('input-file').value           = ''
  document.getElementById('media-preview-list').innerHTML = ''
  document.getElementById('coords-display').textContent = ''
  renderTagPills()
  btn.disabled = true; btn.textContent = 'Select a location first'
  await loadPins()
})

// ── Load geo pins ──────────────────────────────────────────────────────────────
async function loadPins() {
  activeMarkers.forEach(m => { if (m) map.removeLayer(m) })
  lines.forEach(l => map.removeLayer(l))
  activeMarkers = []; lines = []

  const saved = unlockedCount
  const res   = await fetch('/pins'); allPins = await res.json()
  unlockedCount = Math.min(saved, allPins.length || 1)

  allPins.forEach((pin, i) => {
    const unlocked = i < unlockedCount
    makeMarker(pin, i, unlocked)
    if (unlocked && i > 0) drawStaticLine(allPins[i-1], allPins[i])
  })

  const overlay = document.getElementById('loading-overlay')
  if (overlay && !overlay.classList.contains('hidden')) setTimeout(() => overlay.classList.add('hidden'), 800)
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONCEPT MAP — D3 force simulation
// ═══════════════════════════════════════════════════════════════════════════════

async function loadConceptMap() {
  const res  = await fetch('/concepts')
  conceptData = await res.json()
  renderConceptGraph()
}

function renderConceptGraph() {
  const container = document.getElementById('concept-svg')
  const W = container.clientWidth  || container.parentElement.clientWidth
  const H = container.clientHeight || container.parentElement.clientHeight

  // Clear previous
  d3.select('#concept-svg').selectAll('*').remove()

  svg = d3.select('#concept-svg')

  // ── Zoom & pan ───────────────────────────────────────────────────────────────
  const zoom = d3.zoom()
    .scaleExtent([0.2, 4])
    .on('zoom', (event) => zoomGroup.attr('transform', event.transform))
  svg.call(zoom)

  zoomGroup = svg.append('g').attr('class', 'zoom-group')

  // Prevent concept map clicks from doing anything on the SVG background
  svg.on('click', (event) => { if (event.target === container) return })

  // ── Defs: glow filter ───────────────────────────────────────────────────────
  const defs = svg.append('defs')
  const filter = defs.append('filter').attr('id', 'ember-glow').attr('x','-50%').attr('y','-50%').attr('width','200%').attr('height','200%')
  filter.append('feGaussianBlur').attr('stdDeviation','3').attr('result','blur')
  const merge = filter.append('feMerge')
  merge.append('feMergeNode').attr('in','blur')
  merge.append('feMergeNode').attr('in','SourceGraphic')

  // ── Build node/link data ─────────────────────────────────────────────────────
  const { nodes, edges } = conceptData

  // Node sizing: larger nodes have more linked pins
  const pinCountById = {}
  nodes.forEach(n => { pinCountById[n.id] = (n.pin_ids || []).length })
  const maxPins = Math.max(...Object.values(pinCountById), 1)

  const nodeRadius = (n) => 7 + (pinCountById[n.id] / maxPins) * 14

  // ── Force simulation ──────────────────────────────────────────────────────────
  simulation = d3.forceSimulation(nodes)
    .force('link',    d3.forceLink(edges).id(d => d.id).distance(120).strength(0.6))
    .force('charge',  d3.forceManyBody().strength(-300))
    .force('center',  d3.forceCenter(W / 2, H / 2))
    .force('collide', d3.forceCollide().radius(d => nodeRadius(d) + 12))

  // Use saved positions if available
  nodes.forEach(n => {
    if (n.x != null) { n.fx = null; n.x = n.x }  // let simulation start from saved pos
    if (n.y != null) { n.fy = null; n.y = n.y }
  })

  // ── Edges ─────────────────────────────────────────────────────────────────────
  const link = zoomGroup.append('g').attr('class', 'links')
    .selectAll('line')
    .data(edges)
    .join('line')
    .attr('stroke', C.inkLine)
    .attr('stroke-width', 1)
    .attr('stroke-opacity', 0.8)

  // ── Nodes ──────────────────────────────────────────────────────────────────────
  const node = zoomGroup.append('g').attr('class', 'nodes')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', 'concept-node')
    .style('cursor', 'pointer')

  // Outer glow ring
  node.append('circle')
    .attr('r', d => nodeRadius(d) + 4)
    .attr('fill', 'none')
    .attr('stroke', C.emberDim)
    .attr('stroke-width', 1)
    .attr('opacity', 0.4)

  // Main circle
  node.append('circle')
    .attr('r', d => nodeRadius(d))
    .attr('fill', C.inkSoft)
    .attr('stroke', C.ember)
    .attr('stroke-width', 1.5)
    .attr('filter', 'url(#ember-glow)')

  // Label
  node.append('text')
    .text(d => d.label)
    .attr('text-anchor', 'middle')
    .attr('dy', d => nodeRadius(d) + 14)
    .attr('fill', C.ashLight)
    .attr('font-family', "'DM Mono', monospace")
    .attr('font-size', '10px')
    .attr('letter-spacing', '0.05em')

  // Pin-count badge (if > 0)
  node.filter(d => (d.pin_ids || []).length > 0)
    .append('text')
    .text(d => d.pin_ids.length)
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .attr('fill', C.paper)
    .attr('font-family', "'DM Mono', monospace")
    .attr('font-size', '9px')

  // ── Hover ──────────────────────────────────────────────────────────────────────
  node
    .on('mouseenter', function(event, d) {
      d3.select(this).select('circle:nth-child(2)')
        .transition().duration(150)
        .attr('fill', C.emberDim)
        .attr('stroke', C.emberGlow)

      d3.select(this).select('text:first-of-type')
        .transition().duration(150)
        .attr('fill', C.paper)

      // Highlight connected edges
      link
        .transition().duration(150)
        .attr('stroke', l => (l.source.id === d.id || l.target.id === d.id) ? C.ember : C.inkLine)
        .attr('stroke-opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.3)
        .attr('stroke-width', l => (l.source.id === d.id || l.target.id === d.id) ? 2 : 1)
    })
    .on('mouseleave', function() {
      d3.select(this).select('circle:nth-child(2)')
        .transition().duration(200)
        .attr('fill', C.inkSoft)
        .attr('stroke', C.ember)

      d3.select(this).select('text:first-of-type')
        .transition().duration(200)
        .attr('fill', C.ashLight)

      link.transition().duration(200).attr('stroke', C.inkLine).attr('stroke-opacity', 0.8).attr('stroke-width', 1)
    })

  // ── Click — open concept detail ────────────────────────────────────────────────
  node.on('click', (event, d) => {
    event.stopPropagation()
    openConceptDetail(d)
  })

  // ── Drag ───────────────────────────────────────────────────────────────────────
  const drag = d3.drag()
    .on('start', (event, d) => {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      d.fx = d.x; d.fy = d.y
    })
    .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
    .on('end', (event, d) => {
      if (!event.active) simulation.alphaTarget(0)
      // Save position to DB so it's remembered
      fetch('/update-concept', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ id: d.id, body: d.body || '', x: d.x, y: d.y })
      })
      d.fx = null; d.fy = null
    })

  node.call(drag)

  // ── Tick ───────────────────────────────────────────────────────────────────────
  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
    node.attr('transform', d => `translate(${d.x},${d.y})`)
  })

  // Fade in nodes with stagger
  node.style('opacity', 0)
    .transition().duration(400)
    .delay((d, i) => i * 30)
    .style('opacity', 1)
}

// ── Highlight a specific node ──────────────────────────────────────────────────
function highlightConceptNode(nodeId) {
  const nodeData = conceptData.nodes.find(n => n.id === nodeId)
  if (nodeData) openConceptDetail(nodeData)
}

// ── Concept detail panel ───────────────────────────────────────────────────────
function openConceptDetail(node) {
  currentConceptNode = node
  showPanel('concept-detail-panel')

  document.getElementById('concept-title').textContent    = node.label
  document.getElementById('concept-pin-count').textContent =
    `${(node.pin_ids || []).length} linked pin${(node.pin_ids || []).length !== 1 ? 's' : ''}`
  document.getElementById('concept-body').value = node.body || ''

  const btn = document.getElementById('concept-save-btn')
  btn.textContent = 'Save note'
  btn.classList.remove('saved')

  // Linked pins list
  const list = document.getElementById('concept-linked-list'); list.innerHTML = ''
  const linkedPins = conceptData.pins.filter(p => (node.pin_ids || []).includes(p.id))

  if (linkedPins.length === 0) {
    list.innerHTML = '<div style="font-family:var(--font-mono);font-size:10px;color:var(--ash);padding:8px 0">No pins linked to this concept yet.</div>'
  } else {
    linkedPins.forEach((pin, idx) => {
      const item = document.createElement('div'); item.className = 'linked-pin-item'
      item.innerHTML = `<div class="linked-pin-dot"></div><div class="linked-pin-title">${pin.title || 'Untitled'}</div><div class="linked-pin-arrow">→</div>`
      item.addEventListener('click', () => {
        setMode('geo')
        setTimeout(() => {
          const fullPin = allPins.find(p => p.id === pin.id)
          const pinIdx  = allPins.findIndex(p => p.id === pin.id)
          if (fullPin && pinIdx < unlockedCount) {
            map.flyTo([fullPin.lat, fullPin.lng], 10, { duration: 1 })
            setTimeout(() => showGeoDetail(fullPin, pinIdx), 1100)
          }
        }, 500)
      })
      list.appendChild(item)
    })
  }
}

// ── Save concept note ──────────────────────────────────────────────────────────
async function saveConceptNote() {
  if (!currentConceptNode) return
  const body = document.getElementById('concept-body').value
  currentConceptNode.body = body

  await fetch('/update-concept', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ id: currentConceptNode.id, body, x: currentConceptNode.x, y: currentConceptNode.y })
  })

  const btn = document.getElementById('concept-save-btn')
  btn.textContent = 'Saved ✓'
  btn.classList.add('saved')
  setTimeout(() => { btn.textContent = 'Save note'; btn.classList.remove('saved') }, 2000)
}

document.getElementById('concept-back-btn').addEventListener('click', () => {
  showPanel('form-panel')
  currentConceptNode = null
})

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════
loadPins()