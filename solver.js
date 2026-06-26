/**
 * solver.js - Graph Coloring + Simulated Annealing
 * ==================================================
 * Algoritma AI untuk penjadwalan kuliah otomatis.
 *
 * 1. Greedy Graph Coloring → solusi awal (cepat, belum tentu optimal)
 * 2. Simulated Annealing   → optimasi (eksplorasi + eksploitasi)
 *
 * Pseudocode SA (sesuai slide KDKA Pertemuan VI):
 *
 *   function SIMULATED-ANNEALING(problem, schedule) returns a solution state
 *       current ← MAKE-NODE(INITIAL-STATE[problem])
 *       for t = 1 to ∞ do
 *           T ← schedule(t)
 *           if T = 0 then return current
 *           next ← randomly selected successor of current
 *           ΔE ← VALUE[next] - VALUE[current]
 *           if ΔE > 0 then current ← next
 *           else current ← next with probability e^(ΔE/T)
 *
 * Referensi:
 *   - Simulated Annealing: https://en.wikipedia.org/wiki/Simulated_annealing
 *   - Graph Coloring: https://en.wikipedia.org/wiki/Graph_coloring
 *   - AIMA Textbook Ch. 4: https://aima.cs.berkeley.edu/
 */

// ============================================================
// 1. GREEDY GRAPH COLORING - Solusi Awal
// ============================================================
// Mewarnai graf secara greedy: node dengan derajat tertinggi
// (paling banyak konflik) diberi warna (slot waktu) duluan.
//
// "Warna" di sini = kombinasi (hari, waktu, ruangan)

function greedyColoring(graph, courses, slots, roomCapacities) {
  const schedule = {}; // courseId → { dayIndex, timeIndex, room }

  // Urutkan: matkul dengan paling banyak konflik di-assign duluan
  // (heuristik "Largest Degree First")
  const sorted = [...courses].sort(
    (a, b) => graph.getDegree(b.id) - graph.getDegree(a.id)
  );

  // Build course lookup for student count
  const courseLookup = {};
  for (const c of courses) {
    courseLookup[c.id] = c;
  }

  for (const course of sorted) {
    let assigned = false;
    const slotsNeeded = course.sks >= 4 ? 2 : 1;

    for (const slot of slots) {
      let conflict = false;

      // Cek ketersediaan dosen di hari dan jam ini
      if (!isLecturerAvailable(course.lecturerAvailability, slot.dayIndex, slot.timeIndex)) {
        continue; // Dosen tidak tersedia
      }

      // Cek kapasitas ruangan vs jumlah mahasiswa dan kesesuaian tipe ruangan
      if (roomCapacities) {
        const roomInfo = roomCapacities[slot.room];
        const roomCap = roomInfo ? (typeof roomInfo === 'object' ? roomInfo.capacity : roomInfo) : undefined;
        const roomType = roomInfo && typeof roomInfo === 'object' ? roomInfo.type : 'Kelas';

        if (roomCap !== undefined && course.students && course.students > roomCap) {
          continue; // Skip slot ini, ruangan terlalu kecil
        }

        const cType = course.type || 'Teori';
        if (cType === 'Praktikum' && roomType !== 'Lab') {
          continue; // Praktikum harus di Lab
        }
        if (cType === 'Teori' && roomType === 'Lab') {
          continue; // Teori tidak boleh di Lab
        }
      }

      // Untuk multi-slot: cek apakah slot berikutnya tersedia
      if (slotsNeeded > 1) {
        const nextSlot = slots.find(s => s.dayIndex === slot.dayIndex && s.timeIndex === slot.timeIndex + 1 && s.room === slot.room);
        if (!nextSlot) continue; // Tidak ada slot berurutan
      }

      // Cek apakah slot ini bentrok dengan tetangga di graf konflik
      const neighbors = graph.getNeighbors(course.id);
      for (const neighborId of neighbors) {
        if (schedule[neighborId]) {
          const nSlot = schedule[neighborId];
          const nSlotsNeeded = (courseLookup[neighborId]?.sks >= 4) ? 2 : 1;
          // Cek overlap untuk semua slot yang digunakan
          for (let s = 0; s < slotsNeeded; s++) {
            for (let ns = 0; ns < nSlotsNeeded; ns++) {
              if (nSlot.dayIndex === slot.dayIndex && (nSlot.timeIndex + ns) === (slot.timeIndex + s)) {
                conflict = true;
                break;
              }
            }
            if (conflict) break;
          }
          if (conflict) break;
        }
      }

      // Cek apakah ruangan sudah terpakai di slot ini (dan slot berikutnya jika multi-slot)
      if (!conflict) {
        for (const [otherId, assignedSlot] of Object.entries(schedule)) {
          const otherSlotsNeeded = (courseLookup[otherId]?.sks >= 4) ? 2 : 1;
          for (let s = 0; s < slotsNeeded; s++) {
            for (let os = 0; os < otherSlotsNeeded; os++) {
              if (
                assignedSlot.dayIndex === slot.dayIndex &&
                (assignedSlot.timeIndex + os) === (slot.timeIndex + s) &&
                assignedSlot.room === slot.room
              ) {
                conflict = true;
                break;
              }
            }
            if (conflict) break;
          }
          if (conflict) break;
        }
      }

      if (!conflict) {
        schedule[course.id] = { ...slot, span: slotsNeeded };
        assigned = true;
        break;
      }
    }

    // Fallback: jika tidak ada slot valid, assign random
    if (!assigned) {
      const randomSlot = slots[Math.floor(Math.random() * slots.length)];
      schedule[course.id] = { ...randomSlot, span: slotsNeeded };
    }
  }

  return schedule;
}

