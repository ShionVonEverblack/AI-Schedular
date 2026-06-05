/**
 * app.js — UI Logic, Event Handlers, Calendar Rendering
 * ======================================================
 * Menghubungkan algoritma AI (solver.js) dengan tampilan visual.
 * Mengelola state aplikasi, form input, render kalender,
 * animasi SA, dan ekspor data.
 */

// ============================================================
// 1. APP STATE
// ============================================================

const state = {
  courses: [],
  rooms: [],       // Array of { name, capacity }
  timeSlots: [],
  schedule: null,
  conflictGraph: null,
  isRunning: false,
  nextCourseId: 8, // Preset MK01-MK07, next = 8
  nextTimeSlotId: 1,
};

// ============================================================
// 2. INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', init);

function init() {
  // Try to load saved state from localStorage
  const loaded = loadState();
  
  if (!loaded) {
    state.timeSlots = TIME_SLOTS.map(ts => ({ ...ts }));
    state.nextTimeSlotId = state.timeSlots.length + 1;
  }

  setupEventListeners();
  
  if (loaded && state.courses.length > 0) {
    renderCourseList();
    renderRoomList();
    renderTimeSlotList();
    renderLegend();
    if (state.schedule) {
      renderCalendar(state.schedule);
      renderStats({ conflicts: 0, temperature: 0, iteration: 'Saved', bestPenalty: 0 });
    } else {
      renderCalendarEmpty();
      renderStats(null);
    }
    addLog('📂 Data sebelumnya berhasil dimuat dari penyimpanan lokal.', 'success');
  } else {
    renderCalendarEmpty();
    renderStats(null);
    renderTimeSlotList();
    addLog('Aplikasi siap. Klik "Load Preset" atau tambahkan data manual.', 'info');
  }

  // Set theme icon on load
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  document.getElementById('theme-icon').textContent = currentTheme === 'dark' ? '🌓' : '☀️';
}

function setupEventListeners() {
  document.getElementById('btn-preset').addEventListener('click', loadPreset);
  document.getElementById('btn-generate').addEventListener('click', generateSchedule);
  document.getElementById('btn-export').addEventListener('click', exportCSV);
  document.getElementById('btn-export-png').addEventListener('click', exportPNG);
  document.getElementById('btn-reset').addEventListener('click', resetAll);
  document.getElementById('btn-print').addEventListener('click', () => window.print());
  document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('btn-import-csv').addEventListener('click', () => document.getElementById('csv-file-input').click());
  document.getElementById('csv-file-input').addEventListener('change', handleCSVImport);
  document.getElementById('form-add-course').addEventListener('submit', handleAddCourse);
  document.getElementById('form-add-room').addEventListener('submit', handleAddRoom);
  document.getElementById('form-add-timeslot').addEventListener('submit', handleAddTimeSlot);
  
  window.addEventListener('resize', () => {
    if (state.conflictGraph) drawGraph();
  });
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  document.getElementById('theme-icon').textContent = newTheme === 'dark' ? '🌓' : '☀️';
  if (state.conflictGraph) {
    drawGraph();
  }
}

// ============================================================
// 2B. AUTO-SAVE / LOAD STATE (LocalStorage)
// ============================================================

function saveState() {
  try {
    const data = {
      courses: state.courses,
      rooms: state.rooms,
      timeSlots: state.timeSlots,
      schedule: state.schedule,
      nextCourseId: state.nextCourseId,
      nextTimeSlotId: state.nextTimeSlotId,
    };
    localStorage.setItem('scheduler-state', JSON.stringify(data));
  } catch (e) {
    // Silent fail if localStorage is full
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem('scheduler-state');
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.courses) state.courses = data.courses;
    if (data.rooms) state.rooms = data.rooms;
    if (data.timeSlots) state.timeSlots = data.timeSlots;
    if (data.schedule) state.schedule = data.schedule;
    if (data.nextCourseId) state.nextCourseId = data.nextCourseId;
    if (data.nextTimeSlotId) state.nextTimeSlotId = data.nextTimeSlotId;
    return true;
  } catch (e) {
    return false;
  }
}

// ============================================================
// 3. PRESET DATA
// ============================================================

function loadPreset() {
  state.courses = PRESET_COURSES.map((c, i) => ({
    ...c,
    color: COURSE_COLORS[i % COURSE_COLORS.length],
  }));
  state.rooms = PRESET_ROOMS.map(r => ({ ...r }));
  state.timeSlots = TIME_SLOTS.map(ts => ({ ...ts }));
  state.nextTimeSlotId = state.timeSlots.length + 1;
  state.schedule = null;
  state.nextCourseId = 8;

  renderCourseList();
  renderRoomList();
  renderTimeSlotList();
  renderCalendarEmpty();
  renderLegend();
  renderStats(null);
  saveState();
  showNotification('Data preset Semester 2 berhasil dimuat!', 'success');
  addLog('📋 Loaded preset: 7 mata kuliah, 4 ruangan, 4 jam kuliah', 'info');
}

// ============================================================
// 4. COURSE MANAGEMENT
// ============================================================

