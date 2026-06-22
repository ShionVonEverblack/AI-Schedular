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
  lang: 'id',
};

// ============================================================
// 2. INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', init);

function init() {
  // Try to load saved language first
  state.lang = localStorage.getItem('scheduler-lang') || 'id';

  // Check for shared personal schedule view
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('view') === 'personal' && urlParams.get('data')) {
    showSharedPersonalSchedule(urlParams.get('data'));
    return;
  }

  // Try to load saved state from localStorage
  const loaded = loadState();
  
  if (!loaded) {
    state.timeSlots = TIME_SLOTS.map(ts => ({ ...ts }));
    state.nextTimeSlotId = state.timeSlots.length + 1;
  }

  setupEventListeners();
  applyLanguage();
  
  if (loaded && state.courses.length > 0) {
    rebuildConflictGraph();
    renderCourseList();
    renderRoomList();
    renderTimeSlotList();
    renderLegend();
    renderVersionList();
    if (state.schedule) {
      renderCalendar(state.schedule);
      renderConflictCenter();
      
      const maxTimeIndex = state.timeSlots.length;
      const roomCapacities = buildRoomCapacities();
      const result = calculateFitness(state.schedule, state.conflictGraph, state.courses, maxTimeIndex, roomCapacities);
      renderStats({
        conflicts: result.conflicts,
        temperature: 0,
        iteration: 'Saved',
        bestPenalty: result.penalty
      });
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
  document.getElementById('btn-autofix').addEventListener('click', autoFixConflicts);
  document.getElementById('btn-export').addEventListener('click', exportCSV);
  document.getElementById('btn-export-png').addEventListener('click', exportPNG);
  document.getElementById('btn-export-excel').addEventListener('click', exportExcel);
  document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);
  document.getElementById('btn-reset').addEventListener('click', resetAll);
  document.getElementById('btn-lang-toggle').addEventListener('click', toggleLanguage);
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
  document.getElementById('btn-heatmap').addEventListener('click', toggleHeatmap);

  // Modal Availability
  document.getElementById('btn-set-availability').addEventListener('click', openAvailabilityModal);
  document.getElementById('btn-close-modal-avail').addEventListener('click', closeAvailabilityModal);
  document.getElementById('btn-save-avail').addEventListener('click', saveAvailabilityModal);
  document.getElementById('btn-reset-avail').addEventListener('click', resetAvailabilityModal);

  // Modal Personal Export
  document.getElementById('btn-personal-export').addEventListener('click', openPersonalExportModal);
  document.getElementById('btn-close-modal-personal').addEventListener('click', closePersonalExportModal);
  document.getElementById('btn-cancel-personal').addEventListener('click', closePersonalExportModal);
  document.getElementById('btn-do-personal-export').addEventListener('click', doPersonalExport);
  document.getElementById('personal-filter-type').addEventListener('change', updatePersonalFilterOptions);
  document.getElementById('personal-filter-value').addEventListener('change', updatePersonalPreview);
  document.getElementById('btn-show-qr').addEventListener('click', showPersonalQR);
  document.getElementById('btn-copy-share-url').addEventListener('click', copyShareUrl);

  // Batch Export & Version Compare
  document.getElementById('btn-export-batch').addEventListener('click', exportBatchExcel);
  document.getElementById('btn-compare-versions').addEventListener('click', openCompareModal);
  document.getElementById('btn-close-modal-compare').addEventListener('click', closeCompareModal);
  document.getElementById('btn-close-compare').addEventListener('click', closeCompareModal);
  document.getElementById('compare-version-a').addEventListener('change', updateComparisonTable);
  document.getElementById('compare-version-b').addEventListener('change', updateComparisonTable);
  document.getElementById('compare-diff-only').addEventListener('change', updateComparisonTable);

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
// 2C. AVAILABILITY MODAL
// ============================================================

let tempAvailability = []; // Stores ["day-time"] strings temporarily

function openAvailabilityModal() {
  const modal = document.getElementById('modal-availability');
  const gridContainer = document.getElementById('availability-grid-container');
  const hiddenInput = document.getElementById('input-availability');
  
  // Parse current value
  let currentVal = hiddenInput.value;
  if (currentVal === 'all') {
    tempAvailability = [];
    for (let d = 0; d < DAYS.length; d++) {
      for (let t = 0; t < state.timeSlots.length; t++) {
        tempAvailability.push(`${d}-${t}`);
      }
    }
  } else {
    tempAvailability = JSON.parse(currentVal);
  }

  // Render Grid
  let html = `<table class="avail-grid"><thead><tr><th>Hari / Jam</th>`;
  for (let t = 0; t < state.timeSlots.length; t++) {
    html += `<th>${state.timeSlots[t].start}</th>`;
  }
  html += `</tr></thead><tbody>`;

  for (let d = 0; d < DAYS.length; d++) {
    html += `<tr><td><strong>${DAYS[d]}</strong></td>`;
    for (let t = 0; t < state.timeSlots.length; t++) {
      const key = `${d}-${t}`;
      const isChecked = tempAvailability.includes(key) ? 'checked' : '';
      html += `<td><label><input type="checkbox" class="cb-avail" data-key="${key}" ${isChecked} /></label></td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;

  gridContainer.innerHTML = html;
  modal.style.display = 'flex';
}

function closeAvailabilityModal() {
  document.getElementById('modal-availability').style.display = 'none';
}

function saveAvailabilityModal() {
  const checkboxes = document.querySelectorAll('.cb-avail:checked');
  tempAvailability = Array.from(checkboxes).map(cb => cb.dataset.key);
  
  const totalSlots = DAYS.length * state.timeSlots.length;
  const hiddenInput = document.getElementById('input-availability');
  const btn = document.getElementById('btn-set-availability');

  if (tempAvailability.length === totalSlots) {
    hiddenInput.value = 'all';
    btn.textContent = 'Atur Waktu (Semua)';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-secondary');
  } else {
    hiddenInput.value = JSON.stringify(tempAvailability);
    btn.textContent = `Atur Waktu (${tempAvailability.length} Jam)`;
    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-primary');
  }

  closeAvailabilityModal();
}

function resetAvailabilityModal() {
  document.querySelectorAll('.cb-avail').forEach(cb => cb.checked = true);
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
  const typeSelect = document.getElementById('input-course-type');

  const name = nameInput.value.trim();
  const lecturer = lecturerInput.value.trim();
  const sks = parseInt(sksSelect.value) || 3;
  const preference = prefSelect ? prefSelect.value : 'none';
  const students = parseInt(studentsInput.value) || 30;
  const type = typeSelect ? typeSelect.value : 'Teori';

  // Get lecturer availability from hidden input
  const availInput = document.getElementById('input-availability').value;
  let lecturerAvailability = [];
  if (availInput === 'all') {
    // Fill all day-time slots
    for (let d = 0; d < DAYS.length; d++) {
      for (let t = 0; t < state.timeSlots.length; t++) {
        lecturerAvailability.push(`${d}-${t}`);
      }
    }
  } else {
    try {
      lecturerAvailability = JSON.parse(availInput);
    } catch(e) {
      lecturerAvailability = [];
    }
  }

  if (!name || !lecturer) return;

  const id = 'MK' + String(state.nextCourseId++).padStart(2, '0');
  const colorInput = document.getElementById('input-course-color');
  const color = colorInput ? colorInput.value : COURSE_COLORS[state.courses.length % COURSE_COLORS.length];

  state.courses.push({ id, name, lecturer, sks, semester: 2, color, preference, students, lecturerAvailability, type });
  renderCourseList();
  renderLegend();
  e.target.reset();
  
  // Reset default values
  document.getElementById('input-students').value = '30';
  document.getElementById('input-availability').value = 'all';
  if (typeSelect) typeSelect.value = 'Teori';
  if (colorInput) colorInput.value = '#6366f1';
  const btnAvail = document.getElementById('btn-set-availability');
  btnAvail.textContent = 'Atur Waktu (Default: Semua)';
  btnAvail.classList.remove('btn-primary');
  btnAvail.classList.add('btn-secondary');
  saveState();
  showNotification(`"${name}" ditambahkan!`, 'success');
}

function removeCourse(index) {
  const name = state.courses[index].name;
  state.courses.splice(index, 1);
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
      <div class="form-row" style="gap:4px; margin-top:4px; align-items: center;">
        <input type="number" class="edit-input" id="edit-course-students-${index}" value="${course.students || 30}" min="1" style="width:50px;" />
        <select class="edit-input" id="edit-course-type-${index}" style="font-size:0.7rem; flex: 1;">
          <option value="Teori" ${course.type === 'Teori' ? 'selected' : ''}>Teori</option>
          <option value="Praktikum" ${course.type === 'Praktikum' ? 'selected' : ''}>Praktikum</option>
        </select>
        <input type="color" id="edit-course-color-${index}" value="${course.color || '#6366f1'}" style="width:24px; height:24px; border:1px solid var(--border); border-radius:4px; background:transparent; cursor:pointer; padding:0;" title="Ganti warna" />
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
  const type = document.getElementById(`edit-course-type-${index}`).value;
  const color = document.getElementById(`edit-course-color-${index}`).value;
  
  if (!name || !lecturer) {
    showNotification('Nama dan dosen tidak boleh kosong!', 'warning');
    return;
  }
  
  state.courses[index].name = name;
  state.courses[index].lecturer = lecturer;
  state.courses[index].students = students;
  state.courses[index].type = type;
  state.courses[index].color = color;
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
  const typeSelect = document.getElementById('input-room-type');
  const roomType = typeSelect ? typeSelect.value : 'Kelas';

  if (!roomName) return;
  if (state.rooms.some(r => r.name === roomName)) {
    showNotification(`Ruangan "${roomName}" sudah ada!`, 'warning');
    return;
  }

  state.rooms.push({ name: roomName, capacity, type: roomType });
  renderRoomList();
  e.target.reset();
  document.getElementById('input-room-capacity').value = '40';
  if (typeSelect) typeSelect.value = 'Kelas';
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
        <select class="edit-input" id="edit-room-type-${index}" style="font-size:0.7rem;">
          <option value="Kelas" ${room.type === 'Kelas' ? 'selected' : ''}>Kelas</option>
          <option value="Lab" ${room.type === 'Lab' ? 'selected' : ''}>Lab</option>
          <option value="Auditorium" ${room.type === 'Auditorium' ? 'selected' : ''}>Auditorium</option>
        </select>
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
  
  const type = document.getElementById(`edit-room-type-${index}`).value;
  
  if (!name) {
    showNotification('Nama ruangan tidak boleh kosong!', 'warning');
    return;
  }
  
  state.rooms[index].name = name;
  state.rooms[index].capacity = capacity;
  state.rooms[index].type = type;
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
  const isEn = state.lang === 'en';

  state.courses.forEach((course, index) => {
    const el = document.createElement('div');
    el.className = 'course-item';
    const sksLabel = isEn ? 'Credits' : 'SKS';
    const studentsLabel = isEn ? 'students' : 'mhs';
    const typeLabel = course.type === 'Praktikum' ? (isEn ? 'Practical' : 'Praktikum') : (isEn ? 'Theory' : 'Teori');
    el.innerHTML = `
      <div class="course-color" style="background: ${course.color}; box-shadow: 0 0 6px ${course.color}40;"></div>
      <div class="course-info">
        <span class="course-name">${course.name}</span>
        <span class="course-detail">${course.lecturer} · ${course.sks} ${sksLabel} · ${course.students || '?'} ${studentsLabel} <span class="badge-type ${course.type === 'Praktikum' ? 'badge-lab' : 'badge-kelas'}">${typeLabel}</span></span>
      </div>
      <button class="btn-icon" title="Edit" onclick="startEditCourse(${index})">✏️</button>
      <button class="btn-remove" title="${isEn ? 'Delete' : 'Hapus'}">×</button>
    `;
    el.querySelector('.btn-remove').addEventListener('click', () => removeCourse(index));
    container.appendChild(el);
  });

  document.getElementById('course-count').textContent = state.courses.length;
}

function renderRoomList() {
  const container = document.getElementById('room-list');
  container.innerHTML = '';
  const isEn = state.lang === 'en';

  state.rooms.forEach((room, index) => {
    const el = document.createElement('div');
    el.className = 'room-item';
    const typeLabel = room.type === 'Lab' ? 'Lab' : (room.type === 'Auditorium' ? 'Auditorium' : (isEn ? 'Class' : 'Kelas'));
    const capacityLabel = isEn ? 'seats' : 'kursi';
    el.innerHTML = `
      <span>🚪 ${room.name} <span class="badge-type ${room.type === 'Lab' ? 'badge-lab' : (room.type === 'Auditorium' ? 'badge-auditorium' : 'badge-kelas')}">${typeLabel}</span> <small style="color:var(--text-muted);">(${room.capacity} ${capacityLabel})</small></span>
      <button class="btn-icon" title="Edit" onclick="startEditRoom(${index})">✏️</button>
      <button class="btn-remove" title="${isEn ? 'Delete' : 'Hapus'}">×</button>
    `;
    el.querySelector('.btn-remove').addEventListener('click', () => removeRoom(index));
    container.appendChild(el);
  });

  document.getElementById('room-count').textContent = state.rooms.length;
}

function renderTimeSlotList() {
  const container = document.getElementById('timeslot-list');
  container.innerHTML = '';
  const isEn = state.lang === 'en';

  state.timeSlots.forEach((slot, index) => {
    const el = document.createElement('div');
    el.className = 'timeslot-item' + (slot.locked ? ' timeslot-locked' : '');
    const lockTitle = slot.locked ? (isEn ? 'Unlock' : 'Buka Kunci') : (isEn ? 'Lock (Break)' : 'Kunci (Istirahat)');
    el.innerHTML = `
      <span>${slot.locked ? '🔒' : '⏰'} ${slot.label}</span>
      <button class="btn-icon btn-lock" title="${lockTitle}" onclick="toggleTimeslotLock(${index})">${slot.locked ? '🔓' : '🔒'}</button>
      <button class="btn-remove" title="${isEn ? 'Delete' : 'Hapus'}">×</button>
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

  DAYS.forEach((day, index) => {
    const dayHeader = document.createElement('div');
    dayHeader.className = 'calendar-day-header';
    dayHeader.textContent = getDayName(index, state.lang === 'en');
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
            const availWarning = !isLecturerAvailable(course.lecturerAvailability, dayIndex, timeIndex);

            // Multi-slot badge
            const isEn = state.lang === 'en';
            const slotsNeeded = course.sks >= 4 ? 2 : 1;
            const multiSlotBadge = slotsNeeded > 1 ? `<span class="multi-slot-badge">${isEn ? '2 Slots' : '2 Slot'}</span>` : '';

            card.innerHTML = `
              <span class="card-name" style="color: ${course.color}">${course.name}${multiSlotBadge}</span>
              <span class="card-detail">${course.lecturer} · ${course.students || '?'} ${isEn ? 'students' : 'mhs'} · Sem ${course.semester || '?'}</span>
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
  const elScore = document.getElementById('stat-score');

  if (!data) {
    elConflicts.textContent = '—';
    elTemp.textContent = '—';
    elIter.textContent = '—';
    elFitness.textContent = '—';
    if (elScore) elScore.textContent = '—';
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

  // Calculate and render quality score
  const scheduleToCalculate = data.schedule || state.schedule;
  const score = calculateScheduleScore(scheduleToCalculate);
  if (elScore) {
    elScore.textContent = score + '%';
    if (score >= 90) {
      elScore.style.color = 'var(--success)';
    } else if (score >= 60) {
      elScore.style.color = 'var(--warning)';
    } else {
      elScore.style.color = 'var(--danger)';
    }
  }
}

// ============================================================
// 8B. SCORING & LANGUAGE HELPERS
// ============================================================

function rebuildConflictGraph() {
  if (state.courses && state.courses.length > 0) {
    const constraints = buildConstraints(state.courses);
    state.conflictGraph = ConflictGraph.fromConstraints(state.courses, constraints);
  } else {
    state.conflictGraph = null;
  }
}

function calculateScheduleScore(schedule) {
  if (!schedule || Object.keys(schedule).length === 0) return 0;
  
  let hardCount = 0;
  let softCount = 0;
  const entries = Object.entries(schedule);
  const courses = state.courses;
  const rooms = state.rooms;
  const timeSlots = state.timeSlots;
  const graph = state.conflictGraph;

  for (let i = 0; i < entries.length; i++) {
    const [idA, slotA] = entries[i];
    const courseA = courses.find(c => c.id === idA);
    if (!courseA) continue;

    // Check lecturer availability
    if (!isLecturerAvailable(courseA.lecturerAvailability, slotA.dayIndex, slotA.timeIndex)) {
      hardCount++;
    }

    // Check room capacity and type suitability
    const room = rooms.find(r => r.name === slotA.room);
    if (room) {
      if (courseA.students > room.capacity) {
        hardCount++;
      }
      const roomType = room.type || 'Kelas';
      const cType = courseA.type || 'Teori';
      if (cType === 'Praktikum' && roomType !== 'Lab') {
        hardCount++;
      } else if (cType === 'Teori' && roomType === 'Lab') {
        hardCount++;
      }
    }

    // Check soft constraints
    if (courseA.preference === 'avoid-morning' && slotA.timeIndex === 0) {
      softCount++;
    }
    if (courseA.preference === 'avoid-evening' && slotA.timeIndex === timeSlots.length - 1) {
      softCount++;
    }

    for (let j = i + 1; j < entries.length; j++) {
      const [idB, slotB] = entries[j];
      const courseB = courses.find(c => c.id === idB);
      if (!courseB) continue;

      const spanA = slotA.span || 1;
      const spanB = slotB.span || 1;
      const sameTime = slotA.dayIndex === slotB.dayIndex &&
        Math.max(slotA.timeIndex, slotB.timeIndex) <= Math.min(slotA.timeIndex + spanA - 1, slotB.timeIndex + spanB - 1);

      if (sameTime) {
        if (slotA.room === slotB.room) {
          hardCount++;
        }
        if (graph && graph.isConflict(idA, idB)) {
          hardCount++;
        }
      }
    }
  }

  // Weekly imbalance penalty
  const counts = Array(DAYS.length).fill(0);
  for (const slot of Object.values(schedule)) {
    if (slot.dayIndex >= 0 && slot.dayIndex < DAYS.length) {
      counts[slot.dayIndex]++;
    }
  }
  const totalCourses = Object.keys(schedule).length;
  let imbalancePenalty = 0;
  if (totalCourses > 0) {
    const target = totalCourses / DAYS.length;
    let sumDiff = 0;
    for (let c of counts) {
      sumDiff += Math.abs(c - target);
    }
    imbalancePenalty = sumDiff * 1.5;
  }

  // Room utilization penalty
  let totalUtil = 0;
  let countUtil = 0;
  for (const [courseId, slot] of Object.entries(schedule)) {
    const course = courses.find(c => c.id === courseId);
    const room = rooms.find(r => r.name === slot.room);
    if (course && room && room.capacity > 0) {
      totalUtil += course.students / room.capacity;
      countUtil++;
    }
  }
  const avgUtil = countUtil > 0 ? (totalUtil / countUtil) : 1.0;
  const utilPenalty = Math.max(0, (0.7 - avgUtil) * 15);

  const score = Math.round(Math.max(0, Math.min(100, 100 - (hardCount * 15) - (softCount * 3) - imbalancePenalty - utilPenalty)));
  return score;
}

function getDayName(dayIndex, isEn) {
  const DAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const DAYS_ID = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
  return isEn ? (DAYS_EN[dayIndex] || '') : (DAYS_ID[dayIndex] || '');
}

function translateReason(reason, isEn) {
  if (!reason) return '';
  if (!isEn) return reason;
  let translated = reason;
  translated = translated.replace(/Dosen sama/g, 'Same lecturer');
  translated = translated.replace(/Semester sama/g, 'Same semester');
  translated = translated.replace(/Kelas/g, 'Class');
  return translated;
}

function translateMessage(msg) {
  if (!msg) return msg;
  
  // Translate day names
  const daysID = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
  const daysEN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  for (let i = 0; i < daysID.length; i++) {
    const regex = new RegExp('\\b' + daysID[i] + '\\b', 'g');
    msg = msg.replace(regex, daysEN[i]);
  }

  const translations = [
    { pattern: /Data preset Semester 2 berhasil dimuat!/i, replacement: 'Semester 2 preset data loaded successfully!' },
    { pattern: /"(.+?)" ditambahkan!/i, replacement: '"$1" added!' },
    { pattern: /"(.+?)" dihapus/i, replacement: '"$1" deleted' },
    { pattern: /Nama dan dosen tidak boleh kosong!/i, replacement: 'Name and lecturer cannot be empty!' },
    { pattern: /Mata kuliah berhasil diperbarui\./i, replacement: 'Course successfully updated.' },
    { pattern: /Ruangan "(.+?)" sudah ada!/i, replacement: 'Room "$1" already exists!' },
    { pattern: /Ruangan "(.+?)" \((.+?)\) ditambahkan!/i, replacement: 'Room "$1" ($2) added!' },
    { pattern: /Ruangan "(.+?)" dihapus/i, replacement: 'Room "$1" deleted' },
    { pattern: /Nama ruangan tidak boleh kosong!/i, replacement: 'Room name cannot be empty!' },
    { pattern: /Ruangan berhasil diperbarui\./i, replacement: 'Room successfully updated.' },
    { pattern: /Jam mulai harus lebih awal dari jam selesai!/i, replacement: 'Start time must be earlier than end time!' },
    { pattern: /Jam kuliah "(.+?)" sudah ada!/i, replacement: 'Time slot "$1" already exists!' },
    { pattern: /Jam kuliah "(.+?)" ditambahkan!/i, replacement: 'Time slot "$1" added!' },
    { pattern: /Jam kuliah "(.+?)" dihapus/i, replacement: 'Time slot "$1" deleted' },
    { pattern: /🔒 "(.+?)" dikunci \(istirahat\)/i, replacement: '🔒 "$1" locked (break)' },
    { pattern: /🔓 "(.+?)" dibuka kembali/i, replacement: '🔓 "$1" unlocked' },
    { pattern: /Tambahkan mata kuliah terlebih dahulu!/i, replacement: 'Please add courses first!' },
    { pattern: /Tambahkan ruangan terlebih dahulu!/i, replacement: 'Please add rooms first!' },
    { pattern: /Tambahkan jam kuliah terlebih dahulu!/i, replacement: 'Please add time slots first!' },
    { pattern: /Semua jam kuliah dikunci! Buka setidaknya satu\./i, replacement: 'All time slots are locked! Unlock at least one.' },
    { pattern: /🎉 Jadwal berhasil dibuat tanpa konflik!/i, replacement: '🎉 Schedule successfully generated without conflicts!' },
    { pattern: /Semua data direset/i, replacement: 'All data reset' },
    { pattern: /📥 Jadwal berhasil diekspor ke CSV!/i, replacement: '📥 Schedule successfully exported to CSV!' },
    { pattern: /📥 Daftar mata kuliah berhasil diekspor ke CSV!/i, replacement: '📥 Course list successfully exported to CSV!' },
    { pattern: /Generate jadwal terlebih dahulu!/i, replacement: 'Please generate a schedule first!' },
    { pattern: /📸 Memproses screenshot\.\.\./i, replacement: '📸 Processing screenshot...' },
    { pattern: /📸 Jadwal berhasil diekspor ke PNG!/i, replacement: '📸 Schedule successfully exported to PNG!' },
    { pattern: /Gagal export PNG: (.+?)/i, replacement: 'Failed to export PNG: $1' },
    { pattern: /Gagal membaca file CSV: (.+?)/i, replacement: 'Failed to read CSV file: $1' },
    { pattern: /File CSV kosong atau tidak valid!/i, replacement: 'CSV file empty or invalid!' },
    { pattern: /Gagal: Jam ini dikunci sebagai waktu istirahat!/i, replacement: 'Failed: This time slot is locked as a break!' },
    { pattern: /Gagal: Ruangan (.+?) sudah terpakai di waktu ini!/i, replacement: 'Failed: Room $1 is already occupied at this time!' },
    { pattern: /Modifikasi menghasilkan jadwal bentrok!/i, replacement: 'Modification results in a conflicting schedule!' },
    { pattern: /Jadwal berhasil digeser\./i, replacement: 'Schedule successfully moved.' },
    { pattern: /Generate jadwal terlebih dahulu sebelum menyimpan versi!/i, replacement: 'Please generate a schedule before saving versions!' },
    { pattern: /💾 Versi "(.+?)" berhasil disimpan!/i, replacement: '💾 Version "$1" successfully saved!' },
    { pattern: /📂 Versi "(.+?)" berhasil dimuat!/i, replacement: '📂 Version "$1" successfully loaded!' },
    { pattern: /🗑️ Versi "(.+?)" dihapus\./i, replacement: '🗑️ Version "$1" deleted.' },
    { pattern: /Library SheetJS belum dimuat\. Coba refresh halaman\./i, replacement: 'SheetJS library not loaded. Try refreshing the page.' },
    { pattern: /📊 Jadwal berhasil diekspor ke Excel!/i, replacement: '📊 Schedule successfully exported to Excel!' },
    { pattern: /Library jsPDF belum dimuat\. Coba refresh halaman\./i, replacement: 'jsPDF library not loaded. Try refreshing the page.' },
    { pattern: /📄 Jadwal berhasil diekspor ke PDF!/i, replacement: '📄 Schedule successfully exported to PDF!' },
    { pattern: /Pilih dosen atau kelas terlebih dahulu!/i, replacement: 'Please select a lecturer or class first!' },
    { pattern: /Tampilkan QR Code/i, replacement: 'Show QR Code' },
    { pattern: /📋 Link berhasil disalin ke clipboard!/i, replacement: '📋 Link copied to clipboard!' },
    { pattern: /Gagal menyalin link\./i, replacement: 'Failed to copy link.' },
    { pattern: /Gagal membuat QR Code\./i, replacement: 'Failed to generate QR Code.' },
    { pattern: /Tidak ada yang bisa di-undo\./i, replacement: 'Nothing to undo.' },
    { pattern: /Tidak ada yang bisa di-redo\./i, replacement: 'Nothing to redo.' },
    { pattern: /↩️ Undo berhasil\./i, replacement: '↩️ Undo successful.' },
    { pattern: /↪️ Redo berhasil\./i, replacement: '↪️ Redo successful.' },
    { pattern: /✅ Tidak ada konflik untuk diperbaiki!/i, replacement: '✅ No conflicts to fix!' },
    { pattern: /🔧 Auto-Fix: Memperbaiki (.+?) matkul yang bentrok\.\.\./i, replacement: '🔧 Auto-Fix: Fixing $1 conflicting courses...' },
    { pattern: /🎉 Auto-Fix berhasil! Semua konflik teratasi!/i, replacement: '🎉 Auto-Fix successful! All conflicts resolved!' },
    { pattern: /🔧 Auto-Fix selesai\. Sisa konflik: (.+?)/i, replacement: '🔧 Auto-Fix finished. Remaining conflicts: $1' },
    { pattern: /🔧 Auto-Fix selesai\./i, replacement: '🔧 Auto-Fix finished.' },
    { pattern: /🔨 Membangun graf konflik \(adjacency list\)\.\.\./i, replacement: '🔨 Building conflict graph (adjacency list)...' },
    { pattern: /📊 Graf konflik: (.+?) node \(matkul\), (.+?) edge \(konflik\)/i, replacement: '📊 Conflict graph: $1 nodes (courses), $2 edges (conflicts)' },
    { pattern: /   ↳ (.+?) ⟷ (.+?) \((.+?)\)/i, replacement: (match, p1, p2, p3) => `   ↳ ${p1} ⟷ ${p2} (${translateReason(p3, true)})` },
    { pattern: /   ↳ \.\.\. dan (.+?) edge lainnya/i, replacement: '   ↳ ... and $1 other edges' },
    { pattern: /📦 Total slot tersedia: (.+?)/i, replacement: '📦 Total slots available: $1' },
    { pattern: /   ✅ (.+?) → (.+?) (.+?) \((.+?)\)/i, replacement: '   ✅ $1 → $2 $3 ($4)' },
    { pattern: /   ⚠️ (.+?) — tidak ditemukan slot yang valid/i, replacement: '   ⚠️ $1 — no valid slot found' },
    { pattern: /📂 Data sebelumnya berhasil dimuat dari penyimpanan lokal\./i, replacement: '📂 Previous data loaded from local storage.' },
    { pattern: /Aplikasi siap\. Klik "Load Preset" atau tambahkan data manual\./i, replacement: 'Application ready. Click "Load Preset" or add data manually.' },
    { pattern: /↩️ Undo jadwal\./i, replacement: '↩️ Undo schedule.' },
    { pattern: /↪️ Redo jadwal\./i, replacement: '↪️ Redo schedule.' },
    { pattern: /⚠️ Swap dibatalkan: Ruangan (.+?) penuh pada Hari (.+?) Waktu (.+?)\./i, replacement: '⚠️ Swap cancelled: Room $1 full on Day $2 Time $3.' },
    { pattern: /⚠️ Swap manual: Terdapat (.+?) konflik\./i, replacement: '⚠️ Manual swap: $1 conflicts exist.' },
    { pattern: /✨ Swap manual sukses tanpa konflik\./i, replacement: '✨ Manual swap successful without conflicts.' },
    { pattern: /💾 Versi disimpan: (.+?)/i, replacement: '💾 Version saved: $1' },
    { pattern: /📂 Memuat versi: (.+?)/i, replacement: '📂 Loading version: $1' },
  ];

  for (const trans of translations) {
    if (trans.pattern.test(msg)) {
      return msg.replace(trans.pattern, trans.replacement);
    }
  }
  return msg;
}

function toggleLanguage() {
  state.lang = state.lang === 'id' ? 'en' : 'id';
  localStorage.setItem('scheduler-lang', state.lang);
  applyLanguage();
  showNotification(state.lang === 'en' ? 'Language changed to English' : 'Bahasa diubah ke Bahasa Indonesia', 'info');
}

function applyLanguage() {
  const isEn = state.lang === 'en';
  
  // Toggle button text
  const btnToggle = document.getElementById('btn-lang-toggle');
  if (btnToggle) {
    btnToggle.textContent = isEn ? '🌐 EN' : '🌐 ID';
  }

  // Header Subtitle
  const subtitle = document.querySelector('.header-subtitle');
  if (subtitle) subtitle.textContent = isEn ? 'Automated Course Scheduling' : 'Penjadwalan Kuliah Otomatis';

  // Search box placeholder
  const searchInput = document.getElementById('sidebar-search');
  if (searchInput) searchInput.placeholder = isEn ? '🔍 Search courses, lecturers, rooms...' : '🔍 Cari matkul, dosen, ruangan...';

  // Panel headers
  const courseHeader = document.querySelector('#course-list').parentNode.querySelector('.panel-header h3');
  if (courseHeader) courseHeader.textContent = isEn ? '📚 Courses' : '📚 Mata Kuliah';
  
  const roomHeader = document.querySelector('#room-list').parentNode.querySelector('.panel-header h3');
  if (roomHeader) roomHeader.textContent = isEn ? '🏢 Rooms' : '🏢 Ruangan';
  
  const timeslotHeader = document.querySelector('#timeslot-list').parentNode.querySelector('.panel-header h3');
  if (timeslotHeader) timeslotHeader.textContent = isEn ? '⏰ Time Slots' : '⏰ Jam Kuliah';
  
  const versionHeader = document.querySelector('#version-list').parentNode.querySelector('.panel-header h3');
  if (versionHeader) versionHeader.textContent = isEn ? '📂 Schedule Versions' : '📂 Versi Jadwal';

  // Course Form placeholders & preference options
  const courseNameInput = document.getElementById('input-course-name');
  if (courseNameInput) courseNameInput.placeholder = isEn ? 'Course Name' : 'Nama Mata Kuliah';
  
  const lecturerInput = document.getElementById('input-lecturer');
  if (lecturerInput) lecturerInput.placeholder = isEn ? 'Lecturer' : 'Dosen';
  
  const studentsInput = document.getElementById('input-students');
  if (studentsInput) studentsInput.placeholder = isEn ? 'Student Count' : 'Jml Mahasiswa';

  const prefNone = document.querySelector('#input-preference option[value="none"]');
  if (prefNone) prefNone.textContent = isEn ? 'No Preference' : 'Tanpa Preferensi';
  
  const prefMorning = document.querySelector('#input-preference option[value="avoid-morning"]');
  if (prefMorning) prefMorning.textContent = isEn ? 'Avoid Morning' : 'Hindari Pagi';
  
  const prefEvening = document.querySelector('#input-preference option[value="avoid-evening"]');
  if (prefEvening) prefEvening.textContent = isEn ? 'Avoid Evening' : 'Hindari Sore';

  const typeTeori = document.querySelector('#input-course-type option[value="Teori"]');
  if (typeTeori) typeTeori.textContent = isEn ? 'Theory' : 'Teori';
  
  const typePraktikum = document.querySelector('#input-course-type option[value="Praktikum"]');
  if (typePraktikum) typePraktikum.textContent = isEn ? 'Practical' : 'Praktikum';

  const labelColor = document.querySelector('label[for="input-course-color"]');
  if (labelColor) labelColor.textContent = isEn ? '🎨 Card Color:' : '🎨 Warna Kartu:';

  const labelAvail = document.querySelector('.availability-label');
  if (labelAvail) labelAvail.textContent = isEn ? '📆 Teaching Availability:' : '📆 Waktu Mengajar:';

  const btnAvail = document.getElementById('btn-set-availability');
  if (btnAvail) btnAvail.textContent = isEn ? 'Set Time (Default: All)' : 'Atur Waktu (Default: Semua)';

  const btnAddCourse = document.querySelector('#form-add-course button[type="submit"]');
  if (btnAddCourse) btnAddCourse.textContent = isEn ? '+ Add Course' : '+ Tambah Matkul';

  // Room Form
  const roomNameInput = document.getElementById('input-room');
  if (roomNameInput) roomNameInput.placeholder = isEn ? 'Room Code' : 'Kode Ruangan';
  
  const capacityInput = document.getElementById('input-room-capacity');
  if (capacityInput) capacityInput.placeholder = isEn ? 'Capacity' : 'Kapasitas';

  const btnAddRoom = document.querySelector('#form-add-room button[type="submit"]');
  if (btnAddRoom) btnAddRoom.textContent = isEn ? '+ Add' : '+ Tambah';

  // Time Slot Form
  const btnAddTimeSlot = document.querySelector('#form-add-timeslot button[type="submit"]');
  if (btnAddTimeSlot) btnAddTimeSlot.textContent = isEn ? '+ Add Time Slot' : '+ Tambah Jam';

  // Versioning
  const versionNameInput = document.getElementById('input-version-name');
  if (versionNameInput) versionNameInput.placeholder = isEn ? 'Version name...' : 'Nama versi...';
  
  const btnSaveVersion = document.getElementById('btn-save-version');
  if (btnSaveVersion) btnSaveVersion.textContent = isEn ? '💾 Save' : '💾 Simpan';

  const btnCompare = document.getElementById('btn-compare-versions');
  if (btnCompare) btnCompare.textContent = isEn ? '🔍 Compare Versions' : '🔍 Bandingkan Versi';

  // Actions
  const btnPreset = document.getElementById('btn-preset');
  if (btnPreset) btnPreset.textContent = isEn ? '📋 Load Preset' : '📋 Load Preset';

  const btnGen = document.getElementById('btn-generate');
  if (btnGen && !state.isRunning) btnGen.textContent = isEn ? '⚡ Generate Schedule' : '⚡ Generate Jadwal';

  const btnAutoFix = document.getElementById('btn-autofix');
  if (btnAutoFix) btnAutoFix.textContent = isEn ? '🔧 Auto-Fix Conflicts' : '🔧 Auto-Fix Konflik';

  const btnReset = document.getElementById('btn-reset');
  if (btnReset) btnReset.textContent = isEn ? '🗑️ Reset' : '🗑️ Reset';

  const btnPersonal = document.getElementById('btn-personal-export');
  if (btnPersonal) btnPersonal.textContent = isEn ? '👤 Print Personal Schedule' : '👤 Cetak Jadwal Personal';

  // Calendar
  const calHeader = document.querySelector('.calendar-title-bar h2');
  if (calHeader) {
    calHeader.firstChild.textContent = isEn ? '📅 Course Schedule ' : '📅 Jadwal Kuliah ';
  }
  
  const btnPrint = document.getElementById('btn-print');
  if (btnPrint) btnPrint.textContent = isEn ? '🖨️ Print' : '🖨️ Cetak';

  const filterNone = document.querySelector('#filter-type option[value="none"]');
  if (filterNone) filterNone.textContent = isEn ? '🔍 All' : '🔍 Semua';
  
  const filterLecturer = document.querySelector('#filter-type option[value="lecturer"]');
  if (filterLecturer) filterLecturer.textContent = isEn ? '👨‍🏫 Lecturer' : '👨‍🏫 Dosen';
  
  const filterRoom = document.querySelector('#filter-type option[value="room"]');
  if (filterRoom) filterRoom.textContent = isEn ? '🏢 Room' : '🏢 Ruangan';
  
  const filterSemester = document.querySelector('#filter-type option[value="semester"]');
  if (filterSemester) filterSemester.textContent = isEn ? '📚 Semester' : '📚 Semester';

  // Stats Bar Labels
  const lblConflicts = document.querySelector('#stat-conflicts');
  if (lblConflicts) lblConflicts.parentNode.querySelector('.stat-label').textContent = isEn ? 'Conflicts' : 'Konflik';
  
  const lblTemp = document.querySelector('#stat-temp');
  if (lblTemp) lblTemp.parentNode.querySelector('.stat-label').textContent = isEn ? 'Temperature (T)' : 'Suhu (T)';
  
  const lblIter = document.querySelector('#stat-iter');
  if (lblIter) lblIter.parentNode.querySelector('.stat-label').textContent = isEn ? 'Iterations' : 'Iterasi';
  
  const lblFitness = document.querySelector('#stat-fitness');
  if (lblFitness) lblFitness.parentNode.querySelector('.stat-label').textContent = isEn ? 'Best Fitness' : 'Best Fitness';
  
  const lblScore = document.querySelector('#stat-score');
  if (lblScore) lblScore.parentNode.querySelector('.stat-label').textContent = isEn ? 'Quality Score' : 'Skor Kualitas';

  // Conflict Center
  const ccHeader = document.querySelector('.conflict-header h3');
  if (ccHeader) ccHeader.textContent = isEn ? '🚨 Conflict Center' : '🚨 Conflict Center';

  // Dashboard Title
  const dashHeader = document.querySelector('.dashboard-header h3');
  if (dashHeader) dashHeader.textContent = isEn ? '📊 Statistics Dashboard' : '📊 Dashboard Statistik';

  const btnToggleDash = document.getElementById('btn-toggle-dashboard');
  if (btnToggleDash) {
    const isClosed = btnToggleDash.textContent.includes('Tutup') || btnToggleDash.textContent.includes('Close');
    if (isClosed) {
      btnToggleDash.textContent = isEn ? '▼ Close' : '▼ Tutup';
    } else {
      btnToggleDash.textContent = isEn ? '▲ Open' : '▲ Buka';
    }
  }

  const chartCards = document.querySelectorAll('.chart-card h4');
  if (chartCards.length >= 3) {
    chartCards[0].textContent = isEn ? '🏢 Room Utilization' : '🏢 Utilisasi Ruangan';
    chartCards[1].textContent = isEn ? '👨‍🏫 Lecturer Load' : '👨‍🏫 Beban Dosen';
    chartCards[2].textContent = isEn ? '📅 Daily Distribution' : '📅 Distribusi per Hari';
  }

  // Log and Graph Titles
  const logTitle = document.querySelector('.log-panel h3');
  if (logTitle) logTitle.textContent = isEn ? '🖥️ Algorithm Log' : '🖥️ Log Algoritma';
  
  const graphTitle = document.querySelector('.graph-panel h3');
  if (graphTitle) graphTitle.textContent = isEn ? '🕸️ Conflict Graph (Color = Schedule)' : '🕸️ Graf Konflik (Warna = Jadwal)';

  // Modals text update
  // Availability Modal
  const modalAvailHeader = document.querySelector('#modal-availability .modal-header h3');
  if (modalAvailHeader) modalAvailHeader.textContent = isEn ? 'Set Lecturer Teaching Availability' : 'Atur Ketersediaan Waktu Dosen';
  
  const modalAvailDesc = document.querySelector('#modal-availability .modal-body p');
  if (modalAvailDesc) modalAvailDesc.textContent = isEn ? 'Check the times this lecturer is AVAILABLE to teach.' : 'Centang jam berapa saja dosen ini BISA mengajar.';
  
  const btnResetAvail = document.getElementById('btn-reset-avail');
  if (btnResetAvail) btnResetAvail.textContent = isEn ? 'Select All' : 'Pilih Semua';
  
  const btnSaveAvail = document.getElementById('btn-save-avail');
  if (btnSaveAvail) btnSaveAvail.textContent = isEn ? 'Save' : 'Simpan';

  // Personal Export Modal
  const modalPersHeader = document.querySelector('#modal-personal-export .modal-header h3');
  if (modalPersHeader) modalPersHeader.textContent = isEn ? '👤 Print Personal Schedule' : '👤 Cetak Jadwal Personal';
  
  const modalPersDesc = document.querySelector('#modal-personal-export .modal-body p');
  if (modalPersDesc) modalPersDesc.textContent = isEn ? 'Select Lecturer or Class to print their specific schedule.' : 'Pilih Dosen atau Kelas untuk mencetak jadwal spesifik mereka.';
  
  const labelsPers = document.querySelectorAll('#modal-personal-export .modal-body label');
  if (labelsPers.length >= 3) {
    labelsPers[0].textContent = isEn ? 'Filter:' : 'Filter:';
    labelsPers[1].textContent = isEn ? 'Choose:' : 'Pilih:';
    labelsPers[2].textContent = isEn ? 'Format:' : 'Format:';
  }

  const optPersLect = document.querySelector('#personal-filter-type option[value="lecturer"]');
  if (optPersLect) optPersLect.textContent = isEn ? '👨‍🏫 Per Lecturer' : '👨‍🏫 Per Dosen';
  
  const optPersClass = document.querySelector('#personal-filter-type option[value="class"]');
  if (optPersClass) optPersClass.textContent = isEn ? '🏫 Per Class' : '🏫 Per Kelas';

  const btnCancelPers = document.getElementById('btn-cancel-personal');
  if (btnCancelPers) btnCancelPers.textContent = isEn ? 'Cancel' : 'Batal';
  
  const btnDoPers = document.getElementById('btn-do-personal-export');
  if (btnDoPers) btnDoPers.textContent = isEn ? '📥 Export' : '📥 Ekspor';

  const qrDesc = document.querySelector('#personal-qr-section span');
  if (qrDesc) qrDesc.textContent = isEn ? 'Scan this QR to view the personal schedule on mobile, or copy the link below.' : 'Scan QR ini untuk melihat jadwal personal via HP, atau salin tautan di bawah.';
  
  const btnCopyShare = document.getElementById('btn-copy-share-url');
  if (btnCopyShare) btnCopyShare.textContent = isEn ? 'Copy' : 'Salin';

  // Version Compare Modal
  const modalCompHeader = document.querySelector('#modal-version-compare .modal-header h3');
  if (modalCompHeader) modalCompHeader.textContent = isEn ? '🔍 Version Comparison (Diff View)' : '🔍 Perbandingan Versi (Diff View)';
  
  const modalCompDesc = document.querySelector('#modal-version-compare .modal-body p');
  if (modalCompDesc) modalCompDesc.textContent = isEn ? 'Compare two schedule versions side-by-side to see differences in time slots and rooms.' : 'Bandingkan dua versi jadwal secara berdampingan untuk melihat perbedaan slot waktu dan ruangan.';

  const labelsComp = document.querySelectorAll('#modal-version-compare .modal-body label');
  if (labelsComp.length >= 3) {
    labelsComp[0].textContent = isEn ? 'Version A (Base):' : 'Versi A (Basis):';
    labelsComp[1].textContent = isEn ? 'Version B (Compare):' : 'Versi B (Pembanding):';
    const checkboxLabel = document.querySelector('#modal-version-compare .modal-body label[for="compare-diff-only"]') || labelsComp[2];
    if (checkboxLabel) {
      const chk = document.getElementById('compare-diff-only');
      checkboxLabel.innerHTML = '';
      if (chk) checkboxLabel.appendChild(chk);
      checkboxLabel.appendChild(document.createTextNode(isEn ? ' Show differences only' : ' Tampilkan perbedaan saja'));
    }
  }

  const btnCloseCompare = document.getElementById('btn-close-compare');
  if (btnCloseCompare) btnCloseCompare.textContent = isEn ? 'Close' : 'Tutup';

  // Onboarding text
  const onboardingTitle0 = document.querySelector('.onboarding-step[data-step="0"] h2');
  if (onboardingTitle0) onboardingTitle0.textContent = isEn ? 'Welcome to AI Auto-Scheduler!' : 'Selamat Datang di AI Auto-Scheduler!';
  const onboardingP0_1 = document.querySelector('.onboarding-step[data-step="0"] p:nth-of-type(1)');
  if (onboardingP0_1) onboardingP0_1.textContent = isEn ? 'AI-powered automated course scheduling application. Let\'s start a quick tour.' : 'Aplikasi penjadwalan kuliah otomatis berbasis kecerdasan buatan. Mari mulai tur singkat.';
  const onboardingP0_2 = document.querySelector('.onboarding-step[data-step="0"] p:nth-of-type(2)');
  if (onboardingP0_2) onboardingP0_2.textContent = isEn ? 'Use a desktop or larger screen for the best experience.' : 'Gunakan desktop atau layar yang lebih besar untuk pengalaman terbaik.';

  const onboardingTitle1 = document.querySelector('.onboarding-step[data-step="1"] h2');
  if (onboardingTitle1) onboardingTitle1.textContent = isEn ? '1. Add Data' : '1. Tambahkan Data';
  const onboardingP1 = document.querySelector('.onboarding-step[data-step="1"] p');
  if (onboardingP1) onboardingP1.innerHTML = isEn ? 'Fill in courses, rooms, and time slots in the <strong>left sidebar</strong>. Or click <strong>"📋 Load Preset"</strong> for sample data.' : 'Isi mata kuliah, ruangan, dan jam kuliah di <strong>sidebar kiri</strong>. Atau klik <strong>"📋 Load Preset"</strong> untuk data contoh.';

  const onboardingTitle2 = document.querySelector('.onboarding-step[data-step="2"] h2');
  if (onboardingTitle2) onboardingTitle2.textContent = isEn ? '2. Generate Schedule' : '2. Generate Jadwal';
  const onboardingP2 = document.querySelector('.onboarding-step[data-step="2"] p');
  if (onboardingP2) onboardingP2.textContent = isEn ? 'Click "⚡ Generate Schedule" and watch the AI assemble an optimal schedule without conflicts.' : 'Klik "⚡ Generate Jadwal" dan saksikan AI menyusun jadwal optimal tanpa konflik.';

  const onboardingTitle3 = document.querySelector('.onboarding-step[data-step="3"] h2');
  if (onboardingTitle3) onboardingTitle3.textContent = isEn ? '3. Modify & Export' : '3. Modifikasi & Export';
  const onboardingP3 = document.querySelector('.onboarding-step[data-step="3"] p');
  if (onboardingP3) onboardingP3.innerHTML = isEn ? '<strong>Drag & drop</strong> cards for manual adjustments. Then export to <strong>CSV, Excel, PDF, or PNG</strong>. Use <strong>Ctrl+Z</strong> to undo!' : '<strong>Drag & drop</strong> kartu untuk penyesuaian manual. Lalu export ke <strong>CSV, Excel, PDF, atau PNG</strong>. Gunakan <strong>Ctrl+Z</strong> untuk undo!';

  const btnSkip = document.getElementById('onboarding-skip');
  if (btnSkip) btnSkip.textContent = isEn ? 'Skip' : 'Lewati';

  const btnTheme = document.getElementById('btn-theme-toggle');
  if (btnTheme) {
    btnTheme.title = isEn ? 'Switch Light/Dark Mode' : 'Ganti Mode Terang/Gelap';
  }

  // Refresh lists
  renderTimeSlotList();
  renderCourseList();
  renderRoomList();
  renderLegend();
  if (state.schedule) {
    renderCalendar(state.schedule);
    renderConflictCenter();
  }
}

// ============================================================
// 8C. CONFLICT CENTER (first duplicate placeholder, deleted)
// ============================================================

// ============================================================
// 9. GENERATE SCHEDULE (SA + Animation)
// ============================================================

function buildRoomCapacities() {
  const caps = {};
  for (const room of state.rooms) {
    caps[room.name] = {
      capacity: room.capacity,
      type: room.type || 'Kelas'
    };
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
  renderConflictCenter();
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
  document.getElementById('conflict-center').style.display = 'none';
  
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
      const isLab = name.toLowerCase().includes('praktikum') || name.toLowerCase().includes('lab') || name.toLowerCase().includes('pr.');
      const type = isLab ? 'Praktikum' : 'Teori';

      // Avoid duplicate course names
      if (!state.courses.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
        state.courses.push({ id, name: name.trim(), lecturer: lecturer.trim(), sks, semester: 2, color, preference: 'none', students, type });
        importedCourses++;
      }

      // Import room if present and not duplicate
      if (roomName && roomName.trim()) {
        const rName = roomName.trim().toUpperCase();
        if (!state.rooms.some(r => r.name === rName)) {
          const capacity = parseInt(capacityStr) || 40;
          const isLabRoom = rName.toLowerCase().includes('lab') || rName.toLowerCase().includes('l.');
          const rType = isLabRoom ? 'Lab' : 'Kelas';
          state.rooms.push({ name: rName, capacity, type: rType });
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
      const isLab = name.toLowerCase().includes('praktikum') || name.toLowerCase().includes('lab') || name.toLowerCase().includes('pr.');
      const type = isLab ? 'Praktikum' : 'Teori';

      if (!state.courses.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
        state.courses.push({ id, name: name.trim(), lecturer: lecturer.trim(), sks, semester: 2, color, preference: 'none', students, type });
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

  // Cek apakah sel tujuan sudah terisi matkul lain di ruangan yang sama
  let isOccupied = false;
  const assignmentToMove = state.schedule[courseId];
  if (!assignmentToMove) return;

  const roomName = assignmentToMove.room;
  const spanThis = assignmentToMove.span || 1;

  for (const [id, assignment] of Object.entries(state.schedule)) {
    if (id === courseId) continue;
    const spanOther = assignment.span || 1;
    const sameTime = 
        assignment.dayIndex === dayIndex &&
        Math.max(assignment.timeIndex, timeIndex) <= Math.min(assignment.timeIndex + spanOther - 1, timeIndex + spanThis - 1);

    if (sameTime && assignment.room === roomName) {
      isOccupied = true;
      break;
    }
  }

  if (isOccupied) {
    showNotification(`Gagal: Ruangan ${roomName} sudah terpakai di waktu ini!`, 'warning');
    addLog(`⚠️ Swap dibatalkan: Ruangan ${roomName} penuh pada Hari ${dayIndex} Waktu ${timeIndex}.`, 'warning');
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
    renderConflictCenter();
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
  const isEn = state.lang === 'en';
  const dayName = getDayName(assignment.dayIndex, isEn);
  const timeLabel = state.timeSlots[assignment.timeIndex]?.label || '?';

  // Check status
  const issues = [];
  if (room && course.students > room.capacity) {
    issues.push(isEn ? `Insufficient capacity (${room.capacity} < ${course.students})` : `Kapasitas kurang (${room.capacity} < ${course.students})`);
  }
  if (!isLecturerAvailable(course.lecturerAvailability, assignment.dayIndex, assignment.timeIndex)) {
    issues.push(isEn ? `Lecturer unavailable at this time` : `Dosen tidak tersedia di waktu ini`);
  }

  const statusHtml = issues.length > 0
    ? `<div class="tooltip-status tooltip-bad">⚠️ ${issues.join(', ')}</div>`
    : `<div class="tooltip-status tooltip-ok">${isEn ? '✅ No conflicts' : '✅ Tidak ada konflik'}</div>`;

  let availStr = isEn ? "Various (See Details)" : "Bervariasi (Lihat Detail)";
  if (!course.lecturerAvailability || course.lecturerAvailability.length === 0) {
    availStr = isEn ? "All Hours" : "Semua Jam";
  } else if (typeof course.lecturerAvailability[0] === 'number') {
    availStr = course.lecturerAvailability.map(d => getDayName(d, isEn).slice(0,3)).join(', ');
  }

  const tooltip = document.getElementById('tooltip');
  tooltip.innerHTML = `
    <div class="tooltip-title">
      <span style="color:${course.color}">●</span> ${course.name}
    </div>
    <div class="tooltip-row"><span>${isEn ? 'Lecturer' : 'Dosen'}</span><span>${course.lecturer}</span></div>
    <div class="tooltip-row"><span>${isEn ? 'Credits' : 'SKS'}</span><span>${course.sks}</span></div>
    <div class="tooltip-row"><span>${isEn ? 'Students' : 'Mahasiswa'}</span><span>${course.students || '?'}</span></div>
    <div class="tooltip-row"><span>${isEn ? 'Room' : 'Ruangan'}</span><span>${assignment.room}${room ? ` (${isEn ? 'cap.' : 'kap.'} ${room.capacity})` : ''}</span></div>
    <div class="tooltip-row"><span>${isEn ? 'Schedule' : 'Jadwal'}</span><span>${dayName}, ${timeLabel}</span></div>
    <div class="tooltip-row"><span>${isEn ? 'Semester' : 'Semester'}</span><span>${course.semester || '?'}</span></div>
    <div class="tooltip-row"><span>${isEn ? 'Availability' : 'Ketersediaan'}</span><span>${availStr}</span></div>
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

  rebuildConflictGraph();
  renderCourseList();
  renderRoomList();
  renderTimeSlotList();
  renderLegend();
  renderCalendar(state.schedule);
  renderConflictCenter();
  
  const maxTimeIndex = state.timeSlots.length;
  const roomCapacities = buildRoomCapacities();
  const result = calculateFitness(state.schedule, state.conflictGraph, state.courses, maxTimeIndex, roomCapacities);
  renderStats({
    conflicts: result.conflicts,
    temperature: 0,
    iteration: 'Loaded',
    bestPenalty: result.penalty
  });

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
// 19B. PERSONAL EXPORT (Per Dosen / Per Kelas)
// ============================================================

function openPersonalExportModal() {
  if (!state.schedule || state.courses.length === 0) {
    showNotification('Generate jadwal terlebih dahulu!', 'warning');
    return;
  }

  document.getElementById('modal-personal-export').style.display = 'flex';
  document.getElementById('personal-qr-section').style.display = 'none';
  updatePersonalFilterOptions();
}

function closePersonalExportModal() {
  document.getElementById('modal-personal-export').style.display = 'none';
}

function updatePersonalFilterOptions() {
  const filterType = document.getElementById('personal-filter-type').value;
  const filterValueSelect = document.getElementById('personal-filter-value');
  filterValueSelect.innerHTML = '<option value="">— Pilih —</option>';

  if (filterType === 'lecturer') {
    // Get unique lecturers
    const lecturers = [...new Set(state.courses.map(c => c.lecturer))].sort();
    lecturers.forEach(lec => {
      const opt = document.createElement('option');
      opt.value = lec;
      opt.textContent = lec;
      filterValueSelect.appendChild(opt);
    });
  } else if (filterType === 'class') {
    // Extract classes from course names (e.g., "Basis Data A" → "A", "Pemrograman Web B" → "B")
    const classSet = new Set();
    state.courses.forEach(c => {
      const match = c.name.match(/\s([A-Z])$/i);
      if (match) {
        classSet.add(match[1].toUpperCase());
      }
    });
    // Also add course names as-is for non-class-based courses
    if (classSet.size === 0) {
      // Fallback: group by each course name
      state.courses.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        filterValueSelect.appendChild(opt);
      });
    } else {
      const classes = [...classSet].sort();
      classes.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = cls;
        opt.textContent = `Kelas ${cls}`;
        filterValueSelect.appendChild(opt);
      });
    }
  }

  // Clear preview
  const preview = document.getElementById('personal-preview');
  preview.style.display = 'none';
  preview.innerHTML = '';
  document.getElementById('personal-qr-section').style.display = 'none';
  preview.style.display = 'none';
  preview.innerHTML = '';
}

function getFilteredEntries() {
  if (!state.schedule) return [];

  const filterType = document.getElementById('personal-filter-type').value;
  const filterValue = document.getElementById('personal-filter-value').value;
  if (!filterValue) return [];

  const entries = Object.entries(state.schedule).sort((a, b) => {
    if (a[1].dayIndex !== b[1].dayIndex) return a[1].dayIndex - b[1].dayIndex;
    return a[1].timeIndex - b[1].timeIndex;
  });

  return entries.filter(([courseId]) => {
    const course = state.courses.find(c => c.id === courseId);
    if (!course) return false;

    if (filterType === 'lecturer') {
      return course.lecturer === filterValue;
    } else if (filterType === 'class') {
      const match = course.name.match(/\s([A-Z])$/i);
      if (match) {
        return match[1].toUpperCase() === filterValue.toUpperCase();
      }
      return course.name === filterValue;
    }
    return false;
  });
}

function updatePersonalPreview() {
  const entries = getFilteredEntries();
  const preview = document.getElementById('personal-preview');

  if (entries.length === 0) {
    preview.style.display = 'none';
    preview.innerHTML = '';
    return;
  }

  let html = `<table class="avail-grid" style="font-size: 0.75rem;">
    <thead><tr>
      <th>Hari</th><th>Waktu</th><th>Mata Kuliah</th><th>Dosen</th><th>Ruangan</th>
    </tr></thead><tbody>`;

  for (const [courseId, slot] of entries) {
    const course = state.courses.find(c => c.id === courseId);
    if (!course) continue;
    const timeLabel = state.timeSlots[slot.timeIndex]?.label || '';
    html += `<tr>
      <td>${DAYS[slot.dayIndex]}</td>
      <td>${timeLabel}</td>
      <td style="text-align:left; padding-left: 8px;">${course.name}</td>
      <td>${course.lecturer}</td>
      <td>${slot.room}</td>
    </tr>`;
  }

  html += `</tbody></table>`;
  preview.innerHTML = html;
  preview.style.display = 'block';
}

function doPersonalExport() {
  const filterType = document.getElementById('personal-filter-type').value;
  const filterValue = document.getElementById('personal-filter-value').value;
  const exportFormat = document.getElementById('personal-export-format').value;

  if (!filterValue) {
    showNotification('Pilih dosen atau kelas terlebih dahulu!', 'warning');
    return;
  }

  const entries = getFilteredEntries();
  if (entries.length === 0) {
    showNotification('Tidak ada jadwal untuk filter yang dipilih.', 'warning');
    return;
  }

  const label = filterType === 'lecturer' ? filterValue : `Kelas ${filterValue}`;
  const safeFilename = label.replace(/[^a-zA-Z0-9]/g, '_');

  if (exportFormat === 'pdf') {
    exportPersonalPDF(entries, label, safeFilename);
  } else if (exportFormat === 'excel') {
    exportPersonalExcel(entries, label, safeFilename);
  } else if (exportFormat === 'csv') {
    exportPersonalCSV(entries, label, safeFilename);
  }

  closePersonalExportModal();
}

function exportPersonalPDF(entries, label, safeFilename) {
  if (typeof window.jspdf === 'undefined') {
    showNotification('Library jsPDF belum dimuat. Coba refresh halaman.', 'error');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`Jadwal ${label}`, 148, 15, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleString('id-ID')}`, 148, 22, { align: 'center' });

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
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [94, 106, 210], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 255] },
    theme: 'grid',
  });

  doc.save(`jadwal_${safeFilename}.pdf`);
  showNotification(`📄 Jadwal ${label} diekspor ke PDF!`, 'success');
  addLog(`📄 Personal export: jadwal_${safeFilename}.pdf`, 'success');
}

function exportPersonalExcel(entries, label, safeFilename) {
  if (typeof XLSX === 'undefined') {
    showNotification('Library SheetJS belum dimuat. Coba refresh halaman.', 'error');
    return;
  }

  const data = [['Hari', 'Waktu', 'Mata Kuliah', 'Dosen', 'SKS', 'Jml Mahasiswa', 'Ruangan', 'Kapasitas']];

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
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 10 }, { wch: 16 }, { wch: 22 }, { wch: 14 },
    { wch: 6 }, { wch: 14 }, { wch: 10 }, { wch: 10 }
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Jadwal ${label}`);
  XLSX.writeFile(wb, `jadwal_${safeFilename}.xlsx`);

  showNotification(`📊 Jadwal ${label} diekspor ke Excel!`, 'success');
  addLog(`📊 Personal export: jadwal_${safeFilename}.xlsx`, 'success');
}

function exportPersonalCSV(entries, label, safeFilename) {
  let csv = 'Hari,Waktu,Mata Kuliah,Dosen,SKS,Jumlah Mahasiswa,Ruangan,Kapasitas\n';

  for (const [courseId, slot] of entries) {
    const course = state.courses.find(c => c.id === courseId);
    if (!course) continue;
    const timeLabel = state.timeSlots[slot.timeIndex]?.label || '';
    const room = state.rooms.find(r => r.name === slot.room);
    const cap = room ? room.capacity : '';
    csv += `${DAYS[slot.dayIndex]},${timeLabel},${course.name},${course.lecturer},${course.sks},${course.students || ''},${slot.room},${cap}\n`;
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `jadwal_${safeFilename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);

  showNotification(`💾 Jadwal ${label} diekspor ke CSV!`, 'success');
  addLog(`💾 Personal export: jadwal_${safeFilename}.csv`, 'success');
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
  rebuildConflictGraph();
  renderCalendar(state.schedule);
  renderConflictCenter();
  renderDashboard();
  
  const maxTimeIndex = state.timeSlots.length;
  const roomCapacities = buildRoomCapacities();
  const result = calculateFitness(state.schedule, state.conflictGraph, state.courses, maxTimeIndex, roomCapacities);
  renderStats({
    conflicts: result.conflicts,
    temperature: 0,
    iteration: 'Undo',
    bestPenalty: result.penalty
  });

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
  rebuildConflictGraph();
  renderCalendar(state.schedule);
  renderConflictCenter();
  renderDashboard();

  const maxTimeIndex = state.timeSlots.length;
  const roomCapacities = buildRoomCapacities();
  const result = calculateFitness(state.schedule, state.conflictGraph, state.courses, maxTimeIndex, roomCapacities);
  renderStats({
    conflicts: result.conflicts,
    temperature: 0,
    iteration: 'Redo',
    bestPenalty: result.penalty
  });

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
    const isEn = state.lang === 'en';
    nextBtn.textContent = index === steps.length - 1 ? (isEn ? 'Start! 🚀' : 'Mulai! 🚀') : (isEn ? 'Next →' : 'Selanjutnya →');
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
      label: isEn ? 'Course Count' : 'Jml Matkul',
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
    labels: DAYS.map((d, idx) => getDayName(idx, isEn).slice(0, 3)),
    datasets: [{
      label: isEn ? 'Course Count' : 'Jml Matkul',
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
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }

  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
  };

  chartInstances[canvasId] = new Chart(ctx, {
    type: type,
    data: data,
    options: Object.assign({}, defaultOptions, options)
  });
}

// ============================================================
// CONFLICT CENTER
// ============================================================

function renderConflictCenter() {
  const panel = document.getElementById('conflict-center');
  const list = document.getElementById('conflict-list');
  const badge = document.getElementById('conflict-count-badge');

  if (!state.schedule || Object.keys(state.schedule).length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  const issues = [];
  const entries = Object.entries(state.schedule);
  const isEn = state.lang === 'en';

  for (let i = 0; i < entries.length; i++) {
    const [idA, slotA] = entries[i];
    const courseA = state.courses.find(c => c.id === idA);
    if (!courseA) continue;

    // Check lecturer availability
    if (!isLecturerAvailable(courseA.lecturerAvailability, slotA.dayIndex, slotA.timeIndex)) {
      const dayName = getDayName(slotA.dayIndex, isEn);
      const timeLabel = state.timeSlots[slotA.timeIndex]?.label || '';
      const text = isEn 
        ? `<strong>${courseA.name}</strong> — ${courseA.lecturer} is unavailable on ${dayName} ${timeLabel}`
        : `<strong>${courseA.name}</strong> — ${courseA.lecturer} tidak tersedia di ${dayName} ${timeLabel}`;
      issues.push({ type: 'hard', icon: '🚫', text });
    }

    // Check room capacity and type suitability
    const room = state.rooms.find(r => r.name === slotA.room);
    if (room) {
      if (courseA.students > room.capacity) {
        const text = isEn
          ? `<strong>${courseA.name}</strong> — ${courseA.students} students in ${slotA.room} (capacity ${room.capacity})`
          : `<strong>${courseA.name}</strong> — ${courseA.students} mahasiswa di ${slotA.room} (kapasitas ${room.capacity})`;
        issues.push({ type: 'hard', icon: '🏢', text });
      }
      const roomType = room.type || 'Kelas';
      const cType = courseA.type || 'Teori';
      if (cType === 'Praktikum' && roomType !== 'Lab') {
        const text = isEn
          ? `<strong>${courseA.name}</strong> (Practical) — Placed in room <strong>${slotA.room}</strong> of type <strong>${roomType === 'Kelas' ? 'Class' : roomType}</strong> (Must be in a Lab room)`
          : `<strong>${courseA.name}</strong> (Praktikum) — Ditempatkan di ruangan <strong>${slotA.room}</strong> berjenis <strong>${roomType}</strong> (Harus di ruangan Lab)`;
        issues.push({ type: 'hard', icon: '🧪', text });
      } else if (cType === 'Teori' && roomType === 'Lab') {
        const text = isEn
          ? `<strong>${courseA.name}</strong> (Theory) — Placed in room <strong>${slotA.room}</strong> of type <strong>${roomType}</strong> (Cannot be in a Lab room)`
          : `<strong>${courseA.name}</strong> (Teori) — Ditempatkan di ruangan <strong>${slotA.room}</strong> berjenis <strong>${roomType}</strong> (Tidak boleh di ruangan Lab)`;
        issues.push({ type: 'hard', icon: '🧪', text });
      }
    }

    // Check soft constraints
    if (courseA.preference === 'avoid-morning' && slotA.timeIndex === 0) {
      const text = isEn
        ? `<strong>${courseA.name}</strong> — Placed in the morning (preference: avoid morning)`
        : `<strong>${courseA.name}</strong> — Ditempatkan di pagi hari (preferensi: hindari pagi)`;
      issues.push({ type: 'soft', icon: '☀️', text });
    }
    if (courseA.preference === 'avoid-evening' && slotA.timeIndex === state.timeSlots.length - 1) {
      const text = isEn
        ? `<strong>${courseA.name}</strong> — Placed in the evening (preference: avoid evening)`
        : `<strong>${courseA.name}</strong> — Ditempatkan di sore hari (preferensi: hindari sore)`;
      issues.push({ type: 'soft', icon: '🌙', text });
    }

    for (let j = i + 1; j < entries.length; j++) {
      const [idB, slotB] = entries[j];
      const courseB = state.courses.find(c => c.id === idB);
      if (!courseB) continue;

      const spanA = slotA.span || 1;
      const spanB = slotB.span || 1;
      const sameTime = slotA.dayIndex === slotB.dayIndex &&
        Math.max(slotA.timeIndex, slotB.timeIndex) <= Math.min(slotA.timeIndex + spanA - 1, slotB.timeIndex + spanB - 1);

      if (sameTime) {
        if (slotA.room === slotB.room) {
          const dayName = getDayName(slotA.dayIndex, isEn);
          const timeLabel = state.timeSlots[slotA.timeIndex]?.label || '';
          const text = isEn
            ? `<strong>${courseA.name}</strong> & <strong>${courseB.name}</strong> — Same room (${slotA.room}) on ${dayName} ${timeLabel}`
            : `<strong>${courseA.name}</strong> & <strong>${courseB.name}</strong> — Ruangan sama (${slotA.room}) di ${dayName} ${timeLabel}`;
          issues.push({ type: 'hard', icon: '⚠️', text });
        }
        if (state.conflictGraph && state.conflictGraph.isConflict(idA, idB)) {
          const dayName = getDayName(slotA.dayIndex, isEn);
          const timeLabel = state.timeSlots[slotA.timeIndex]?.label || '';
          const key = [idA, idB].sort().join('|');
          const reason = state.conflictGraph.edgeReasons ? state.conflictGraph.edgeReasons.get(key) : '';
          const translatedReason = translateReason(reason, isEn);
          const text = isEn
            ? `<strong>${courseA.name}</strong> & <strong>${courseB.name}</strong> — Conflict ${translatedReason ? '(' + translatedReason + ')' : ''} on ${dayName} ${timeLabel}`
            : `<strong>${courseA.name}</strong> & <strong>${courseB.name}</strong> — Bentrok ${reason ? '(' + reason + ')' : ''} di ${dayName} ${timeLabel}`;
          issues.push({ type: 'hard', icon: '🔗', text });
        }
      }
    }
  }

  const hardCount = issues.filter(i => i.type === 'hard').length;
  const softCount = issues.filter(i => i.type === 'soft').length;
  badge.textContent = hardCount;
  badge.style.background = hardCount > 0 ? 'var(--danger)' : (softCount > 0 ? '#f59e0b' : 'var(--success)');

  if (issues.length === 0) {
    list.innerHTML = '<div class="conflict-ok">✅ Tidak ada konflik! Jadwal sempurna.</div>';
  } else {
    list.innerHTML = issues.map(i =>
      `<div class="conflict-item ${i.type === 'soft' ? 'conflict-item-soft' : ''}">
        <span class="conflict-icon">${i.icon}</span>
        <span>${i.text}</span>
      </div>`
    ).join('');
  }
}

// ============================================================
// HEATMAP VIEW
// ============================================================

let heatmapActive = false;

function toggleHeatmap() {
  heatmapActive = !heatmapActive;
  const btn = document.getElementById('btn-heatmap');
  
  if (heatmapActive) {
    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-primary');
    btn.textContent = '🌡️ Heatmap ON';
    applyHeatmap();
  } else {
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-secondary');
    btn.textContent = '🌡️ Heatmap';
    removeHeatmap();
  }
}

function applyHeatmap() {
  if (!state.schedule) return;

  const cells = document.querySelectorAll('.calendar-cell');
  cells.forEach(cell => {
    const dayIndex = parseInt(cell.dataset.day);
    const timeIndex = parseInt(cell.dataset.time);
    if (isNaN(dayIndex) || isNaN(timeIndex)) return;

    // Count courses in this cell
    let count = 0;
    let hasConflict = false;
    const coursesInCell = [];

    for (const [courseId, assignment] of Object.entries(state.schedule)) {
      if (assignment.dayIndex === dayIndex && assignment.timeIndex === timeIndex) {
        count++;
        coursesInCell.push(courseId);
      }
    }

    // Check for conflicts between courses in same cell
    if (coursesInCell.length > 1) {
      const rooms = coursesInCell.map(id => state.schedule[id].room);
      const uniqueRooms = new Set(rooms);
      if (uniqueRooms.size < rooms.length) hasConflict = true;
      
      // Check graph conflicts
      if (state.conflictGraph) {
        for (let i = 0; i < coursesInCell.length; i++) {
          for (let j = i + 1; j < coursesInCell.length; j++) {
            if (state.conflictGraph.isConflict(coursesInCell[i], coursesInCell[j])) {
              hasConflict = true;
            }
          }
        }
      }
    }

    // Remove old heatmap classes
    cell.classList.remove('heatmap-0', 'heatmap-1', 'heatmap-2', 'heatmap-3', 'heatmap-conflict');

    if (hasConflict) {
      cell.classList.add('heatmap-conflict');
    } else if (count === 0) {
      cell.classList.add('heatmap-0');
    } else if (count === 1) {
      cell.classList.add('heatmap-1');
    } else if (count === 2) {
      cell.classList.add('heatmap-2');
    } else {
      cell.classList.add('heatmap-3');
    }
  });

  // Add legend
  let legend = document.getElementById('heatmap-legend');
  if (!legend) {
    legend = document.createElement('div');
    legend.id = 'heatmap-legend';
    legend.className = 'heatmap-legend';
    legend.innerHTML = `
      <span style="font-weight:600;">Legenda:</span>
      <div class="heatmap-legend-item"><div class="heatmap-legend-swatch" style="background:rgba(34,197,94,0.1)"></div> Kosong</div>
      <div class="heatmap-legend-item"><div class="heatmap-legend-swatch" style="background:rgba(34,197,94,0.3)"></div> 1 Matkul</div>
      <div class="heatmap-legend-item"><div class="heatmap-legend-swatch" style="background:rgba(250,204,21,0.3)"></div> 2 Matkul</div>
      <div class="heatmap-legend-item"><div class="heatmap-legend-swatch" style="background:rgba(249,115,22,0.3)"></div> 3+ Matkul</div>
      <div class="heatmap-legend-item"><div class="heatmap-legend-swatch" style="background:rgba(239,68,68,0.4)"></div> Bentrok!</div>
    `;
    document.getElementById('calendar-wrapper').appendChild(legend);
  }
}

function removeHeatmap() {
  const cells = document.querySelectorAll('.calendar-cell');
  cells.forEach(cell => {
    cell.classList.remove('heatmap-0', 'heatmap-1', 'heatmap-2', 'heatmap-3', 'heatmap-conflict');
  });
  const legend = document.getElementById('heatmap-legend');
  if (legend) legend.remove();
}

// ============================================================
// 9B. AUTO-FIX (Fix hanya matkul yang bentrok)
// ============================================================

async function autoFixConflicts() {
  if (state.isRunning) return;
  if (!state.schedule || Object.keys(state.schedule).length === 0) {
    showNotification('Generate jadwal terlebih dahulu!', 'warning');
    return;
  }

  // Find conflicting course IDs
  const conflictingIds = new Set();
  const entries = Object.entries(state.schedule);

  for (let i = 0; i < entries.length; i++) {
    const [idA, slotA] = entries[i];
    const courseA = state.courses.find(c => c.id === idA);
    if (!courseA) continue;

    // Check lecturer availability
    if (!isLecturerAvailable(courseA.lecturerAvailability, slotA.dayIndex, slotA.timeIndex)) {
      conflictingIds.add(idA);
    }

    // Check room capacity & type suitability
    const room = state.rooms.find(r => r.name === slotA.room);
    if (room) {
      if (courseA.students > room.capacity) {
        conflictingIds.add(idA);
      }
      const roomType = room.type || 'Kelas';
      const cType = courseA.type || 'Teori';
      if ((cType === 'Praktikum' && roomType !== 'Lab') || (cType === 'Teori' && roomType === 'Lab')) {
        conflictingIds.add(idA);
      }
    }

    for (let j = i + 1; j < entries.length; j++) {
      const [idB, slotB] = entries[j];

      const spanA = slotA.span || 1;
      const spanB = slotB.span || 1;
      const sameTime = slotA.dayIndex === slotB.dayIndex &&
        Math.max(slotA.timeIndex, slotB.timeIndex) <= Math.min(slotA.timeIndex + spanA - 1, slotB.timeIndex + spanB - 1);

      if (sameTime) {
        if (slotA.room === slotB.room) {
          conflictingIds.add(idA);
          conflictingIds.add(idB);
        }
        if (state.conflictGraph && state.conflictGraph.isConflict(idA, idB)) {
          conflictingIds.add(idA);
          conflictingIds.add(idB);
        }
      }
    }
  }

  if (conflictingIds.size === 0) {
    showNotification('✅ Tidak ada konflik untuk diperbaiki!', 'success');
    return;
  }

  addLog(`🔧 Auto-Fix: Memperbaiki ${conflictingIds.size} matkul yang bentrok...`, 'info');
  pushHistory();

  // Build available slots (only unlocked)
  const activeTimeSlots = state.timeSlots.filter(ts => !ts.locked);
  const roomNames = state.rooms.map(r => r.name);
  const allSlots = generateAllSlots(roomNames, activeTimeSlots);
  const roomCapacities = buildRoomCapacities();

  // Keep non-conflicting assignments fixed
  const newSchedule = { ...state.schedule };

  // Try to reassign each conflicting course to a valid slot
  for (const courseId of conflictingIds) {
    const course = state.courses.find(c => c.id === courseId);
    if (!course) continue;

    let bestSlot = null;
    let bestPenalty = Infinity;

    for (const slot of allSlots) {
      // Check lecturer availability
      if (!isLecturerAvailable(course.lecturerAvailability, slot.dayIndex, slot.timeIndex)) continue;

      // Check room capacity & type suitability
      if (roomCapacities) {
        const roomInfo = roomCapacities[slot.room];
        if (roomInfo) {
          const cap = typeof roomInfo === 'object' ? roomInfo.capacity : roomInfo;
          const roomType = typeof roomInfo === 'object' ? roomInfo.type : 'Kelas';
          if (course.students && cap !== undefined && course.students > cap) continue;
          
          const cType = course.type || 'Teori';
          if (cType === 'Praktikum' && roomType !== 'Lab') continue;
          if (cType === 'Teori' && roomType === 'Lab') continue;
        }
      }

      // Check for conflicts with OTHER courses already placed
      let penalty = 0;
      let hasHardConflict = false;

      for (const [otherId, otherSlot] of Object.entries(newSchedule)) {
        if (otherId === courseId) continue;

        const spanOther = otherSlot.span || 1;
        const sameTime = slot.dayIndex === otherSlot.dayIndex &&
          slot.timeIndex >= otherSlot.timeIndex && slot.timeIndex < otherSlot.timeIndex + spanOther;

        if (sameTime || (slot.dayIndex === otherSlot.dayIndex && otherSlot.timeIndex === slot.timeIndex)) {
          if (slot.room === otherSlot.room) {
            hasHardConflict = true;
            break;
          }
          if (state.conflictGraph && state.conflictGraph.isConflict(courseId, otherId)) {
            hasHardConflict = true;
            break;
          }
        }
      }

      if (hasHardConflict) continue;

      // Prefer slots matching preference
      if (course.preference === 'avoid-morning' && slot.timeIndex === 0) penalty += 2;
      if (course.preference === 'avoid-evening' && slot.timeIndex === activeTimeSlots.length - 1) penalty += 2;

      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestSlot = slot;
      }
    }

    if (bestSlot) {
      const slotsNeeded = course.sks >= 4 ? 2 : 1;
      newSchedule[courseId] = {
        dayIndex: bestSlot.dayIndex,
        timeIndex: bestSlot.timeIndex,
        room: bestSlot.room,
        span: slotsNeeded,
      };
      addLog(`   ✅ ${course.name} → ${DAYS[bestSlot.dayIndex]} ${state.timeSlots[bestSlot.timeIndex]?.label || ''} (${bestSlot.room})`, 'success');
    } else {
      addLog(`   ⚠️ ${course.name} — tidak ditemukan slot yang valid`, 'warning');
    }
  }

  state.schedule = newSchedule;
  renderCalendar(state.schedule);
  renderConflictCenter();
  saveState();

  // Recount conflicts
  const graph = state.conflictGraph;
  if (graph) {
    const fitness = calculateFitness(state.schedule, graph, state.courses, state.timeSlots.length, buildRoomCapacities());
    renderStats({ conflicts: fitness.conflicts, temperature: 0, iteration: 'Auto-Fix', bestPenalty: fitness.penalty });
    if (fitness.conflicts === 0) {
      showNotification('🎉 Auto-Fix berhasil! Semua konflik teratasi!', 'success');
    } else {
      showNotification(`🔧 Auto-Fix selesai. Sisa konflik: ${fitness.conflicts}`, 'warning');
    }
  }

  addLog(`🔧 Auto-Fix selesai.`, 'success');
}

// ============================================================
// 18B. BATCH EXPORT EXCEL (SheetJS Multi-sheet)
// ============================================================

function exportBatchExcel() {
  if (!state.schedule || state.courses.length === 0) {
    showNotification('Generate jadwal terlebih dahulu!', 'warning');
    return;
  }

  if (typeof XLSX === 'undefined') {
    showNotification('Library SheetJS belum dimuat. Coba refresh halaman.', 'error');
    return;
  }

  const wb = XLSX.utils.book_new();

  // 1. Sheet Semua Jadwal
  const mainData = [['Hari', 'Waktu', 'Mata Kuliah', 'Dosen', 'SKS', 'Jml Mahasiswa', 'Ruangan', 'Kapasitas', 'Tipe Ruangan', 'Tipe Matkul', 'Semester']];
  const entries = Object.entries(state.schedule).sort((a, b) => {
    if (a[1].dayIndex !== b[1].dayIndex) return a[1].dayIndex - b[1].dayIndex;
    return a[1].timeIndex - b[1].timeIndex;
  });

  for (const [courseId, slot] of entries) {
    const course = state.courses.find(c => c.id === courseId);
    if (!course) continue;
    const timeLabel = state.timeSlots[slot.timeIndex]?.label || '';
    const room = state.rooms.find(r => r.name === slot.room);
    mainData.push([
      DAYS[slot.dayIndex],
      timeLabel,
      course.name,
      course.lecturer,
      course.sks,
      course.students || '',
      slot.room,
      room ? room.capacity : '',
      room ? (room.type || 'Kelas') : '',
      course.type || 'Teori',
      course.semester || ''
    ]);
  }

  const wsMain = XLSX.utils.aoa_to_sheet(mainData);
  wsMain['!cols'] = [
    { wch: 10 }, { wch: 16 }, { wch: 22 }, { wch: 14 },
    { wch: 6 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }
  ];
  XLSX.utils.book_append_sheet(wb, wsMain, 'Semua Jadwal');

  // Helper to sanitize sheet names (Excel has a 31 char limit and prohibits some symbols)
  function getSafeSheetName(name) {
    return name.replace(/[\\\/\?\*\:\[\]]/g, '').slice(0, 31);
  }

  // 2. Sheets by Lecturer (Dosen)
  const lecturers = [...new Set(state.courses.map(c => c.lecturer))].sort();
  lecturers.forEach(lec => {
    const lecData = [['Hari', 'Waktu', 'Mata Kuliah', 'SKS', 'Jml Mahasiswa', 'Ruangan', 'Kapasitas', 'Tipe Ruangan', 'Tipe Matkul']];
    let count = 0;

    for (const [courseId, slot] of entries) {
      const course = state.courses.find(c => c.id === courseId);
      if (course && course.lecturer === lec) {
        const timeLabel = state.timeSlots[slot.timeIndex]?.label || '';
        const room = state.rooms.find(r => r.name === slot.room);
        lecData.push([
          DAYS[slot.dayIndex],
          timeLabel,
          course.name,
          course.sks,
          course.students || '',
          slot.room,
          room ? room.capacity : '',
          room ? (room.type || 'Kelas') : '',
          course.type || 'Teori'
        ]);
        count++;
      }
    }

    if (count > 0) {
      const wsLec = XLSX.utils.aoa_to_sheet(lecData);
      wsLec['!cols'] = [
        { wch: 10 }, { wch: 16 }, { wch: 22 }, { wch: 6 },
        { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }
      ];
      const sheetTitle = getSafeSheetName(`Dosen - ${lec}`);
      XLSX.utils.book_append_sheet(wb, wsLec, sheetTitle);
    }
  });

  // 3. Sheets by Class / Semester
  const semesters = [...new Set(state.courses.map(c => c.semester))].sort();
  const classSet = new Set();
  state.courses.forEach(c => {
    const match = c.name.match(/\s([A-Z])$/i);
    if (match) classSet.add(match[1].toUpperCase());
  });

  if (classSet.size > 0) {
    const classes = [...classSet].sort();
    semesters.forEach(sem => {
      classes.forEach(cls => {
        const classData = [['Hari', 'Waktu', 'Mata Kuliah', 'Dosen', 'SKS', 'Jml Mahasiswa', 'Ruangan', 'Kapasitas', 'Tipe Ruangan', 'Tipe Matkul']];
        let count = 0;

        for (const [courseId, slot] of entries) {
          const course = state.courses.find(c => c.id === courseId);
          if (course && course.semester === sem) {
            const match = course.name.match(/\s([A-Z])$/i);
            const courseClass = match ? match[1].toUpperCase() : '';
            if (courseClass === cls) {
              const timeLabel = state.timeSlots[slot.timeIndex]?.label || '';
              const room = state.rooms.find(r => r.name === slot.room);
              classData.push([
                DAYS[slot.dayIndex],
                timeLabel,
                course.name,
                course.lecturer,
                course.sks,
                course.students || '',
                slot.room,
                room ? room.capacity : '',
                room ? (room.type || 'Kelas') : '',
                course.type || 'Teori'
              ]);
              count++;
            }
          }
        }

        if (count > 0) {
          const wsClass = XLSX.utils.aoa_to_sheet(classData);
          wsClass['!cols'] = [
            { wch: 10 }, { wch: 16 }, { wch: 22 }, { wch: 14 },
            { wch: 6 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }
          ];
          const sheetTitle = getSafeSheetName(`Sem ${sem} - ${cls}`);
          XLSX.utils.book_append_sheet(wb, wsClass, sheetTitle);
        }
      });

      // Handing courses without a suffix class letter
      const remainingData = [['Hari', 'Waktu', 'Mata Kuliah', 'Dosen', 'SKS', 'Jml Mahasiswa', 'Ruangan', 'Kapasitas', 'Tipe Ruangan', 'Tipe Matkul']];
      let remainingCount = 0;

      for (const [courseId, slot] of entries) {
        const course = state.courses.find(c => c.id === courseId);
        if (course && course.semester === sem) {
          const match = course.name.match(/\s([A-Z])$/i);
          if (!match) {
            const timeLabel = state.timeSlots[slot.timeIndex]?.label || '';
            const room = state.rooms.find(r => r.name === slot.room);
            remainingData.push([
              DAYS[slot.dayIndex],
              timeLabel,
              course.name,
              course.lecturer,
              course.sks,
              course.students || '',
              slot.room,
              room ? room.capacity : '',
              room ? (room.type || 'Kelas') : '',
              course.type || 'Teori'
            ]);
            remainingCount++;
          }
        }
      }

      if (remainingCount > 0) {
        const wsClass = XLSX.utils.aoa_to_sheet(remainingData);
        wsClass['!cols'] = [
          { wch: 10 }, { wch: 16 }, { wch: 22 }, { wch: 14 },
          { wch: 6 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }
        ];
        const sheetTitle = getSafeSheetName(`Semester ${sem}`);
        XLSX.utils.book_append_sheet(wb, wsClass, sheetTitle);
      }
    });
  } else {
    // If no classes parallel exist, group by semester only
    semesters.forEach(sem => {
      const semData = [['Hari', 'Waktu', 'Mata Kuliah', 'Dosen', 'SKS', 'Jml Mahasiswa', 'Ruangan', 'Kapasitas', 'Tipe Ruangan', 'Tipe Matkul']];
      let count = 0;

      for (const [courseId, slot] of entries) {
        const course = state.courses.find(c => c.id === courseId);
        if (course && course.semester === sem) {
          const timeLabel = state.timeSlots[slot.timeIndex]?.label || '';
          const room = state.rooms.find(r => r.name === slot.room);
          semData.push([
            DAYS[slot.dayIndex],
            timeLabel,
            course.name,
            course.lecturer,
            course.sks,
            course.students || '',
            slot.room,
            room ? room.capacity : '',
            room ? (room.type || 'Kelas') : '',
            course.type || 'Teori'
          ]);
          count++;
        }
      }

      if (count > 0) {
        const wsClass = XLSX.utils.aoa_to_sheet(semData);
        wsClass['!cols'] = [
          { wch: 10 }, { wch: 16 }, { wch: 22 }, { wch: 14 },
          { wch: 6 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }
        ];
        const sheetTitle = getSafeSheetName(`Semester ${sem}`);
        XLSX.utils.book_append_sheet(wb, wsClass, sheetTitle);
      }
    });
  }

  XLSX.writeFile(wb, 'jadwal_kuliah_batch.xlsx');
  showNotification('📊 Batch Export berhasil! File jadwal_kuliah_batch.xlsx terunduh.', 'success');
  addLog('📊 Batch export: jadwal_kuliah_batch.xlsx', 'success');
}

// ============================================================
// 20. VERSION COMPARISON (Diff View)
// ============================================================

function openCompareModal() {
  const modal = document.getElementById('modal-version-compare');
  const selectA = document.getElementById('compare-version-a');
  const selectB = document.getElementById('compare-version-b');

  if (!state.schedule && state.versions.length === 0) {
    showNotification('Belum ada jadwal aktif atau versi tersimpan untuk dibandingkan!', 'warning');
    return;
  }

  // Populate options
  let optionsHtml = '';
  if (state.schedule) {
    optionsHtml += '<option value="active">Jadwal Aktif saat ini</option>';
  }
  state.versions.forEach((ver, index) => {
    optionsHtml += `<option value="version_${index}">${ver.name} (${ver.date})</option>`;
  });

  selectA.innerHTML = optionsHtml;
  selectB.innerHTML = optionsHtml;

  // Set default values
  if (state.schedule && state.versions.length > 0) {
    selectA.value = 'active';
    selectB.value = 'version_' + (state.versions.length - 1);
  } else if (state.versions.length >= 2) {
    selectA.value = 'version_0';
    selectB.value = 'version_1';
  }

  modal.style.display = 'flex';
  updateComparisonTable();
}

function closeCompareModal() {
  document.getElementById('modal-version-compare').style.display = 'none';
}

function updateComparisonTable() {
  const selectA = document.getElementById('compare-version-a').value;
  const selectB = document.getElementById('compare-version-b').value;
  const diffOnly = document.getElementById('compare-diff-only').checked;
  const container = document.getElementById('compare-table-container');
  const summaryEl = document.getElementById('compare-summary');

  if (!selectA || !selectB) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Pilih dua versi untuk dibandingkan.</div>';
    return;
  }

  // Resolve Version A
  let scheduleA = {};
  let coursesA = [];
  let timeSlotsA = [];
  if (selectA === 'active') {
    scheduleA = state.schedule || {};
    coursesA = state.courses;
    timeSlotsA = state.timeSlots;
  } else {
    const idx = parseInt(selectA.replace('version_', ''));
    if (state.versions[idx]) {
      scheduleA = state.versions[idx].schedule;
      coursesA = state.versions[idx].courses;
      timeSlotsA = state.versions[idx].timeSlots;
    }
  }

  // Resolve Version B
  let scheduleB = {};
  let coursesB = [];
  let timeSlotsB = [];
  if (selectB === 'active') {
    scheduleB = state.schedule || {};
    coursesB = state.courses;
    timeSlotsB = state.timeSlots;
  } else {
    const idx = parseInt(selectB.replace('version_', ''));
    if (state.versions[idx]) {
      scheduleB = state.versions[idx].schedule;
      coursesB = state.versions[idx].courses;
      timeSlotsB = state.versions[idx].timeSlots;
    }
  }

  // Find all unique course IDs across both versions
  const allCourseIds = new Set([
    ...Object.keys(scheduleA),
    ...Object.keys(scheduleB)
  ]);

  let rowsHtml = '';
  let countDisplayed = 0;
  let countChanged = 0;

  // Build table headers
  let tableHeader = `<table class="compare-table">
    <thead>
      <tr>
        <th>Mata Kuliah & Dosen</th>
        <th>Slot Versi A</th>
        <th>Slot Versi B</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>`;

  allCourseIds.forEach(courseId => {
    // Find course details (fallback to either list)
    const courseA = coursesA.find(c => c.id === courseId);
    const courseB = coursesB.find(c => c.id === courseId);
    const courseName = (courseB ? courseB.name : (courseA ? courseA.name : courseId));
    const lecturer = (courseB ? courseB.lecturer : (courseA ? courseA.lecturer : ''));

    const slotA = scheduleA[courseId];
    const slotB = scheduleB[courseId];

    let labelA = 'Tidak dijadwalkan';
    let labelB = 'Tidak dijadwalkan';
    let statusText = 'Identik';
    let statusClass = 'compare-badge-same';
    let rowClass = 'compare-row-same';
    let isDifferent = false;

    if (slotA) {
      const day = DAYS[slotA.dayIndex] || '';
      const time = timeSlotsA[slotA.timeIndex]?.label || '';
      labelA = `${day} ${time} (${slotA.room})`;
    }
    if (slotB) {
      const day = DAYS[slotB.dayIndex] || '';
      const time = timeSlotsB[slotB.timeIndex]?.label || '';
      labelB = `${day} ${time} (${slotB.room})`;
    }

    if (!slotA && slotB) {
      statusText = 'Ditambahkan';
      statusClass = 'compare-badge-changed';
      rowClass = 'compare-row-changed';
      isDifferent = true;
      countChanged++;
    } else if (slotA && !slotB) {
      statusText = 'Dihapus';
      statusClass = 'compare-badge-missing';
      rowClass = 'compare-row-changed';
      isDifferent = true;
      countChanged++;
    } else if (slotA && slotB) {
      const sameTime = slotA.dayIndex === slotB.dayIndex && slotA.timeIndex === slotB.timeIndex;
      const sameRoom = slotA.room === slotB.room;

      if (!sameTime && sameRoom) {
        statusText = 'Waktu Berubah';
        statusClass = 'compare-badge-changed';
        rowClass = 'compare-row-changed';
        isDifferent = true;
        countChanged++;
      } else if (sameTime && !sameRoom) {
        statusText = 'Ruangan Berubah';
        statusClass = 'compare-badge-changed';
        rowClass = 'compare-row-changed';
        isDifferent = true;
        countChanged++;
      } else if (!sameTime && !sameRoom) {
        statusText = 'Slot & Ruang Berubah';
        statusClass = 'compare-badge-changed';
        rowClass = 'compare-row-changed';
        isDifferent = true;
        countChanged++;
      }
    }

    if (diffOnly && !isDifferent) {
      return; // Skip identical rows if filter is checked
    }

    countDisplayed++;
    rowsHtml += `<tr class="${rowClass}">
      <td>
        <strong style="color: var(--text-primary);">${courseName}</strong><br/>
        <small style="color: var(--text-muted);">${lecturer}</small>
      </td>
      <td style="color: ${slotA ? 'var(--text-primary)' : 'var(--text-muted)'};">${labelA}</td>
      <td style="color: ${slotB ? 'var(--text-primary)' : 'var(--text-muted)'};">${labelB}</td>
      <td>
        <span class="compare-badge ${statusClass}">${statusText}</span>
      </td>
    </tr>`;
  });

  if (countDisplayed === 0) {
    container.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--text-muted);">
      ${diffOnly ? 'Tidak ada perbedaan antara kedua versi ini.' : 'Tidak ada data jadwal untuk dibandingkan.'}
    </div>`;
  } else {
    container.innerHTML = tableHeader + rowsHtml + '</tbody></table>';
  }

  summaryEl.textContent = `Menampilkan ${countDisplayed} dari ${allCourseIds.size} matkul (${countChanged} berbeda)`;
}

// ============================================================
// 21. QR CODE SHARING (Shareable URL + Canvas QR Code)
// ============================================================

function showPersonalQR() {
  const filterType = document.getElementById('personal-filter-type').value;
  const filterValue = document.getElementById('personal-filter-value').value;
  const entries = getFilteredEntries();
  if (entries.length === 0) {
    showNotification('Pilih dosen atau kelas terlebih dahulu!', 'warning');
    return;
  }

  const label = filterType === 'lecturer' ? filterValue : `Kelas ${filterValue}`;
  const shareData = entries.map(([courseId, slot]) => {
    const course = state.courses.find(c => c.id === courseId);
    return {
      name: course.name,
      lecturer: course.lecturer,
      sks: course.sks,
      color: course.color,
      day: slot.dayIndex,
      time: slot.timeIndex,
      room: slot.room,
      span: slot.span || 1
    };
  });

  const payload = {
    label: label,
    schedule: shareData,
    timeSlots: state.timeSlots.map(ts => ({ id: ts.id, label: ts.label }))
  };

  try {
    // Convert payload to base64
    const jsonStr = JSON.stringify(payload);
    const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
    const shareUrl = `${window.location.origin}${window.location.pathname}?view=personal&data=${encodeURIComponent(base64)}`;

    // Render QR
    const qrCanvas = document.getElementById('personal-qr-canvas');
    new QRious({
      element: qrCanvas,
      value: shareUrl,
      size: 180,
      level: 'M'
    });

    document.getElementById('personal-share-url').value = shareUrl;
    document.getElementById('personal-qr-section').style.display = 'flex';
    
    // Scroll modal to QR code section
    qrCanvas.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    console.error(err);
    showNotification('Gagal membuat QR Code.', 'error');
  }
}

function copyShareUrl() {
  const urlInput = document.getElementById('personal-share-url');
  if (!urlInput || !urlInput.value) return;

  urlInput.select();
  urlInput.setSelectionRange(0, 99999);
  
  navigator.clipboard.writeText(urlInput.value).then(() => {
    showNotification('📋 Link berhasil disalin ke clipboard!', 'success');
  }).catch(() => {
    // Fallback copy
    try {
      document.execCommand('copy');
      showNotification('📋 Link berhasil disalin ke clipboard!', 'success');
    } catch (err) {
      showNotification('Gagal menyalin link.', 'error');
    }
  });
}

function showSharedPersonalSchedule(base64Data) {
  try {
    const decodedJson = decodeURIComponent(escape(atob(base64Data)));
    const payload = JSON.parse(decodedJson);
    
    // Wait for DOM to load
    document.addEventListener('DOMContentLoaded', () => {
      // Hide normal workspace sidebar, stats, header right
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) sidebar.style.display = 'none';
      const statsBar = document.querySelector('.stats-bar');
      if (statsBar) statsBar.style.display = 'none';
      const headerRight = document.querySelector('.header-right');
      if (headerRight) headerRight.style.display = 'none';
      
      const calendarWrapper = document.getElementById('calendar-wrapper');
      
      // Hide conflict center, log panel, dashboard, graph panels if any
      const conflictCenter = document.getElementById('conflict-center');
      if (conflictCenter) conflictCenter.style.display = 'none';
      const logPanel = document.querySelector('.bottom-panels');
      if (logPanel) logPanel.style.display = 'none';
      
      // Add a share banner header
      const banner = document.createElement('div');
      banner.style.cssText = `
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: 16px 24px;
        margin-bottom: 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: var(--shadow-sm);
      `;
      banner.innerHTML = `
        <div>
          <h3 style="font-size: 1.1rem; font-weight:600; color:var(--text-primary); margin:0;">👤 Jadwal Personal Shared View</h3>
          <p style="font-size: 0.8rem; color:var(--text-secondary); margin:4px 0 0 0;">Menampilkan jadwal untuk: <strong>${payload.label}</strong></p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="window.location.href=window.location.pathname">🌐 Buka App Utama</button>
      `;
      calendarWrapper.parentNode.insertBefore(banner, calendarWrapper);
      
      // Update calendar title
      const titleEl = calendarWrapper.querySelector('.calendar-title-bar h2');
      if (titleEl) {
        titleEl.innerHTML = `📅 Jadwal ${payload.label} <button id="btn-print" class="btn btn-secondary btn-sm" style="margin-left: 12px; padding: 4px 8px;">🖨️ Cetak</button>`;
        titleEl.querySelector('#btn-print').addEventListener('click', () => window.print());
      }
      
      // Hide filter dropdown
      const filterGrp = calendarWrapper.querySelector('.filter-group');
      if (filterGrp) filterGrp.style.display = 'none';
      const btnHeatmap = document.getElementById('btn-heatmap');
      if (btnHeatmap) btnHeatmap.style.display = 'none';
      
      // Format schedules into a schedule object similar to state.schedule
      const sharedSchedule = {};
      const sharedCourses = [];
      const sharedTimeSlots = payload.timeSlots.map((ts, idx) => ({ id: ts.id !== undefined ? ts.id : idx, label: ts.label || ts, locked: false }));
      
      payload.schedule.forEach((item, idx) => {
        const courseId = `SHARED_MK_${idx}`;
        sharedSchedule[courseId] = {
          dayIndex: item.day,
          timeIndex: item.time,
          room: item.room,
          span: item.span || 1
        };
        sharedCourses.push({
          id: courseId,
          name: item.name,
          lecturer: item.lecturer,
          sks: item.sks || 3,
          color: item.color || '#6366f1'
        });
      });
      
      // Temporarily set state for rendering
      state.schedule = sharedSchedule;
      state.courses = sharedCourses;
      state.timeSlots = sharedTimeSlots;
      state.rooms = [...new Set(payload.schedule.map(s => s.room))].map(rName => ({ name: rName, capacity: 999 }));
      
      // Render calendar read-only
      renderLegend();
      renderCalendar(sharedSchedule);
      
      // Disable dragability on cards
      document.querySelectorAll('.course-card').forEach(card => {
        card.removeAttribute('draggable');
        card.style.cursor = 'default';
      });
    });
  } catch (e) {
    console.error(e);
    alert('Gagal memuat jadwal yang dibagikan. URL tidak valid atau data korup.');
  }
}