// ============================================================
// 2. FITNESS FUNCTION - Hitung Jumlah Konflik
// ============================================================
// Semakin kecil = semakin baik. Target = 0 (tanpa konflik).
//
// Jenis konflik:
//   - Hard: Matkul yang terhubung di graf konflik berada di waktu sama → +10
//   - Hard: Dua matkul di ruangan yang sama pada waktu yang sama → +10
//   - Hard: Jumlah mahasiswa > kapasitas ruangan → +10
//   - Soft: Preferensi waktu dilanggar → +2

function calculateFitness(schedule, graph, courses, timeSlotsCount, roomCapacities) {
  // Buat lookup table untuk akses preferensi cepat
  const courseLookup = {};
  for (const c of courses) {
    courseLookup[c.id] = c;
  }
  let totalPenalty = 0;
  let hardConflicts = 0;

  const entries = Object.entries(schedule);

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [idA, slotA] = entries[i];
      const [idB, slotB] = entries[j];

      // Cek apakah keduanya bertumpuk waktu (mempertimbangkan span)
      const spanA = slotA.span || 1;
      const spanB = slotB.span || 1;
      const sameTime =
        slotA.dayIndex === slotB.dayIndex &&
        Math.max(slotA.timeIndex, slotB.timeIndex) <= Math.min(slotA.timeIndex + spanA - 1, slotB.timeIndex + spanB - 1);

      if (sameTime) {
        // Aturan Ketat: Tidak boleh di ruangan yang sama pada waktu yang sama
        if (slotA.room === slotB.room) {
          totalPenalty += 10;
          hardConflicts++;
        }
        
        // Aturan Ketat: Matkul yang memiliki konflik dosen/peserta tidak boleh bersamaan
        if (graph && graph.isConflict(idA, idB)) {
          totalPenalty += 10;
          hardConflicts++;
        }
      }
    }

    // Perhitungan Soft Constraint (Preferensi Waktu)
    const [id, slot] = entries[i];
    const course = courseLookup[id];
    if (course && course.preference) {
      if (course.preference === 'avoid-morning' && slot.timeIndex === 0) {
        totalPenalty += 2; // Penalti ringan
      }
      if (course.preference === 'avoid-evening' && slot.timeIndex === timeSlotsCount - 1) {
        totalPenalty += 2; // Penalti ringan
      }
    }

    // Hard Constraint: Kapasitas ruangan & Kesesuaian tipe ruangan
    if (roomCapacities && course) {
      const roomInfo = roomCapacities[slot.room];
      const roomCap = roomInfo ? (typeof roomInfo === 'object' ? roomInfo.capacity : roomInfo) : undefined;
      const roomType = roomInfo && typeof roomInfo === 'object' ? roomInfo.type : 'Kelas';

      if (roomCap !== undefined && course.students && course.students > roomCap) {
        totalPenalty += 10;
        hardConflicts++;
      }

      const cType = course.type || 'Teori';
      if ((cType === 'Praktikum' && roomType !== 'Lab') || (cType === 'Teori' && roomType === 'Lab')) {
        totalPenalty += 10;
        hardConflicts++;
      }
    }

    // Hard Constraint: Ketersediaan dosen
    if (course) {
      if (!isLecturerAvailable(course.lecturerAvailability, slot.dayIndex, slot.timeIndex)) {
        totalPenalty += 10;
        hardConflicts++;
      }
    }

    // Hard Constraint: Multi-slot harus berurutan (jika span > 1)
    if (course && course.sks >= 4 && slot.span !== 2) {
      totalPenalty += 5;
    }
  }

  return { penalty: totalPenalty, conflicts: hardConflicts };
}