function handleAddCourse(e) {
  e.preventDefault();

  const nameInput = document.getElementById('input-course-name');
  const lecturerInput = document.getElementById('input-lecturer');
  const sksSelect = document.getElementById('input-sks');
  const prefSelect = document.getElementById('input-preference');
  const studentsInput = document.getElementById('input-students');

  const name = nameInput.value.trim();
  const lecturer = lecturerInput.value.trim();
  const sks = parseInt(sksSelect.value) || 3;
  const preference = prefSelect ? prefSelect.value : 'none';
  const students = parseInt(studentsInput.value) || 30;

  if (!name || !lecturer) return;

  const id = 'MK' + String(state.nextCourseId++).padStart(2, '0');
  const color = COURSE_COLORS[state.courses.length % COURSE_COLORS.length];

  state.courses.push({ id, name, lecturer, sks, semester: 2, color, preference, students });
  renderCourseList();
  renderLegend();
  e.target.reset();
  // Reset default value for students
  document.getElementById('input-students').value = '30';
  saveState();
  showNotification(`"${name}" ditambahkan!`, 'success');
}

function removeCourse(index) {
  const name = state.courses[index].name;
  state.courses.splice(index, 1);
  // Reassign colors
  state.courses.forEach((c, i) => {
    c.color = COURSE_COLORS[i % COURSE_COLORS.length];
  });
  renderCourseList();
  renderLegend();
  saveState();
  showNotification(`"${name}" dihapus`, 'info');
}

// ============================================================
// 4B. INLINE EDIT — Course
// ============================================================

function startEditCourse(index) {
  const course = state.courses[index];
  const container = document.getElementById('course-list');
  const item = container.children[index];
  if (!item) return;
  
  item.innerHTML = `
    <div class="edit-inline">
      <input type="text" class="edit-input" id="edit-course-name-${index}" value="${course.name}" />
      <input type="text" class="edit-input" id="edit-course-lecturer-${index}" value="${course.lecturer}" placeholder="Dosen" />
      <div class="form-row" style="gap:4px; margin-top:4px;">
        <input type="number" class="edit-input" id="edit-course-students-${index}" value="${course.students || 30}" min="1" style="width:60px;" />
        <button class="btn btn-sm btn-primary" onclick="confirmEditCourse(${index})">✓</button>
        <button class="btn btn-sm btn-secondary" onclick="renderCourseList()">✕</button>
      </div>
    </div>
  `;
  document.getElementById(`edit-course-name-${index}`).focus();
  document.getElementById(`edit-course-name-${index}`).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmEditCourse(index);
    if (e.key === 'Escape') renderCourseList();
  });
}

function confirmEditCourse(index) {
  const name = document.getElementById(`edit-course-name-${index}`).value.trim();
  const lecturer = document.getElementById(`edit-course-lecturer-${index}`).value.trim();
  const students = parseInt(document.getElementById(`edit-course-students-${index}`).value) || 30;
  
  if (!name || !lecturer) {
    showNotification('Nama dan dosen tidak boleh kosong!', 'warning');
    return;
  }
  
  state.courses[index].name = name;
  state.courses[index].lecturer = lecturer;
  state.courses[index].students = students;
  renderCourseList();
  renderLegend();
  saveState();
  showNotification(`Mata kuliah berhasil diperbarui.`, 'success');
}

// ============================================================
// 5. ROOM MANAGEMENT
// ============================================================

function handleAddRoom(e) {
  e.preventDefault();

  const roomInput = document.getElementById('input-room');
  const capacityInput = document.getElementById('input-room-capacity');
  const roomName = roomInput.value.trim().toUpperCase();
  const capacity = parseInt(capacityInput.value) || 40;

  if (!roomName) return;
  if (state.rooms.some(r => r.name === roomName)) {
    showNotification(`Ruangan "${roomName}" sudah ada!`, 'warning');
    return;
  }

  state.rooms.push({ name: roomName, capacity });
  renderRoomList();
  e.target.reset();
  document.getElementById('input-room-capacity').value = '40';
  saveState();
  showNotification(`Ruangan "${roomName}" (${capacity} kursi) ditambahkan!`, 'success');
}

function removeRoom(index) {
  const room = state.rooms[index];
  state.rooms.splice(index, 1);
  renderRoomList();
  saveState();
  showNotification(`Ruangan "${room.name}" dihapus`, 'info');
}

// ============================================================
// 5B. INLINE EDIT — Room
// ============================================================

function startEditRoom(index) {
  const room = state.rooms[index];
  const container = document.getElementById('room-list');
  const item = container.children[index];
  if (!item) return;
  
  item.innerHTML = `
    <div class="edit-inline">
      <div class="form-row" style="gap:4px;">
        <input type="text" class="edit-input" id="edit-room-name-${index}" value="${room.name}" />
        <input type="number" class="edit-input" id="edit-room-cap-${index}" value="${room.capacity}" min="1" style="width:60px;" />
        <button class="btn btn-sm btn-primary" onclick="confirmEditRoom(${index})">✓</button>
        <button class="btn btn-sm btn-secondary" onclick="renderRoomList()">✕</button>
      </div>
    </div>
  `;
  document.getElementById(`edit-room-name-${index}`).focus();
  document.getElementById(`edit-room-name-${index}`).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmEditRoom(index);
    if (e.key === 'Escape') renderRoomList();
  });
}

