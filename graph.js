/**
 * graph.js - Conflict Graph (Adjacency List)
 * ============================================
 * Representasi graf konflik antar mata kuliah.
 *
 * Konsep Teori Graf:
 *   - Node  = Mata kuliah
 *   - Edge  = Dua matkul TIDAK BOLEH dijadwalkan bersamaan
 *   - Degree = Jumlah konflik per matkul
 *
 * Referensi:
 *   - Graph Coloring: https://en.wikipedia.org/wiki/Graph_coloring
 *   - Adjacency List: materi Teori Graf Pertemuan 3
 */

class ConflictGraph {
  constructor() {
    // adjacencyList: Map<courseId, Set<courseId>>
    this.adjacencyList = new Map();
    // edgeReasons: Map<"idA-idB", string> (sorted key)
    this.edgeReasons = new Map();
  }

  // ── Node Operations ──────────────────────────────────

  addNode(courseId) {
    if (!this.adjacencyList.has(courseId)) {
      this.adjacencyList.set(courseId, new Set());
    }
  }

  getNodes() {
    return Array.from(this.adjacencyList.keys());
  }

  getNodeCount() {
    return this.adjacencyList.size;
  }

  // ── Edge Operations ──────────────────────────────────

  addEdge(courseA, courseB, reason = '') {
    this.addNode(courseA);
    this.addNode(courseB);
    this.adjacencyList.get(courseA).add(courseB);
    this.adjacencyList.get(courseB).add(courseA);

    const key = [courseA, courseB].sort().join('|');
    this.edgeReasons.set(key, reason);
  }

  getEdges() {
    const edges = [];
    const seen = new Set();
    for (const [node, neighbors] of this.adjacencyList) {
      for (const neighbor of neighbors) {
        const key = [node, neighbor].sort().join('|');
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({
            from: node,
            to: neighbor,
            reason: this.edgeReasons.get(key) || '',
          });
        }
      }
    }
    return edges;
  }

  getEdgeCount() {
    return this.getEdges().length;
  }

  // ── Query Operations ─────────────────────────────────

  /** Dapatkan semua tetangga (matkul yang konflik) */
  getNeighbors(courseId) {
    return this.adjacencyList.get(courseId) || new Set();
  }

  /** Derajat node = jumlah edge = jumlah matkul yang konflik */
  getDegree(courseId) {
    return this.getNeighbors(courseId).size;
  }

  /** Apakah dua matkul saling konflik? */
  isConflict(courseA, courseB) {
    const neighbors = this.adjacencyList.get(courseA);
    return neighbors ? neighbors.has(courseB) : false;
  }

  /** Alasan kenapa dua matkul konflik */
  getConflictReason(courseA, courseB) {
    const key = [courseA, courseB].sort().join('|');
    return this.edgeReasons.get(key) || null;
  }

  // ── Factory Method ───────────────────────────────────

  /**
   * Bangun graf konflik dari daftar matkul dan constraints.
   * @param {Array} courses  - daftar objek matkul
   * @param {Array} constraints - daftar { courseA, courseB, reason }
   * @returns {ConflictGraph}
   */
  static fromConstraints(courses, constraints) {
    const graph = new ConflictGraph();

    // Tambah semua node
    for (const course of courses) {
      graph.addNode(course.id);
    }

    // Tambah semua edge berdasarkan constraints
    for (const c of constraints) {
      graph.addEdge(c.courseA, c.courseB, c.reason);
    }

    return graph;
  }
}
