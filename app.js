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
  versions: [],     // Array of { name, date, schedule, courses, rooms, timeSlots }
  activeFilter: { type: 'none', value: '' },
  dragCourseId: null, // Currently dragged course for validation
  history: [],       // Undo/Redo stack
  historyIndex: -1,  // Current position in history
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
    renderVersionList();
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
    renderVersionList();
    addLog('Aplikasi siap. Klik "Load Preset" atau tambahkan data manual.', 'info');
  }

  // Set theme icon on load
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  document.getElementById('theme-icon').textContent = currentTheme === 'dark' ? '🌓' : '☀️';

  // Show onboarding for first-time users
  if (!localStorage.getItem('onboarding-done')) {
    showOnboarding();
  }
}

function setupEventListeners() {
  document.getElementById('btn-preset').addEventListener('click', loadPreset);
  document.getElementById('btn-generate').addEventListener('click', generateSchedule);
  document.getElementById('btn-export').addEventListener('click', exportCSV);
  document.getElementById('btn-export-png').addEventListener('click', exportPNG);
  document.getElementById('btn-export-excel').addEventListener('click', exportExcel);
  document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);
  document.getElementById('btn-reset').addEventListener('click', resetAll);
  document.getElementById('btn-print').addEventListener('click', () => window.print());
  document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('btn-import-csv').addEventListener('click', () => document.getElementById('csv-file-input').click());
  document.getElementById('csv-file-input').addEventListener('change', handleCSVImport);
  document.getElementById('form-add-course').addEventListener('submit', handleAddCourse);
  document.getElementById('form-add-room').addEventListener('submit', handleAddRoom);
  document.getElementById('form-add-timeslot').addEventListener('submit', handleAddTimeSlot);
  document.getElementById('btn-save-version').addEventListener('click', saveVersion);
  document.getElementById('filter-type').addEventListener('change', handleFilterTypeChange);
  document.getElementById('filter-value').addEventListener('change', handleFilterValueChange);
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.getElementById('sidebar-search').addEventListener('input', handleSidebarSearch);
  document.getElementById('btn-toggle-dashboard').addEventListener('click', toggleDashboard);

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcut);
  
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
      versions: state.versions,
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
    if (data.versions) state.versions = data.versions;
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

  // Get lecturer availability from checkboxes
  const availCheckboxes = document.querySelectorAll('input[name="avail-day"]:checked');
  const lecturerAvailability = Array.from(availCheckboxes).map(cb => parseInt(cb.value));

  if (!name || !lecturer) return;

  const id = 'MK' + String(state.nextCourseId++).padStart(2, '0');
  const color = COURSE_COLORS[state.courses.length % COURSE_COLORS.length];

  state.courses.push({ id, name, lecturer, sks, semester: 2, color, preference, students, lecturerAvailability });
  renderCourseList();
  renderLegend();
  e.target.reset();
  // Reset default values
  document.getElementById('input-students').value = '30';
  document.querySelectorAll('input[name="avail-day"]').forEach(cb => cb.checked = true);
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

            // Tooltip events
            card.addEventListener('mouseenter', showTooltip);
            card.addEventListener('mousemove', moveTooltip);
            card.addEventListener('mouseleave', hideTooltip);
            
            card.style.borderLeftColor = course.color;
            card.style.background = hexToRgba(course.color, 0.12);

            // Check capacity warning
            const room = state.rooms.find(r => r.name === assignment.room);
            const capacityWarning = room && course.students > room.capacity;

            // Check lecturer availability warning
            const availWarning = course.lecturerAvailability && 
              course.lecturerAvailability.length > 0 && 
              !course.lecturerAvailability.includes(dayIndex);

            // Multi-slot badge
            const slotsNeeded = course.sks >= 4 ? 2 : 1;
            const multiSlotBadge = slotsNeeded > 1 ? '<span class="multi-slot-badge">2 Slot</span>' : '';

            card.innerHTML = `
              <span class="card-name" style="color: ${course.color}">${course.name}${multiSlotBadge}</span>
              <span class="card-detail">${course.lecturer} · ${course.students || '?'} mhs · Sem ${course.semester || '?'}</span>
              <span class="card-room">${capacityWarning || availWarning ? '⚠️' : '📍'} ${assignment.room}${room ? ` (${room.capacity})` : ''}</span>
            `;
            if (slotsNeeded > 1) card.classList.add('multi-slot');
            if (capacityWarning) {
              card.classList.add('capacity-warning');
            }
            if (availWarning) {
              card.classList.add('capacity-warning');
            }

            // Apply filter
            if (state.activeFilter.type !== 'none' && state.activeFilter.value) {
              const match = checkFilterMatch(course, assignment);
              if (!match) card.classList.add('filtered-out');
            }

            cell.appendChild(card);
          }
        }
      }

      // Check if this cell is a continuation of a multi-slot course above
      if (timeIndex > 0) {
        for (const [courseId, assignment] of Object.entries(schedule)) {
          const course = state.courses.find(c => c.id === courseId);
          if (course && course.sks >= 4 && assignment.dayIndex === dayIndex && assignment.timeIndex === timeIndex - 1) {
            cell.classList.add('continuation-cell');
            const marker = document.createElement('div');
            marker.className = 'continuation-marker';
            marker.style.borderLeftColor = course.color;
            marker.innerHTML = `↑ ${course.name} (lanjutan)`;
            cell.appendChild(marker);
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

  // Show progress bar
  const progressContainer = document.getElementById('progress-container');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';
  progressText.textContent = '0%';

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
      // Update progress bar
      const maxIter = 5000;
      const pct = Math.min(100, Math.round((stepData.iteration / maxIter) * 100));
      progressBar.style.width = pct + '%';
      progressText.textContent = pct + '%';

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

  // Hide progress bar
  progressBar.style.width = '100%';
  progressText.textContent = '100%';
  setTimeout(() => { progressContainer.style.display = 'none'; }, 1000);

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
  pushHistory();
  
  // Show dashboard
  const dashboardPanel = document.getElementById('dashboard-panel');
  if (dashboardPanel) {
    dashboardPanel.style.display = 'block';
    document.getElementById('btn-toggle-dashboard').textContent = '▼ Tutup';
  }
  renderDashboard();
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
  const courseId = e.currentTarget.dataset.courseId;
  e.dataTransfer.setData('text/plain', courseId);
  e.dataTransfer.effectAllowed = 'move';
  state.dragCourseId = courseId;

  // Highlight valid/invalid drop targets
  if (state.schedule) {
    requestAnimationFrame(() => highlightDropTargets(courseId));
  }
}

function handleDragEnter(e) {
  e.preventDefault();
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  // Don't add generic drag-over if we have validation classes
  if (!e.currentTarget.classList.contains('drop-valid') && !e.currentTarget.classList.contains('drop-invalid')) {
    e.currentTarget.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  clearDropHighlights();
  state.dragCourseId = null;
  
  if (!state.schedule) return;

  const courseId = e.dataTransfer.getData('text/plain');
  const dayIndex = parseInt(e.currentTarget.dataset.day);
  const timeIndex = parseInt(e.currentTarget.dataset.time);
  
  if (isNaN(dayIndex) || isNaN(timeIndex)) return;

  performDrop(courseId, dayIndex, timeIndex);
}

function highlightDropTargets(courseId) {
  const cells = document.querySelectorAll('.calendar-cell');
  cells.forEach(cell => {
    const dayIndex = parseInt(cell.dataset.day);
    const timeIndex = parseInt(cell.dataset.time);
    if (isNaN(dayIndex) || isNaN(timeIndex)) return;

    const validation = validateDrop(courseId, dayIndex, timeIndex, state.schedule, state.courses, state.rooms);
    if (validation.valid) {
      cell.classList.add('drop-valid');
    } else {
      cell.classList.add('drop-invalid');
    }
  });

  // Listen for dragend to clear highlights
  document.addEventListener('dragend', () => {
    clearDropHighlights();
    state.dragCourseId = null;
  }, { once: true });
}

function clearDropHighlights() {
  document.querySelectorAll('.calendar-cell').forEach(cell => {
    cell.classList.remove('drop-valid', 'drop-invalid', 'drop-warning', 'drag-over');
  });
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
    pushHistory();
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
  
  // Ensure minimum size so it can be scrolled if needed, preventing cutoff
  const rect = canvas.parentElement.getBoundingClientRect();
  const minSize = Math.max(rect.width, rect.height, 400);
  canvas.width = Math.max(rect.width, minSize);
  canvas.height = Math.max(rect.height, minSize);
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (!state.courses.length || !state.conflictGraph) return;

  const courses = state.courses;
  const graph = state.conflictGraph.adjacencyList;
  // Increase padding to prevent edges/nodes from being cut off
  const radius = Math.min(canvas.width, canvas.height) / 2 - 40;
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

// ============================================================
// 15. TOOLTIP (Hover Detail)
// ============================================================

function showTooltip(e) {
  const card = e.currentTarget;
  const courseId = card.dataset.courseId;
  if (!courseId || !state.schedule) return;

  const course = state.courses.find(c => c.id === courseId);
  const assignment = state.schedule[courseId];
  if (!course || !assignment) return;

  const room = state.rooms.find(r => r.name === assignment.room);
  const dayName = DAYS[assignment.dayIndex] || '?';
  const timeLabel = state.timeSlots[assignment.timeIndex]?.label || '?';

  // Check status
  const issues = [];
  if (room && course.students > room.capacity) {
    issues.push(`Kapasitas kurang (${room.capacity} < ${course.students})`);
  }
  if (course.lecturerAvailability && course.lecturerAvailability.length > 0 &&
    !course.lecturerAvailability.includes(assignment.dayIndex)) {
    issues.push(`Dosen tidak tersedia hari ${dayName}`);
  }

  const statusHtml = issues.length > 0
    ? `<div class="tooltip-status tooltip-bad">⚠️ ${issues.join(', ')}</div>`
    : `<div class="tooltip-status tooltip-ok">✅ Tidak ada konflik</div>`;

  const availDays = (course.lecturerAvailability || [0,1,2,3,4]).map(d => DAYS[d]?.slice(0,3)).join(', ');

  const tooltip = document.getElementById('tooltip');
  tooltip.innerHTML = `
    <div class="tooltip-title">
      <span style="color:${course.color}">●</span> ${course.name}
    </div>
    <div class="tooltip-row"><span>Dosen</span><span>${course.lecturer}</span></div>
    <div class="tooltip-row"><span>SKS</span><span>${course.sks}</span></div>
    <div class="tooltip-row"><span>Mahasiswa</span><span>${course.students || '?'}</span></div>
    <div class="tooltip-row"><span>Ruangan</span><span>${assignment.room}${room ? ` (kap. ${room.capacity})` : ''}</span></div>
    <div class="tooltip-row"><span>Jadwal</span><span>${dayName}, ${timeLabel}</span></div>
    <div class="tooltip-row"><span>Semester</span><span>${course.semester || '?'}</span></div>
    <div class="tooltip-row"><span>Hari Dosen</span><span>${availDays}</span></div>
    ${statusHtml}
  `;
  tooltip.style.display = 'block';
  requestAnimationFrame(() => tooltip.classList.add('show'));
}

function moveTooltip(e) {
  const tooltip = document.getElementById('tooltip');
  const x = e.clientX + 16;
  const y = e.clientY + 16;
  // Keep within viewport
  const maxX = window.innerWidth - 320;
  const maxY = window.innerHeight - 200;
  tooltip.style.left = Math.min(x, maxX) + 'px';
  tooltip.style.top = Math.min(y, maxY) + 'px';
}

function hideTooltip() {
  const tooltip = document.getElementById('tooltip');
  tooltip.classList.remove('show');
  setTimeout(() => { tooltip.style.display = 'none'; }, 150);
}

// ============================================================
// 16. FILTER CALENDAR
// ============================================================

function handleFilterTypeChange(e) {
  const type = e.target.value;
  const valueSelect = document.getElementById('filter-value');
  
  state.activeFilter.type = type;
  state.activeFilter.value = '';

  if (type === 'none') {
    valueSelect.style.display = 'none';
    // Re-render without filter
    if (state.schedule) renderCalendar(state.schedule);
    return;
  }

  // Populate filter value dropdown
  valueSelect.innerHTML = '<option value="">— Semua —</option>';
  let options = [];

  if (type === 'lecturer') {
    const lecturers = [...new Set(state.courses.map(c => c.lecturer))];
    options = lecturers.map(l => ({ value: l, label: `👨‍🏫 ${l}` }));
  } else if (type === 'room') {
    options = state.rooms.map(r => ({ value: r.name, label: `🏢 ${r.name} (${r.capacity})` }));
  } else if (type === 'semester') {
    const semesters = [...new Set(state.courses.map(c => c.semester))].sort();
    options = semesters.map(s => ({ value: String(s), label: `📚 Semester ${s}` }));
  }

  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    valueSelect.appendChild(option);
  });

  valueSelect.style.display = 'inline-block';
}

function handleFilterValueChange(e) {
  state.activeFilter.value = e.target.value;
  if (state.schedule) renderCalendar(state.schedule);
}

function checkFilterMatch(course, assignment) {
  const { type, value } = state.activeFilter;
  if (!value) return true;
  if (type === 'lecturer') return course.lecturer === value;
  if (type === 'room') return assignment.room === value;
  if (type === 'semester') return String(course.semester) === value;
  return true;
}

// ============================================================
// 17. VERSION MANAGEMENT
// ============================================================

function saveVersion() {
  const nameInput = document.getElementById('input-version-name');
  let name = nameInput.value.trim();
  if (!name) {
    name = `Versi ${state.versions.length + 1}`;
  }

  if (!state.schedule) {
    showNotification('Generate jadwal terlebih dahulu sebelum menyimpan versi!', 'warning');
    return;
  }

  const version = {
    name,
    date: new Date().toLocaleString('id-ID'),
    schedule: JSON.parse(JSON.stringify(state.schedule)),
    courses: JSON.parse(JSON.stringify(state.courses)),
    rooms: JSON.parse(JSON.stringify(state.rooms)),
    timeSlots: JSON.parse(JSON.stringify(state.timeSlots)),
  };

  state.versions.push(version);
  renderVersionList();
  nameInput.value = '';
  saveState();
  showNotification(`💾 Versi "${name}" berhasil disimpan!`, 'success');
  addLog(`💾 Versi disimpan: ${name}`, 'success');
}

function loadVersion(index) {
  const version = state.versions[index];
  if (!version) return;

  state.courses = JSON.parse(JSON.stringify(version.courses));
  state.rooms = JSON.parse(JSON.stringify(version.rooms));
  state.timeSlots = JSON.parse(JSON.stringify(version.timeSlots));
  state.schedule = JSON.parse(JSON.stringify(version.schedule));

  renderCourseList();
  renderRoomList();
  renderTimeSlotList();
  renderLegend();
  renderCalendar(state.schedule);
  renderStats({ conflicts: 0, temperature: 0, iteration: 'Loaded', bestPenalty: 0 });
  saveState();
  pushHistory();
  showNotification(`📂 Versi "${version.name}" berhasil dimuat!`, 'success');
  addLog(`📂 Memuat versi: ${version.name}`, 'info');
}

function deleteVersion(index) {
  const name = state.versions[index].name;
  state.versions.splice(index, 1);
  renderVersionList();
  saveState();
  showNotification(`🗑️ Versi "${name}" dihapus.`, 'info');
}

function renderVersionList() {
  const list = document.getElementById('version-list');
  const countBadge = document.getElementById('version-count');
  if (!list) return;

  list.innerHTML = '';
  countBadge.textContent = state.versions.length;

  state.versions.forEach((version, index) => {
    const item = document.createElement('div');
    item.className = 'version-item';
    item.innerHTML = `
      <span class="version-name" title="${version.name}">${version.name}</span>
      <span class="version-meta">${version.date}</span>
      <button class="btn-icon" onclick="loadVersion(${index})" title="Muat versi">📂</button>
      <button class="btn-icon" onclick="deleteVersion(${index})" title="Hapus versi">×</button>
    `;
    list.appendChild(item);
  });
}

// ============================================================
// 18. EXPORT EXCEL (SheetJS)
// ============================================================

function exportExcel() {
  if (!state.schedule || state.courses.length === 0) {
    showNotification('Generate jadwal terlebih dahulu!', 'warning');
    return;
  }

  if (typeof XLSX === 'undefined') {
    showNotification('Library SheetJS belum dimuat. Coba refresh halaman.', 'error');
    return;
  }

  // Build data array
  const data = [['Hari', 'Waktu', 'Mata Kuliah', 'Dosen', 'SKS', 'Jml Mahasiswa', 'Ruangan', 'Kapasitas', 'Semester']];

  const entries = Object.entries(state.schedule).sort((a, b) => {
    if (a[1].dayIndex !== b[1].dayIndex) return a[1].dayIndex - b[1].dayIndex;
    return a[1].timeIndex - b[1].timeIndex;
  });

  for (const [courseId, slot] of entries) {
    const course = state.courses.find(c => c.id === courseId);
    if (!course) continue;
    const timeLabel = state.timeSlots[slot.timeIndex]?.label || '';
    const room = state.rooms.find(r => r.name === slot.room);
    data.push([
      DAYS[slot.dayIndex],
      timeLabel,
      course.name,
      course.lecturer,
      course.sks,
      course.students || '',
      slot.room,
      room ? room.capacity : '',
      course.semester || ''
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  
  // Set column widths
  ws['!cols'] = [
    { wch: 10 }, { wch: 16 }, { wch: 22 }, { wch: 14 },
    { wch: 6 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Jadwal Kuliah');
  XLSX.writeFile(wb, 'jadwal_kuliah.xlsx');

  showNotification('📊 Jadwal berhasil diekspor ke Excel!', 'success');
  addLog('📊 Jadwal diekspor ke file jadwal_kuliah.xlsx', 'success');
}

// ============================================================
// 19. EXPORT PDF (jsPDF + AutoTable)
// ============================================================

function exportPDF() {
  if (!state.schedule || state.courses.length === 0) {
    showNotification('Generate jadwal terlebih dahulu!', 'warning');
    return;
  }

  if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
    showNotification('Library jsPDF belum dimuat. Coba refresh halaman.', 'error');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Jadwal Kuliah', 148, 15, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleString('id-ID')}`, 148, 22, { align: 'center' });

  // Build table data
  const entries = Object.entries(state.schedule).sort((a, b) => {
    if (a[1].dayIndex !== b[1].dayIndex) return a[1].dayIndex - b[1].dayIndex;
    return a[1].timeIndex - b[1].timeIndex;
  });

  const body = entries.map(([courseId, slot]) => {
    const course = state.courses.find(c => c.id === courseId);
    if (!course) return null;
    const timeLabel = state.timeSlots[slot.timeIndex]?.label || '';
    const room = state.rooms.find(r => r.name === slot.room);
    return [
      DAYS[slot.dayIndex],
      timeLabel,
      course.name,
      course.lecturer,
      course.sks,
      course.students || '-',
      slot.room,
      room ? room.capacity : '-',
    ];
  }).filter(Boolean);

  doc.autoTable({
    startY: 28,
    head: [['Hari', 'Waktu', 'Mata Kuliah', 'Dosen', 'SKS', 'Mahasiswa', 'Ruangan', 'Kapasitas']],
    body,
    styles: {
      fontSize: 8,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [94, 106, 210],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 247, 255],
    },
    theme: 'grid',
  });

  doc.save('jadwal_kuliah.pdf');

  showNotification('📄 Jadwal berhasil diekspor ke PDF!', 'success');
  addLog('📄 Jadwal diekspor ke file jadwal_kuliah.pdf', 'success');
}

// ============================================================
// 20. UNDO / REDO
// ============================================================

const MAX_HISTORY = 30;

function pushHistory() {
  if (!state.schedule) return;

  // Truncate any forward history if we branched
  if (state.historyIndex < state.history.length - 1) {
    state.history = state.history.slice(0, state.historyIndex + 1);
  }

  // Deep clone current schedule
  state.history.push(JSON.parse(JSON.stringify(state.schedule)));

  // Cap history size
  if (state.history.length > MAX_HISTORY) {
    state.history.shift();
  }

  state.historyIndex = state.history.length - 1;
  updateUndoRedoButtons();
}

function undo() {
  if (state.historyIndex <= 0) {
    showNotification('Tidak ada yang bisa di-undo.', 'info');
    return;
  }
  state.historyIndex--;
  state.schedule = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
  renderCalendar(state.schedule);
  renderDashboard();
  saveState();
  updateUndoRedoButtons();
  showNotification('↩️ Undo berhasil.', 'info');
  addLog('↩️ Undo jadwal.', 'info');
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) {
    showNotification('Tidak ada yang bisa di-redo.', 'info');
    return;
  }
  state.historyIndex++;
  state.schedule = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
  renderCalendar(state.schedule);
  renderDashboard();
  saveState();
  updateUndoRedoButtons();
  showNotification('↪️ Redo berhasil.', 'info');
  addLog('↪️ Redo jadwal.', 'info');
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  if (undoBtn) undoBtn.disabled = state.historyIndex <= 0;
  if (redoBtn) redoBtn.disabled = state.historyIndex >= state.history.length - 1;
}

// ============================================================
// 21. KEYBOARD SHORTCUTS
// ============================================================

function handleKeyboardShortcut(e) {
  // Don't trigger in input/textarea/select
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  const isCtrl = e.ctrlKey || e.metaKey;

  if (isCtrl && e.key === 'z') {
    e.preventDefault();
    undo();
  } else if (isCtrl && e.key === 'y') {
    e.preventDefault();
    redo();
  } else if (isCtrl && e.key === 's') {
    e.preventDefault();
    saveVersion();
  } else if (isCtrl && e.key === 'g') {
    e.preventDefault();
    generateSchedule();
  } else if (isCtrl && e.key === 'e') {
    e.preventDefault();
    exportExcel();
  }
}

// ============================================================
// 22. SIDEBAR SEARCH
// ============================================================

function handleSidebarSearch(e) {
  const query = e.target.value.toLowerCase().trim();
  
  // Filter course items
  const courseItems = document.querySelectorAll('#course-list .item');
  courseItems.forEach(item => {
    const text = item.textContent.toLowerCase();
    if (query && !text.includes(query)) {
      item.classList.add('search-hidden');
    } else {
      item.classList.remove('search-hidden');
    }
  });

  // Filter room items
  const roomItems = document.querySelectorAll('#room-list .item');
  roomItems.forEach(item => {
    const text = item.textContent.toLowerCase();
    if (query && !text.includes(query)) {
      item.classList.add('search-hidden');
    } else {
      item.classList.remove('search-hidden');
    }
  });

  // Filter timeslot items
  const timeItems = document.querySelectorAll('#timeslot-list .item');
  timeItems.forEach(item => {
    const text = item.textContent.toLowerCase();
    if (query && !text.includes(query)) {
      item.classList.add('search-hidden');
    } else {
      item.classList.remove('search-hidden');
    }
  });
}

// ============================================================
// 23. ONBOARDING TUTORIAL
// ============================================================

function showOnboarding() {
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  let currentStep = 0;
  const steps = overlay.querySelectorAll('.onboarding-step');
  const dots = overlay.querySelectorAll('.onboarding-dot');
  const nextBtn = document.getElementById('onboarding-next');
  const skipBtn = document.getElementById('onboarding-skip');
  const closeBtn = document.getElementById('onboarding-close');

  function goToStep(index) {
    steps.forEach(s => s.style.display = 'none');
    dots.forEach(d => d.classList.remove('active'));
    steps[index].style.display = 'block';
    dots[index].classList.add('active');
    currentStep = index;
    nextBtn.textContent = index === steps.length - 1 ? 'Mulai! 🚀' : 'Selanjutnya →';
  }

  function closeOnboarding() {
    overlay.style.display = 'none';
    localStorage.setItem('onboarding-done', 'true');
  }

  nextBtn.addEventListener('click', () => {
    if (currentStep < steps.length - 1) {
      goToStep(currentStep + 1);
    } else {
      closeOnboarding();
    }
  });

  skipBtn.addEventListener('click', closeOnboarding);
  closeBtn.addEventListener('click', closeOnboarding);

  // Dot navigation
  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      goToStep(parseInt(dot.dataset.dot));
    });
  });

  goToStep(0);
}

// ============================================================
// 24. DASHBOARD STATISTICS
// ============================================================

let chartInstances = {};

function toggleDashboard() {
  const panel = document.getElementById('dashboard-panel');
  const btn = document.getElementById('btn-toggle-dashboard');
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    btn.textContent = '▼ Tutup';
    renderDashboard();
  } else {
    panel.style.display = 'none';
    btn.textContent = '▲ Buka';
  }
}