function confirmEditRoom(index) {
  const name = document.getElementById(`edit-room-name-${index}`).value.trim().toUpperCase();
  const capacity = parseInt(document.getElementById(`edit-room-cap-${index}`).value) || 40;
  
  if (!name) {
    showNotification('Nama ruangan tidak boleh kosong!', 'warning');
    return;
  }
  
  state.rooms[index].name = name;
  state.rooms[index].capacity = capacity;
  renderRoomList();
  saveState();
  showNotification(`Ruangan berhasil diperbarui.`, 'success');
}

// ============================================================
// 5C. TIMESLOT MANAGEMENT
// ============================================================

function handleAddTimeSlot(e) {
  e.preventDefault();

  const startInput = document.getElementById('input-time-start');
  const endInput = document.getElementById('input-time-end');

  const start = startInput.value;
  const end = endInput.value;

  if (!start || !end) return;

  if (start >= end) {
    showNotification('Jam mulai harus lebih awal dari jam selesai!', 'warning');
    return;
  }

  const label = `${start} – ${end}`;

  if (state.timeSlots.some((ts) => ts.label === label)) {
    showNotification(`Jam kuliah "${label}" sudah ada!`, 'warning');
    return;
  }

  const id = state.nextTimeSlotId++;
  state.timeSlots.push({ id, label, start, end, locked: false });

  // Sort chronologically by start time
  state.timeSlots.sort((a, b) => a.start.localeCompare(b.start));

  renderTimeSlotList();

  // Clear active schedule
  state.schedule = null;
  renderCalendarEmpty();
  renderStats(null);

  e.target.reset();
  saveState();
  showNotification(`Jam kuliah "${label}" ditambahkan!`, 'success');
  addLog(`🕒 Tambah jam kuliah: ${label}`, 'success');
}

function removeTimeSlot(index) {
  const label = state.timeSlots[index].label;
  state.timeSlots.splice(index, 1);

  renderTimeSlotList();

  // Clear active schedule
  state.schedule = null;
  renderCalendarEmpty();
  renderStats(null);
  saveState();

  showNotification(`Jam kuliah "${label}" dihapus`, 'info');
  addLog(`🗑️ Hapus jam kuliah: ${label}`, 'info');
}

function toggleTimeslotLock(index) {
  state.timeSlots[index].locked = !state.timeSlots[index].locked;
  const label = state.timeSlots[index].label;
  const isLocked = state.timeSlots[index].locked;
  
  renderTimeSlotList();
  saveState();
  
  if (isLocked) {
    showNotification(`🔒 "${label}" dikunci (istirahat)`, 'info');
    addLog(`🔒 Jam "${label}" dikunci sebagai waktu istirahat`, 'info');
  } else {
    showNotification(`🔓 "${label}" dibuka kembali`, 'info');
    addLog(`🔓 Jam "${label}" dibuka kembali`, 'info');
  }
}

// ============================================================
// 6. RENDERING — Sidebar Lists
// ============================================================

function renderCourseList() {
  const container = document.getElementById('course-list');
  container.innerHTML = '';

  state.courses.forEach((course, index) => {
    const el = document.createElement('div');
    el.className = 'course-item';
    el.innerHTML = `
      <div class="course-color" style="background: ${course.color}; box-shadow: 0 0 6px ${course.color}40;"></div>
      <div class="course-info">
        <span class="course-name">${course.name}</span>
        <span class="course-detail">${course.lecturer} · ${course.sks} SKS · ${course.students || '?'} mhs</span>
      </div>
      <button class="btn-icon" title="Edit" onclick="startEditCourse(${index})">✏️</button>
      <button class="btn-remove" title="Hapus">×</button>
    `;
    el.querySelector('.btn-remove').addEventListener('click', () => removeCourse(index));
    container.appendChild(el);
  });

  document.getElementById('course-count').textContent = state.courses.length;
}

function renderRoomList() {
  const container = document.getElementById('room-list');
  container.innerHTML = '';

  state.rooms.forEach((room, index) => {
    const el = document.createElement('div');
    el.className = 'room-item';
    el.innerHTML = `
      <span>🚪 ${room.name} <small style="color:var(--text-muted);">(${room.capacity} kursi)</small></span>
      <button class="btn-icon" title="Edit" onclick="startEditRoom(${index})">✏️</button>
      <button class="btn-remove" title="Hapus">×</button>
    `;
    el.querySelector('.btn-remove').addEventListener('click', () => removeRoom(index));
    container.appendChild(el);
  });

  document.getElementById('room-count').textContent = state.rooms.length;
}

function renderTimeSlotList() {
  const container = document.getElementById('timeslot-list');
  container.innerHTML = '';

  state.timeSlots.forEach((slot, index) => {
    const el = document.createElement('div');
    el.className = 'timeslot-item' + (slot.locked ? ' timeslot-locked' : '');
    el.innerHTML = `
      <span>${slot.locked ? '🔒' : '⏰'} ${slot.label}</span>
      <button class="btn-icon btn-lock" title="${slot.locked ? 'Buka Kunci' : 'Kunci (Istirahat)'}" onclick="toggleTimeslotLock(${index})">${slot.locked ? '🔓' : '🔒'}</button>
      <button class="btn-remove" title="Hapus">×</button>
    `;
    el.querySelector('.btn-remove').addEventListener('click', () => removeTimeSlot(index));
    container.appendChild(el);
  });

  document.getElementById('timeslot-count').textContent = state.timeSlots.length;
}