// ============================================================
// 3. NEIGHBOR GENERATION - Buat State Tetangga
// ============================================================
// Pilih satu matkul secara acak, pindahkan ke slot waktu acak.
// Ini adalah langkah "random successor" di pseudocode SA.

function getNeighborState(schedule, slots, courses) {
  const newSchedule = {};
  for (const key of Object.keys(schedule)) {
    newSchedule[key] = { ...schedule[key] };
  }

  const courseIds = Object.keys(newSchedule);
  const randomCourseId = courseIds[Math.floor(Math.random() * courseIds.length)];
  const randomSlot = slots[Math.floor(Math.random() * slots.length)];

  // Preserve span for multi-slot courses
  const oldSpan = newSchedule[randomCourseId]?.span || 1;
  newSchedule[randomCourseId] = { ...randomSlot, span: oldSpan };

  return { schedule: newSchedule, movedCourse: randomCourseId };
}

// ============================================================
// 4. SIMULATED ANNEALING - Optimasi Utama
// ============================================================
// Implementasi async agar browser tidak freeze saat animasi.
// Menggunakan await setTimeout untuk yield control ke UI.
//
// Parameter:
//   T_init       : Suhu awal (semakin tinggi → lebih banyak eksplorasi)
//   T_min        : Suhu minimum (berhenti jika T < T_min)
//   coolingRate  : Laju pendinginan (T *= coolingRate setiap iterasi)
//   maxIter      : Batas iterasi maksimum
//   animSpeed    : Kecepatan animasi (ms per frame)
//   onStep       : Callback untuk update UI setiap beberapa iterasi

