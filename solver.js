/**
 * solver.js — Graph Coloring + Simulated Annealing
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
// 1. GREEDY GRAPH COLORING — Solusi Awal
// ============================================================
// Mewarnai graf secara greedy: node dengan derajat tertinggi
// (paling banyak konflik) diberi warna (slot waktu) duluan.
//
// "Warna" di sini = kombinasi (hari, waktu, ruangan)

function greedyColoring(graph, courses, slots) {
  const schedule = {}; // courseId → { dayIndex, timeIndex, room }

  // Urutkan: matkul dengan paling banyak konflik di-assign duluan
  // (heuristik "Largest Degree First")
  const sorted = [...courses].sort(
    (a, b) => graph.getDegree(b.id) - graph.getDegree(a.id)
  );

  for (const course of sorted) {
    let assigned = false;

    for (const slot of slots) {
      let conflict = false;

      // Cek apakah slot ini bentrok dengan tetangga di graf konflik
      // Tetangga = matkul yang TIDAK BOLEH bersamaan
      const neighbors = graph.getNeighbors(course.id);
      for (const neighborId of neighbors) {
        if (schedule[neighborId]) {
          const nSlot = schedule[neighborId];
          // Dua matkul yang konflik tidak boleh di hari & waktu yang sama
          if (nSlot.dayIndex === slot.dayIndex && nSlot.timeIndex === slot.timeIndex) {
            conflict = true;
            break;
          }
        }
      }

      // Cek apakah ruangan sudah terpakai di slot ini
      if (!conflict) {
        for (const [, assignedSlot] of Object.entries(schedule)) {
          if (
            assignedSlot.dayIndex === slot.dayIndex &&
            assignedSlot.timeIndex === slot.timeIndex &&
            assignedSlot.room === slot.room
          ) {
            conflict = true;
            break;
          }
        }
      }

      if (!conflict) {
        schedule[course.id] = { ...slot };
        assigned = true;
        break;
      }
    }

    // Fallback: jika tidak ada slot valid, assign random
    // SA akan memperbaiki ini nanti
    if (!assigned) {
      const randomSlot = slots[Math.floor(Math.random() * slots.length)];
      schedule[course.id] = { ...randomSlot };
    }
  }

  return schedule;
}

// ============================================================
// 2. FITNESS FUNCTION — Hitung Jumlah Konflik
// ============================================================
// Semakin kecil = semakin baik. Target = 0 (tanpa konflik).
//
// Jenis konflik:
//   - Hard: Matkul yang terhubung di graf konflik berada di waktu sama → +10
//   - Hard: Dua matkul di ruangan yang sama pada waktu yang sama → +10

function calculateFitness(schedule, graph, courses, timeSlotsCount) {
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

      // Apakah keduanya di hari & waktu yang sama?
      const sameTime =
        slotA.dayIndex === slotB.dayIndex &&
        slotA.timeIndex === slotB.timeIndex;

      if (sameTime) {
        // Konflik graf: matkul yang terhubung ada di waktu bersamaan
        if (graph.isConflict(idA, idB)) {
          totalPenalty += 10;
          hardConflicts++;
        }
        // Konflik ruangan: ruangan yang sama di waktu bersamaan
        if (slotA.room === slotB.room) {
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
  }

  return { penalty: totalPenalty, conflicts: hardConflicts };
}

// ============================================================
// 3. NEIGHBOR GENERATION — Buat State Tetangga
// ============================================================
// Pilih satu matkul secara acak, pindahkan ke slot waktu acak.
// Ini adalah langkah "random successor" di pseudocode SA.

function getNeighborState(schedule, slots) {
  const newSchedule = {};
  for (const key of Object.keys(schedule)) {
    newSchedule[key] = { ...schedule[key] };
  }

  const courseIds = Object.keys(newSchedule);
  const randomCourse = courseIds[Math.floor(Math.random() * courseIds.length)];
  const randomSlot = slots[Math.floor(Math.random() * slots.length)];

  newSchedule[randomCourse] = { ...randomSlot };

  return { schedule: newSchedule, movedCourse: randomCourse };
}

// ============================================================
// 4. SIMULATED ANNEALING — Optimasi Utama
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

async function simulatedAnnealing(graph, courses, slots, config, onStep) {
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
  let currentSchedule = greedyColoring(graph, courses, slots);
  let currentResult = calculateFitness(currentSchedule, graph, courses, timeSlotsCount);
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
      slots
    );
    const neighborResult = calculateFitness(neighborSchedule, graph, courses, timeSlotsCount);
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
      bestConflicts = calculateFitness(currentSchedule, graph).conflicts;
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
        conflicts: calculateFitness(currentSchedule, graph).conflicts,
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
        conflicts: calculateFitness(currentSchedule, graph).conflicts,
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
// UTILITY
// ============================================================

function deepCopy(obj) {
  const copy = {};
  for (const key of Object.keys(obj)) {
    copy[key] = { ...obj[key] };
  }
  return copy;
}