// ============================================================
// 7. RENDERING — Calendar Grid
// ============================================================

function renderCalendarEmpty() {
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = `
    <div class="calendar-empty">
      <div class="empty-icon">📅</div>
      <strong>Belum Ada Jadwal</strong>
      <p>Klik "Load Preset" lalu "Generate Jadwal" untuk mulai.</p>
    </div>
  `;
}

function renderCalendar(schedule) {
  if (!schedule) {
    renderCalendarEmpty();
    return;
  }

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  // Header row: corner + 5 days
  const corner = document.createElement('div');
  corner.className = 'calendar-corner';
  grid.appendChild(corner);

  DAYS.forEach((day) => {
    const dayHeader = document.createElement('div');
    dayHeader.className = 'calendar-day-header';
    dayHeader.textContent = day;
    grid.appendChild(dayHeader);
  });

  // Time rows
  state.timeSlots.forEach((slot, timeIndex) => {
    // Time label
    const timeLabel = document.createElement('div');
    timeLabel.className = 'calendar-time-label' + (slot.locked ? ' calendar-time-locked' : '');
    timeLabel.textContent = slot.locked ? `🔒 ${slot.label}` : slot.label;
    grid.appendChild(timeLabel);

    // Day cells
    DAYS.forEach((day, dayIndex) => {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell' + (slot.locked ? ' calendar-cell-locked' : '');
      cell.dataset.day = dayIndex;
      cell.dataset.time = timeIndex;
      
      if (!slot.locked) {
        // Drag & Drop Event Listeners
        cell.addEventListener('dragenter', handleDragEnter);
        cell.addEventListener('dragover', handleDragOver);
        cell.addEventListener('dragleave', handleDragLeave);
        cell.addEventListener('drop', handleDrop);
      }

      // Find all courses assigned to this (day, time)
      for (const [courseId, assignment] of Object.entries(schedule)) {
        if (assignment.dayIndex === dayIndex && assignment.timeIndex === timeIndex) {
          const course = state.courses.find((c) => c.id === courseId);
          if (course) {
            const card = document.createElement('div');
            card.className = 'course-card';
            card.id = `card-${courseId}`;
            card.draggable = true;
            card.dataset.courseId = courseId;
            card.addEventListener('dragstart', handleDragStart);
            
            // Touch events for mobile
            card.addEventListener('touchstart', handleTouchStart, { passive: false });
            card.addEventListener('touchmove', handleTouchMove, { passive: false });
            card.addEventListener('touchend', handleTouchEnd);
            
            card.style.borderLeftColor = course.color;
            card.style.background = hexToRgba(course.color, 0.12);

            // Check capacity warning
            const room = state.rooms.find(r => r.name === assignment.room);
            const capacityWarning = room && course.students > room.capacity;

            card.innerHTML = `
              <span class="card-name" style="color: ${course.color}">${course.name}</span>
              <span class="card-detail">${course.lecturer} · ${course.students || '?'} mhs</span>
              <span class="card-room">${capacityWarning ? '⚠️' : '📍'} ${assignment.room}${room ? ` (${room.capacity})` : ''}</span>
            `;
            if (capacityWarning) {
              card.classList.add('capacity-warning');
              card.title = `Peringatan: ${course.students} mahasiswa > ${room.capacity} kapasitas ruangan`;
            }
            cell.appendChild(card);
          }
        }
      }

      grid.appendChild(cell);
    });
  });

  drawGraph(schedule);
}

function renderLegend() {
  const legend = document.getElementById('calendar-legend');
  legend.innerHTML = '';

  state.courses.forEach((course) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `
      <span class="legend-dot" style="background: ${course.color}; box-shadow: 0 0 4px ${course.color}60;"></span>
      <span>${course.name}</span>
    `;
    legend.appendChild(item);
  });
}

// ============================================================
// 8. RENDERING — Stats
// ============================================================

function renderStats(data) {
  const elConflicts = document.getElementById('stat-conflicts');
  const elTemp = document.getElementById('stat-temp');
  const elIter = document.getElementById('stat-iter');
  const elFitness = document.getElementById('stat-fitness');
  const elTempBar = document.getElementById('temp-bar');

  if (!data) {
    elConflicts.textContent = '—';
    elTemp.textContent = '—';
    elIter.textContent = '—';
    elFitness.textContent = '—';
    elTempBar.style.width = '100%';
    return;
  }

  elConflicts.textContent = data.conflicts;
  elTemp.textContent = typeof data.temperature === 'number' ? data.temperature.toFixed(2) : '—';
  elIter.textContent = data.iteration !== undefined ? data.iteration.toLocaleString() : '—';
  elFitness.textContent = data.bestPenalty;

  // Temperature bar: percentage of initial temp
  const tempPercent = Math.max(0, ((data.temperature || 0) / 100) * 100);
  elTempBar.style.width = Math.min(100, tempPercent) + '%';

  // Color the conflicts value
  if (data.conflicts === 0) {
    elConflicts.style.color = 'var(--success)';
  } else {
    elConflicts.style.color = 'var(--danger)';
  }
}