async function simulatedAnnealing(graph, courses, slots, config, onStep, roomCapacities) {
  const {
    T_init = 100,
    T_min = 0.01,
    coolingRate = 0.995,
    maxIter = 5000,
    animSpeed = 5,
  } = config;

  // Hitung jumlah slot waktu unik dari slots
  const maxTimeIndex = slots.reduce((max, s) => Math.max(max, s.timeIndex), 0);
  const timeSlotsCount = maxTimeIndex + 1;

  // ── Solusi awal dari Greedy Graph Coloring ──
  let currentSchedule = greedyColoring(graph, courses, slots, roomCapacities);
  let currentResult = calculateFitness(currentSchedule, graph, courses, timeSlotsCount, roomCapacities);
  let currentPenalty = currentResult.penalty;

  let bestSchedule = deepCopy(currentSchedule);
  let bestPenalty = currentPenalty;
  let bestConflicts = currentResult.conflicts;

  let T = T_init;
  let iteration = 0;
  let accepted = 0;
  let rejected = 0;

  const log = [];

  // ── Report keadaan awal ──
  if (onStep) {
    onStep({
      iteration: 0,
      temperature: T,
      penalty: currentPenalty,
      conflicts: currentResult.conflicts,
      bestPenalty,
      bestConflicts,
      schedule: deepCopy(currentSchedule),
      movedCourse: null,
      wasAccepted: true,
      phase: 'start',
      log: [],
      stats: { accepted: 0, rejected: 0 },
    });
  }

  // ── Loop Utama SA ──
  while (T > T_min && iteration < maxIter) {
    iteration++;

    // 1. Generate neighbor (pindahkan 1 matkul secara acak)
    const { schedule: neighborSchedule, movedCourse } = getNeighborState(
      currentSchedule,
      slots,
      courses
    );
    const neighborResult = calculateFitness(neighborSchedule, graph, courses, timeSlotsCount, roomCapacities);
    const neighborPenalty = neighborResult.penalty;

    // 2. Hitung ΔE = fitness(neighbor) - fitness(current)
    //    Jika negatif → neighbor lebih baik
    const deltaE = neighborPenalty - currentPenalty;
    let wasAccepted = false;

    if (deltaE < 0) {
      // Neighbor lebih baik → LANGSUNG TERIMA
      currentSchedule = neighborSchedule;
      currentPenalty = neighborPenalty;
      wasAccepted = true;
      accepted++;
    } else if (deltaE === 0) {
      // Sama baiknya → terima 50%
      if (Math.random() < 0.5) {
        currentSchedule = neighborSchedule;
        currentPenalty = neighborPenalty;
        wasAccepted = true;
        accepted++;
      } else {
        rejected++;
      }
    } else {
      // Neighbor lebih BURUK → terima dengan probabilitas e^(-ΔE/T)
      // Semakin tinggi T → probabilitas lebih besar (lebih eksploratif)
      // Semakin rendah T → probabilitas lebih kecil (lebih greedy)
      const probability = Math.exp(-deltaE / T);
      if (Math.random() < probability) {
        currentSchedule = neighborSchedule;
        currentPenalty = neighborPenalty;
        wasAccepted = true;
        accepted++;
      } else {
        rejected++;
      }
    }

    // 3. Track solusi terbaik sepanjang proses
    if (currentPenalty < bestPenalty) {
      bestSchedule = deepCopy(currentSchedule);
      bestPenalty = currentPenalty;
      bestConflicts = calculateFitness(currentSchedule, graph, courses, timeSlotsCount, roomCapacities).conflicts;
    }

    // 4. Turunkan suhu (cooling schedule: geometric)
    T *= coolingRate;

    // 5. Callback animasi (setiap 10 iterasi atau saat penting)
    const shouldReport =
      iteration % 10 === 0 ||
      bestPenalty === 0 ||
      iteration <= 20 ||
      iteration === maxIter;

    if (onStep && shouldReport) {
      const logEntry = {
        iter: iteration,
        T: T.toFixed(2),
        penalty: currentPenalty,
        conflicts: calculateFitness(currentSchedule, graph, courses, timeSlotsCount, roomCapacities).conflicts,
        moved: movedCourse,
        accepted: wasAccepted,
        deltaE,
      };
      log.push(logEntry);
      if (log.length > 100) log.shift();

      // Yield control ke browser agar UI bisa update
      await new Promise((resolve) => setTimeout(resolve, animSpeed));

      onStep({
        iteration,
        temperature: T,
        penalty: currentPenalty,
        conflicts: calculateFitness(currentSchedule, graph, courses, timeSlotsCount, roomCapacities).conflicts,
        bestPenalty,
        bestConflicts,
        schedule: deepCopy(currentSchedule),
        movedCourse,
        wasAccepted,
        phase: bestPenalty === 0 ? 'solved' : 'running',
        log: [...log],
        stats: { accepted, rejected },
      });
    }

    // 6. Early termination jika sudah sempurna
    if (bestPenalty === 0) break;
  }

  // ── Report final ──
  const finalPhase = bestPenalty === 0 ? 'solved' : 'finished';
  if (onStep) {
    onStep({
      iteration,
      temperature: T,
      penalty: bestPenalty,
      conflicts: bestConflicts,
      bestPenalty,
      bestConflicts,
      schedule: deepCopy(bestSchedule),
      movedCourse: null,
      wasAccepted: true,
      phase: finalPhase,
      log,
      stats: { accepted, rejected },
    });
  }

  return {
    schedule: bestSchedule,
    penalty: bestPenalty,
    conflicts: bestConflicts,
    iterations: iteration,
    finalTemperature: T,
    accepted,
    rejected,
  };
}

