/**
 * data.js — Model Data & Preset Jadwal Semester 2
 * ================================================
 * Berisi definisi hari, slot waktu, warna kartu matkul,
 * data preset mata kuliah semester 2, dan fungsi
 * untuk membangun constraints (batasan) antar matkul.
 */

// ============================================================
// 1. KONSTANTA HARI & SLOT WAKTU
// ============================================================

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];

const TIME_SLOTS = [
  { id: 0, label: '08:00 – 10:00', start: '08:00', end: '10:00' },
  { id: 1, label: '10:00 – 12:00', start: '10:00', end: '12:00' },
  { id: 2, label: '13:00 – 15:00', start: '13:00', end: '15:00' },
  { id: 3, label: '15:00 – 17:00', start: '15:00', end: '17:00' },
];

// ============================================================
// 2. PALET WARNA UNTUK KARTU MATA KULIAH
// ============================================================

const COURSE_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f97316', // orange
  '#22c55e', // green
  '#06b6d4', // cyan
  '#f43f5e', // rose
  '#eab308', // yellow
  '#a855f7', // purple
  '#3b82f6', // blue
  '#14b8a6', // teal
  '#e11d48', // crimson
];

// ============================================================
// 3. DATA PRESET — RUANGAN
// ============================================================

const PRESET_ROOMS = ['R101', 'R102', 'R103', 'R104'];

// ============================================================
// 4. DATA PRESET — MATA KULIAH SEMESTER 2
// ============================================================

const PRESET_COURSES = [
  { id: 'MK01', name: 'Struktur Data',        sks: 3, lecturer: 'Dosen A', semester: 2 },
  { id: 'MK02', name: 'Teori Graf',            sks: 3, lecturer: 'Dosen B', semester: 2 },
  { id: 'MK03', name: 'KDKA',                  sks: 3, lecturer: 'Dosen C', semester: 2 },
  { id: 'MK04', name: 'Probstat',              sks: 3, lecturer: 'Dosen D', semester: 2 },
  { id: 'MK05', name: 'Arsikom',               sks: 3, lecturer: 'Dosen E', semester: 2 },
  { id: 'MK06', name: 'Bahasa Inggris',        sks: 2, lecturer: 'Dosen F', semester: 2 },
  { id: 'MK07', name: 'Agama Islam',           sks: 2, lecturer: 'Dosen G', semester: 2 },
];

// ============================================================
// 5. FUNGSI: Generate Semua Slot yang Tersedia
// ============================================================
// Setiap slot = kombinasi (hari, waktu, ruangan)
// Total = 5 hari × 4 waktu × 4 ruangan = 80 slot

function generateAllSlots(rooms, timeSlots = TIME_SLOTS) {
  const slots = [];
  for (let d = 0; d < DAYS.length; d++) {
    for (let t = 0; t < timeSlots.length; t++) {
      for (const room of rooms) {
        slots.push({ dayIndex: d, timeIndex: t, room });
      }
    }
  }
  return slots;
}

// ============================================================
// 6. FUNGSI: Bangun Constraints (Batasan Konflik)
// ============================================================
// Dua matkul TIDAK BOLEH dijadwalkan bersamaan jika:
//   - Dosen yang mengajar sama, ATAU
//   - Semester yang sama (mahasiswa mengambil keduanya)

function buildConstraints(courses) {
  const constraints = [];
  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) {
      const a = courses[i];
      const b = courses[j];

      // Constraint 1: Dosen sama → tidak boleh bersamaan
      if (a.lecturer === b.lecturer) {
        constraints.push({
          courseA: a.id,
          courseB: b.id,
          reason: `Dosen sama (${a.lecturer})`,
        });
        continue; // sudah ada edge, skip pengecekan semester
      }

      // Constraint 2: Semester sama → mahasiswa harus bisa ambil keduanya
      if (a.semester === b.semester) {
        constraints.push({
          courseA: a.id,
          courseB: b.id,
          reason: `Semester sama (Sem ${a.semester})`,
        });
      }
    }
  }
  return constraints;
}