// ============================================================
// 9. GENERATE SCHEDULE (SA + Animation)
// ============================================================

function buildRoomCapacities() {
  const caps = {};
  for (const room of state.rooms) {
    caps[room.name] = room.capacity;
  }
  return caps;
}

async function generateSchedule() {
  if (state.isRunning) return;

  if (state.courses.length === 0) {
    showNotification('Tambahkan mata kuliah terlebih dahulu!', 'error');
    return;
  }
  if (state.rooms.length === 0) {
    showNotification('Tambahkan ruangan terlebih dahulu!', 'error');
    return;
  }
  if (state.timeSlots.length === 0) {
    showNotification('Tambahkan jam kuliah terlebih dahulu!', 'error');
    return;
  }

  // Filter out locked timeslots
  const activeTimeSlots = state.timeSlots.filter(ts => !ts.locked);
  if (activeTimeSlots.length === 0) {
    showNotification('Semua jam kuliah dikunci! Buka setidaknya satu.', 'error');
    return;
  }

  state.isRunning = true;
  const btn = document.getElementById('btn-generate');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating...';

  // Reset UI
  document.getElementById('log-content').innerHTML = '';
  document.getElementById('calendar-wrapper').classList.remove('solved');

  // ── Step 1: Build conflict graph ──
  addLog('🔨 Membangun graf konflik (adjacency list)...', 'info');
  const constraints = buildConstraints(state.courses);
  state.conflictGraph = ConflictGraph.fromConstraints(state.courses, constraints);

  const nodeCount = state.conflictGraph.getNodeCount();
  const edgeCount = state.conflictGraph.getEdgeCount();
  addLog(`📊 Graf konflik: ${nodeCount} node (matkul), ${edgeCount} edge (konflik)`, 'info');

  // Log conflicts
  const edges = state.conflictGraph.getEdges();
  for (const edge of edges.slice(0, 5)) {
    const nameA = state.courses.find((c) => c.id === edge.from)?.name || edge.from;
    const nameB = state.courses.find((c) => c.id === edge.to)?.name || edge.to;
    addLog(`   ↳ ${nameA} ⟷ ${nameB} (${edge.reason})`, 'info');
  }
  if (edges.length > 5) {
    addLog(`   ↳ ... dan ${edges.length - 5} edge lainnya`, 'info');
  }

  // Log locked timeslots
  const lockedCount = state.timeSlots.filter(ts => ts.locked).length;
  if (lockedCount > 0) {
    addLog(`🔒 ${lockedCount} jam kuliah dikunci (istirahat) — dilewati`, 'info');
  }

  // ── Step 2: Generate all available slots (only unlocked) ──
  const roomNames = state.rooms.map(r => r.name);
  const allSlots = generateAllSlots(roomNames, activeTimeSlots);
  addLog(`📦 Total slot tersedia: ${allSlots.length} (${DAYS.length} hari × ${activeTimeSlots.length} waktu × ${state.rooms.length} ruangan)`, 'info');

  // Build room capacities lookup
  const roomCapacities = buildRoomCapacities();

  // ── Step 3: Run Greedy Graph Coloring + SA ──
  addLog('🎨 Menjalankan Greedy Graph Coloring untuk solusi awal...', 'info');
  addLog('🔥 Memulai Simulated Annealing (T₀ = 100, cooling = 0.995)...', 'info');

  const result = await simulatedAnnealing(
    state.conflictGraph,
    state.courses,
    allSlots,
    {
      T_init: 100,
      T_min: 0.01,
      coolingRate: 0.995,
      maxIter: 5000,
      animSpeed: 8,
    },
    (stepData) => {
      // Update UI setiap step
      renderCalendar(stepData.schedule);
      renderStats(stepData);

      // Highlight moved course card
      if (stepData.movedCourse && stepData.wasAccepted) {
        const card = document.getElementById(`card-${stepData.movedCourse}`);
        if (card) {
          card.classList.add('highlight');
          setTimeout(() => card.classList.remove('highlight'), 500);
        }
      }

      // Log milestones
      if (stepData.phase === 'solved') {
        addLog(`✅ SOLVED! Semua konflik teratasi pada iterasi ke-${stepData.iteration}`, 'success');
      } else if (stepData.phase === 'finished') {
        addLog(`⚠️ SA selesai. Sisa konflik: ${stepData.bestConflicts}`, 'warning');
      }
    },
    roomCapacities
  );

  // ── Step 4: Finalize ──
  state.schedule = result.schedule;
  state.isRunning = false;
  btn.disabled = false;
  btn.innerHTML = '⚡ Generate Jadwal';

  addLog(`───────────────────────────────`, 'info');
  addLog(`📈 Hasil akhir:`, 'info');
  addLog(`   Iterasi    : ${result.iterations}`, 'info');
  addLog(`   Suhu akhir : ${result.finalTemperature.toFixed(4)}`, 'info');
  addLog(`   Konflik    : ${result.conflicts}`, result.conflicts === 0 ? 'success' : 'warning');
  addLog(`   Diterima   : ${result.accepted} | Ditolak: ${result.rejected}`, 'info');

  if (result.conflicts === 0) {
    showNotification('🎉 Jadwal berhasil dibuat tanpa konflik!', 'success');
    document.getElementById('calendar-wrapper').classList.add('solved');
  } else {
    showNotification(
      `Jadwal dibuat dengan ${result.conflicts} konflik. Coba generate ulang.`,
      'warning'
    );
  }

  saveState();
}