// ============================================================
// 5. VALIDATE DROP - Cek apakah drop valid
// ============================================================

function validateDrop(courseId, dayIndex, timeIndex, schedule, courses, rooms) {
  const issues = [];
  const course = courses.find(c => c.id === courseId);
  if (!course) return { valid: false, issues: ['Matkul tidak ditemukan'] };

  const assignment = schedule[courseId];
  const roomName = assignment ? assignment.room : null;

  // 1. Cek ketersediaan dosen
  if (!isLecturerAvailable(course.lecturerAvailability, dayIndex, timeIndex)) {
    issues.push(`Dosen tidak tersedia di waktu ini`);
  }

  // 2. Cek apakah ada matkul lain oleh dosen yang sama di waktu yang sama
  for (const [id, slot] of Object.entries(schedule)) {
    if (id === courseId) continue;
    if (slot.dayIndex === dayIndex && slot.timeIndex === timeIndex) {
      const otherCourse = courses.find(c => c.id === id);
      if (otherCourse && otherCourse.lecturer === course.lecturer) {
        issues.push(`Dosen ${course.lecturer} sudah mengajar di waktu ini`);
      }
    }
  }

  // 3. Cek kapasitas ruangan & tipe ruangan
  if (roomName) {
    const room = rooms.find(r => r.name === roomName);
    if (room) {
      if (course.students > room.capacity) {
        issues.push(`Kapasitas ruangan ${roomName} (${room.capacity}) < mahasiswa (${course.students})`);
      }
      const roomType = room.type || 'Kelas';
      const cType = course.type || 'Teori';
      if (cType === 'Praktikum' && roomType !== 'Lab') {
        issues.push(`Matkul praktikum harus ditempatkan di ruangan Lab (saat ini: ${roomType})`);
      } else if (cType === 'Teori' && roomType === 'Lab') {
        issues.push(`Matkul teori tidak boleh ditempatkan di ruangan Lab`);
      }
    }
  }

  // 4. Cek apakah ruangan sudah ditempati matkul lain di waktu tersebut
  for (const [id, slot] of Object.entries(schedule)) {
    if (id === courseId) continue;
    
    // Cek overlapping time
    const spanOther = slot.span || 1;
    const spanThis = assignment ? (assignment.span || 1) : 1;
    const sameTime = 
        slot.dayIndex === dayIndex &&
        Math.max(slot.timeIndex, timeIndex) <= Math.min(slot.timeIndex + spanOther - 1, timeIndex + spanThis - 1);
        
    if (sameTime) {
      if (slot.room === roomName) {
        const otherCourse = courses.find(c => c.id === id);
        issues.push(`Ruangan ${roomName} bentrok dengan ${otherCourse ? otherCourse.name : id}`);
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

// ============================================================
// UTILITY
// ============================================================

function deepCopy(obj) {
  const copy = {};
  for (const key of Object.keys(obj)) {
    copy[key] = { ...obj[key] };
  }
  return copy;
}