function renderDashboard() {
  if (!state.schedule || state.courses.length === 0) return;
  
  const panel = document.getElementById('dashboard-panel');
  if (panel.style.display === 'none') return;

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const textColor = isLight ? '#334155' : '#e2e8f0';
  const gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';

  // --- 1. Room Utilization (Doughnut) ---
  const totalSlots = DAYS.length * state.timeSlots.filter(ts => !ts.locked).length;
  const roomUsage = {};
  state.rooms.forEach(r => { roomUsage[r.name] = 0; });
  for (const [, assignment] of Object.entries(state.schedule)) {
    if (roomUsage[assignment.room] !== undefined) {
      roomUsage[assignment.room]++;
    }
  }

  const roomLabels = Object.keys(roomUsage);
  const roomData = roomLabels.map(r => roomUsage[r]);
  const roomMax = roomLabels.map(() => totalSlots);
  const roomColors = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe'];

  renderChart('chart-room-util', 'doughnut', {
    labels: roomLabels,
    datasets: [{
      data: roomData,
      backgroundColor: roomColors.slice(0, roomLabels.length),
      borderWidth: 0,
      hoverOffset: 6,
    }]
  }, {
    plugins: {
      legend: { position: 'bottom', labels: { color: textColor, font: { size: 10 }, boxWidth: 10, padding: 8 } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw}/${totalSlots} slot (${Math.round(ctx.raw/totalSlots*100)}%)` } }
    },
    cutout: '60%',
  });

  // --- 2. Lecturer Load (Bar) ---
  const lecturerLoad = {};
  for (const [courseId] of Object.entries(state.schedule)) {
    const course = state.courses.find(c => c.id === courseId);
    if (course) {
      lecturerLoad[course.lecturer] = (lecturerLoad[course.lecturer] || 0) + 1;
    }
  }
  const lecLabels = Object.keys(lecturerLoad);
  const lecData = lecLabels.map(l => lecturerLoad[l]);

  renderChart('chart-lecturer-load', 'bar', {
    labels: lecLabels,
    datasets: [{
      label: 'Jml Matkul',
      data: lecData,
      backgroundColor: 'rgba(99, 102, 241, 0.6)',
      borderColor: '#6366f1',
      borderWidth: 1,
      borderRadius: 4,
    }]
  }, {
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: textColor, font: { size: 9 } }, grid: { display: false } },
      y: { ticks: { color: textColor, stepSize: 1, font: { size: 9 } }, grid: { color: gridColor } }
    },
  });

  // --- 3. Day Distribution (Bar) ---
  const dayDist = [0, 0, 0, 0, 0];
  for (const [, assignment] of Object.entries(state.schedule)) {
    if (assignment.dayIndex >= 0 && assignment.dayIndex < 5) {
      dayDist[assignment.dayIndex]++;
    }
  }

  renderChart('chart-day-dist', 'bar', {
    labels: DAYS.map(d => d.slice(0, 3)),
    datasets: [{
      label: 'Jml Matkul',
      data: dayDist,
      backgroundColor: ['#6366f1', '#8b5cf6', '#a78bfa', '#c084fc', '#d946ef'],
      borderWidth: 0,
      borderRadius: 4,
    }]
  }, {
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: textColor, font: { size: 9 } }, grid: { display: false } },
      y: { ticks: { color: textColor, stepSize: 1, font: { size: 9 } }, grid: { color: gridColor } }
    },
  });
}

function renderChart(canvasId, type, data, options) {
  if (typeof Chart === 'undefined') return;

  // Destroy existing chart if any
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }

  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  chartInstances[canvasId] = new Chart(ctx, {
    type,
    data,
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 600, easing: 'easeOutQuart' },
      ...options,
    }
  });
}