// ============================================================
// 10. RESET
// ============================================================

function resetAll() {
  state.courses = [];
  state.rooms = [];
  state.timeSlots = TIME_SLOTS.map(ts => ({ ...ts }));
  state.nextTimeSlotId = state.timeSlots.length + 1;
  state.schedule = null;
  state.conflictGraph = null;
  state.nextCourseId = 1;

  document.getElementById('log-content').innerHTML = '';
  document.getElementById('calendar-wrapper').classList.remove('solved');
  document.getElementById('calendar-legend').innerHTML = '';

  renderCourseList();
  renderRoomList();
  renderTimeSlotList();
  renderCalendarEmpty();
  renderStats(null);
  
  // Clear localStorage
  localStorage.removeItem('scheduler-state');
  
  showNotification('Semua data direset', 'info');
  addLog('🗑️ Data direset. Mulai dari awal.', 'info');
}

// ============================================================
// 11. EXPORT CSV
// ============================================================

function exportCSV() {
  if (state.courses.length === 0) {
    showNotification('Tambahkan mata kuliah terlebih dahulu!', 'error');
    return;
  }

  let csv = 'Hari,Waktu,Mata Kuliah,Dosen,SKS,Jumlah Mahasiswa,Ruangan,Kapasitas\n';

  if (state.schedule) {
    // Sort by day → time
    const entries = Object.entries(state.schedule).sort((a, b) => {
      if (a[1].dayIndex !== b[1].dayIndex) return a[1].dayIndex - b[1].dayIndex;
      return a[1].timeIndex - b[1].timeIndex;
    });

    for (const [courseId, slot] of entries) {
      const course = state.courses.find((c) => c.id === courseId);
      if (course) {
        const timeLabel = state.timeSlots[slot.timeIndex] ? state.timeSlots[slot.timeIndex].label : '';
        const room = state.rooms.find(r => r.name === slot.room);
        const cap = room ? room.capacity : '';
        csv += `${DAYS[slot.dayIndex]},${timeLabel},${course.name},${course.lecturer},${course.sks},${course.students || ''},${slot.room},${cap}\n`;
      }
    }
  } else {
    // Export just the course list
    for (const course of state.courses) {
      csv += `,,${course.name},${course.lecturer},${course.sks},${course.students || ''},,\n`;
    }
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = state.schedule ? 'jadwal_kuliah.csv' : 'daftar_mata_kuliah.csv';
  link.click();
  URL.revokeObjectURL(link.href);

  if (state.schedule) {
    showNotification('📥 Jadwal berhasil diekspor ke CSV!', 'success');
    addLog('💾 Jadwal diekspor ke file jadwal_kuliah.csv', 'success');
  } else {
    showNotification('📥 Daftar mata kuliah berhasil diekspor ke CSV!', 'success');
    addLog('💾 Daftar mata kuliah diekspor ke file daftar_mata_kuliah.csv', 'success');
  }
}

// ============================================================
// 11B. EXPORT PNG
// ============================================================

async function exportPNG() {
  const calendarWrapper = document.getElementById('calendar-wrapper');
  
  if (!calendarWrapper || !state.schedule) {
    showNotification('Generate jadwal terlebih dahulu!', 'warning');
    return;
  }

  showNotification('📸 Memproses screenshot...', 'info');

  try {
    const canvas = await html2canvas(calendarWrapper, {
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#000',
      scale: 2, // High resolution
      useCORS: true,
      logging: false,
    });

    const link = document.createElement('a');
    link.download = 'jadwal_kuliah.png';
    link.href = canvas.toDataURL('image/png');
    link.click();

    showNotification('📸 Jadwal berhasil diekspor ke PNG!', 'success');
    addLog('📸 Jadwal diekspor ke file jadwal_kuliah.png', 'success');
  } catch (err) {
    showNotification('Gagal export PNG: ' + err.message, 'error');
  }
}

// ============================================================
// 11C. IMPORT CSV
// ============================================================

function handleCSVImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const text = event.target.result;
      parseAndImportCSV(text);
    } catch (err) {
      showNotification('Gagal membaca file CSV: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  // Reset file input so the same file can be imported again
  e.target.value = '';
}

function parseAndImportCSV(text) {
  const lines = text.split('\n').filter(line => line.trim() !== '');
  if (lines.length < 2) {
    showNotification('File CSV kosong atau tidak valid!', 'error');
    return;
  }

  // Parse header to detect format
  const header = lines[0].toLowerCase();
  const isScheduleCSV = header.includes('hari') && header.includes('waktu');

  let importedCourses = 0;
  let importedRooms = new Set();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 4) continue;

    if (isScheduleCSV) {
      // Format: Hari, Waktu, Mata Kuliah, Dosen, SKS, Jumlah Mahasiswa, Ruangan, Kapasitas
      const [, , name, lecturer, sksStr, studentsStr, roomName, capacityStr] = cols;
      if (!name || !name.trim()) continue;

      const sks = parseInt(sksStr) || 3;
      const students = parseInt(studentsStr) || 30;
      const id = 'MK' + String(state.nextCourseId++).padStart(2, '0');
      const color = COURSE_COLORS[state.courses.length % COURSE_COLORS.length];

      // Avoid duplicate course names
      if (!state.courses.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
        state.courses.push({ id, name: name.trim(), lecturer: lecturer.trim(), sks, semester: 2, color, preference: 'none', students });
        importedCourses++;
      }

      // Import room if present and not duplicate
      if (roomName && roomName.trim()) {
        const rName = roomName.trim().toUpperCase();
        if (!state.rooms.some(r => r.name === rName)) {
          const capacity = parseInt(capacityStr) || 40;
          state.rooms.push({ name: rName, capacity });
          importedRooms.add(rName);
        }
      }
    } else {
      // Generic format: assume cols are Name, Lecturer, SKS, Students
      const [name, lecturer, sksStr, studentsStr] = cols;
      if (!name || !name.trim()) continue;

      const sks = parseInt(sksStr) || 3;
      const students = parseInt(studentsStr) || 30;
      const id = 'MK' + String(state.nextCourseId++).padStart(2, '0');
      const color = COURSE_COLORS[state.courses.length % COURSE_COLORS.length];

      if (!state.courses.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
        state.courses.push({ id, name: name.trim(), lecturer: lecturer.trim(), sks, semester: 2, color, preference: 'none', students });
        importedCourses++;
      }
    }
  }

  // Render all
  renderCourseList();
  renderRoomList();
  renderLegend();
  saveState();

  const msg = `📂 Import berhasil: ${importedCourses} mata kuliah` + (importedRooms.size > 0 ? `, ${importedRooms.size} ruangan` : '');
  showNotification(msg, 'success');
  addLog(msg, 'success');
}

