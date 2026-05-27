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
  rooms: [],
  schedule: null,
  conflictGraph: null,
  isRunning: false,
  nextCourseId: 8, // Preset MK01-MK07, next = 8
};

// ============================================================
// 2. INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', init);

function init() {
  setupEventListeners();
  renderCalendarEmpty();
  renderStats(null);
  addLog('Aplikasi siap. Klik "Load Preset" atau tambahkan data manual.', 'info');
}

function setupEventListeners() {
  document.getElementById('btn-preset').addEventListener('click', loadPreset);
  document.getElementById('btn-generate').addEventListener('click', generateSchedule);
  document.getElementById('btn-export').addEventListener('click', exportCSV);
  document.getElementById('btn-reset').addEventListener('click', resetAll);
  document.getElementById('form-add-course').addEventListener('submit', handleAddCourse);
  document.getElementById('form-add-room').addEventListener('submit', handleAddRoom);
}

// ============================================================
// 3. PRESET DATA
// ============================================================

function loadPreset() {
  state.courses = PRESET_COURSES.map((c, i) => ({
    ...c,
    color: COURSE_COLORS[i % COURSE_COLORS.length],
  }));
  state.rooms = [...PRESET_ROOMS];
  state.schedule = null;
  state.nextCourseId = 8;

  renderCourseList();
  renderRoomList();
  renderCalendarEmpty();
  renderLegend();
  renderStats(null);
  showNotification('Data preset Semester 2 berhasil dimuat!', 'success');
  addLog('📋 Loaded preset: 7 mata kuliah, 4 ruangan', 'info');
}

// ============================================================
// 4. COURSE MANAGEMENT
// ============================================================

function handleAddCourse(e) {
  e.preventDefault();

  const nameInput = document.getElementById('input-course-name');
  const lecturerInput = document.getElementById('input-lecturer');
  const sksSelect = document.getElementById('input-sks');

  const name = nameInput.value.trim();
  const lecturer = lecturerInput.value.trim();
  const sks = parseInt(sksSelect.value) || 3;

  if (!name || !lecturer) return;

  const id = 'MK' + String(state.nextCourseId++).padStart(2, '0');
  const color = COURSE_COLORS[state.courses.length % COURSE_COLORS.length];

  state.courses.push({ id, name, lecturer, sks, semester: 2, color });
  renderCourseList();
  renderLegend();
  e.target.reset();
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
  showNotification(`"${name}" dihapus`, 'info');
}

// ============================================================
// 5. ROOM MANAGEMENT
// ============================================================

function handleAddRoom(e) {
  e.preventDefault();

  const roomInput = document.getElementById('input-room');
  const room = roomInput.value.trim().toUpperCase();

  if (!room) return;
  if (state.rooms.includes(room)) {
    showNotification(`Ruangan "${room}" sudah ada!`, 'warning');
    return;
  }

  state.rooms.push(room);
  renderRoomList();
  e.target.reset();
  showNotification(`Ruangan "${room}" ditambahkan!`, 'success');
}

function removeRoom(index) {
  const room = state.rooms[index];
  state.rooms.splice(index, 1);
  renderRoomList();
  showNotification(`Ruangan "${room}" dihapus`, 'info');
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
        <span class="course-detail">${course.lecturer} · ${course.sks} SKS</span>
      </div>
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
      <span>🚪 ${room}</span>
      <button class="btn-remove" title="Hapus">×</button>
    `;
    el.querySelector('.btn-remove').addEventListener('click', () => removeRoom(index));
    container.appendChild(el);
  });

  document.getElementById('room-count').textContent = state.rooms.length;
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
  TIME_SLOTS.forEach((slot, timeIndex) => {
    // Time label
    const timeLabel = document.createElement('div');
    timeLabel.className = 'calendar-time-label';
    timeLabel.textContent = slot.label;
    grid.appendChild(timeLabel);

    // Day cells
    DAYS.forEach((day, dayIndex) => {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell';

      // Find all courses assigned to this (day, time)
      for (const [courseId, assignment] of Object.entries(schedule)) {
        if (assignment.dayIndex === dayIndex && assignment.timeIndex === timeIndex) {
          const course = state.courses.find((c) => c.id === courseId);
          if (course) {
            const card = document.createElement('div');
            card.className = 'course-card';
            card.id = `card-${courseId}`;
            card.style.borderLeftColor = course.color;
            card.style.background = hexToRgba(course.color, 0.12);
            card.innerHTML = `
              <span class="card-name" style="color: ${course.color}">${course.name}</span>
              <span class="card-detail">${course.lecturer}</span>
              <span class="card-room">📍 ${assignment.room}</span>
            `;
            cell.appendChild(card);
          }
        }
      }

      grid.appendChild(cell);
    });
  });
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
  elTemp.textContent = data.temperature.toFixed(2);
  elIter.textContent = data.iteration.toLocaleString();
  elFitness.textContent = data.bestPenalty;

  // Temperature bar: percentage of initial temp
  const tempPercent = Math.max(0, (data.temperature / 100) * 100);
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

  // ── Step 2: Generate all available slots ──
  const allSlots = generateAllSlots(state.rooms);
  addLog(`📦 Total slot tersedia: ${allSlots.length} (${DAYS.length} hari × ${TIME_SLOTS.length} waktu × ${state.rooms.length} ruangan)`, 'info');

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
    }
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
}

// ============================================================
// 10. RESET
// ============================================================

function resetAll() {
  state.courses = [];
  state.rooms = [];
  state.schedule = null;
  state.conflictGraph = null;
  state.nextCourseId = 1;

  document.getElementById('log-content').innerHTML = '';
  document.getElementById('calendar-wrapper').classList.remove('solved');
  document.getElementById('calendar-legend').innerHTML = '';

  renderCourseList();
  renderRoomList();
  renderCalendarEmpty();
  renderStats(null);
  showNotification('Semua data direset', 'info');
  addLog('🗑️ Data direset. Mulai dari awal.', 'info');
}

// ============================================================
// 11. EXPORT CSV
// ============================================================

function exportCSV() {
  if (!state.schedule) {
    showNotification('Generate jadwal terlebih dahulu!', 'error');
    return;
  }

  let csv = 'Hari,Waktu,Mata Kuliah,Dosen,SKS,Ruangan\n';

  // Sort by day → time
  const entries = Object.entries(state.schedule).sort((a, b) => {
    if (a[1].dayIndex !== b[1].dayIndex) return a[1].dayIndex - b[1].dayIndex;
    return a[1].timeIndex - b[1].timeIndex;
  });

  for (const [courseId, slot] of entries) {
    const course = state.courses.find((c) => c.id === courseId);
    if (course) {
      csv += `${DAYS[slot.dayIndex]},${TIME_SLOTS[slot.timeIndex].label},${course.name},${course.lecturer},${course.sks},${slot.room}\n`;
    }
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'jadwal_kuliah.csv';
  link.click();
  URL.revokeObjectURL(link.href);

  showNotification('📥 Jadwal berhasil diekspor ke CSV!', 'success');
  addLog('💾 Jadwal diekspor ke file jadwal_kuliah.csv', 'success');
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