/** Parse a single CSV line, handling quoted fields */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ============================================================
// 12. UTILITIES
// ============================================================

/** Toast notification */
function showNotification(message, type = 'info') {
  const container = document.getElementById('notification-container');
  const notif = document.createElement('div');
  notif.className = `notification notification-${type}`;
  notif.textContent = message;
  container.appendChild(notif);

  // Trigger animation
  requestAnimationFrame(() => notif.classList.add('show'));

  // Auto-dismiss
  setTimeout(() => {
    notif.classList.remove('show');
    setTimeout(() => notif.remove(), 300);
  }, 3500);
}

/** Algorithm log entry */
function addLog(message, type = 'info') {
  const logContent = document.getElementById('log-content');
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  const time = new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  entry.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
  logContent.appendChild(entry);
  logContent.scrollTop = logContent.scrollHeight;
}

/** Convert hex color to rgba */
function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ============================================================
// 13. DRAG & DROP LOGIC (Mouse)
// ============================================================

function handleDragStart(e) {
  e.dataTransfer.setData('text/plain', e.currentTarget.dataset.courseId);
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnter(e) {
  e.preventDefault();
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  
  if (!state.schedule) return;

  const courseId = e.dataTransfer.getData('text/plain');
  const dayIndex = parseInt(e.currentTarget.dataset.day);
  const timeIndex = parseInt(e.currentTarget.dataset.time);
  
  if (isNaN(dayIndex) || isNaN(timeIndex)) return;

  performDrop(courseId, dayIndex, timeIndex);
}

function performDrop(courseId, dayIndex, timeIndex) {
  // Check if timeslot is locked
  if (state.timeSlots[timeIndex] && state.timeSlots[timeIndex].locked) {
    showNotification('Gagal: Jam ini dikunci sebagai waktu istirahat!', 'warning');
    return;
  }

  // Cek apakah sel tujuan sudah terisi matkul lain (tidak boleh numpuk)
  let isOccupied = false;
  for (const [id, assignment] of Object.entries(state.schedule)) {
    if (id !== courseId && assignment.dayIndex === dayIndex && assignment.timeIndex === timeIndex) {
      isOccupied = true;
      break;
    }
  }

  if (isOccupied) {
    showNotification('Gagal: Slot ini sudah terisi matkul lain!', 'warning');
    addLog(`⚠️ Swap dibatalkan: Slot Hari ${dayIndex} Waktu ${timeIndex} penuh.`, 'warning');
    return;
  }

  // Preserve the room if moving
  const oldAssignment = state.schedule[courseId];
  if (oldAssignment) {
    oldAssignment.dayIndex = dayIndex;
    oldAssignment.timeIndex = timeIndex;
    
    // Recalculate fitness
    const maxTimeIndex = state.timeSlots.length;
    const roomCapacities = buildRoomCapacities();
    const result = calculateFitness(state.schedule, state.conflictGraph, state.courses, maxTimeIndex, roomCapacities);
    
    if (result.conflicts > 0) {
      showNotification('Modifikasi menghasilkan jadwal bentrok!', 'warning');
      addLog(`⚠️ Swap manual: Terdapat ${result.conflicts} konflik.`, 'warning');
    } else {
      showNotification('Jadwal berhasil digeser.', 'success');
      addLog(`✨ Swap manual sukses tanpa konflik.`, 'success');
    }
    
    // Update stats & render
    renderStats({
      conflicts: result.conflicts,
      temperature: 0,
      iteration: 'Manual',
      bestPenalty: result.penalty
    });
    renderCalendar(state.schedule);
    saveState();
  }
}

// ============================================================
// 13B. TOUCH DRAG & DROP (Mobile)
// ============================================================

let touchDragState = null;

function handleTouchStart(e) {
  const card = e.currentTarget;
  const courseId = card.dataset.courseId;
  if (!courseId || !state.schedule) return;

  const touch = e.touches[0];
  
  touchDragState = {
    courseId,
    startX: touch.clientX,
    startY: touch.clientY,
    ghost: null,
    isDragging: false,
  };
}

function handleTouchMove(e) {
  if (!touchDragState) return;
  e.preventDefault();
  
  const touch = e.touches[0];
  const dx = touch.clientX - touchDragState.startX;
  const dy = touch.clientY - touchDragState.startY;
  
  // Start dragging after a threshold
  if (!touchDragState.isDragging && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
    touchDragState.isDragging = true;
    
    // Create ghost card
    const originalCard = e.currentTarget;
    const ghost = originalCard.cloneNode(true);
    ghost.className = 'course-card touch-ghost';
    ghost.style.position = 'fixed';
    ghost.style.width = originalCard.offsetWidth + 'px';
    ghost.style.zIndex = '9999';
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = '0.85';
    ghost.style.transform = 'scale(1.05) rotate(2deg)';
    ghost.style.boxShadow = '0 12px 32px rgba(0,0,0,0.5)';
    document.body.appendChild(ghost);
    touchDragState.ghost = ghost;
    
    originalCard.style.opacity = '0.3';
  }
  
  if (touchDragState.isDragging && touchDragState.ghost) {
    touchDragState.ghost.style.left = (touch.clientX - 50) + 'px';
    touchDragState.ghost.style.top = (touch.clientY - 20) + 'px';
    
    // Highlight cell under finger
    document.querySelectorAll('.calendar-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
    const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = elementBelow?.closest('.calendar-cell');
    if (cell && !cell.classList.contains('calendar-cell-locked')) {
      cell.classList.add('drag-over');
    }
  }
}

function handleTouchEnd(e) {
  if (!touchDragState) return;
  
  // Restore original card opacity
  const originalCard = e.currentTarget;
  originalCard.style.opacity = '1';
  
  // Remove ghost
  if (touchDragState.ghost) {
    touchDragState.ghost.remove();
  }
  
  // Remove drag-over highlights
  document.querySelectorAll('.calendar-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
  
  if (touchDragState.isDragging) {
    // Find the cell under the last touch point
    const touch = e.changedTouches[0];
    const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = elementBelow?.closest('.calendar-cell');
    
    if (cell && !cell.classList.contains('calendar-cell-locked')) {
      const dayIndex = parseInt(cell.dataset.day);
      const timeIndex = parseInt(cell.dataset.time);
      if (!isNaN(dayIndex) && !isNaN(timeIndex)) {
        performDrop(touchDragState.courseId, dayIndex, timeIndex);
      }
    }
  }
  
  touchDragState = null;
}

// ============================================================
// 14. GRAPH VISUALIZATION
// ============================================================

function drawGraph(activeSchedule = state.schedule) {
  const canvas = document.getElementById('conflict-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  // Resize to match display size
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (!state.courses.length || !state.conflictGraph) return;

  const courses = state.courses;
  const graph = state.conflictGraph.adjacencyList;
  const radius = Math.min(canvas.width, canvas.height) / 2 - 30;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  // Calculate positions in a circle
  const positions = {};
  courses.forEach((course, i) => {
    const angle = (i / courses.length) * 2 * Math.PI - Math.PI / 2;
    positions[course.id] = {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    };
  });
  
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const edgeColor = isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.15)';
  
  // Draw edges
  ctx.lineWidth = 1.5;
  courses.forEach(course => {
    const p1 = positions[course.id];
    const neighbors = graph.get(course.id) || new Set();
    neighbors.forEach(neighborId => {
      if (course.id < neighborId) {
        const p2 = positions[neighborId];
        if (p1 && p2) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = edgeColor;
          ctx.stroke();
        }
      }
    });
  });
  
  // Draw nodes
  const emptyNodeFill = isLight ? '#e2e8f0' : '#333';
  const emptyNodeStroke = isLight ? '#94a3b8' : '#666';

  courses.forEach(course => {
    const p = positions[course.id];
    let fillStyle = emptyNodeFill;
    let strokeStyle = emptyNodeStroke;
    
    if (activeSchedule && activeSchedule[course.id]) {
      fillStyle = course.color;
      strokeStyle = '#fff';
    }
    
    ctx.beginPath();
    ctx.arc(p.x, p.y, 14, 0, 2 * Math.PI);
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
    
    // Node Label
    ctx.fillStyle = (activeSchedule && activeSchedule[course.id]) ? '#fff' : (isLight ? '#334155' : '#fff');
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const shortId = course.id.replace('MK0', '').replace('MK', '');
    ctx.fillText(shortId, p.x, p.y);
  });
}
