# Dokumentasi Teknis AI Auto-Scheduler 📅

Dokumentasi ini menjelaskan secara mendalam tentang arsitektur perangkat lunak, model algoritma kecerdasan buatan, pemodelan graf konflik, dan panduan fitur dari aplikasi **AI Auto-Scheduler**.

---

## 1. Pendahuluan

AI Auto-Scheduler adalah aplikasi penjadwalan kuliah berbasis web murni (client-side) yang dirancang untuk memecahkan permasalahan optimasi kombinatorial penjadwalan (University Course Timetabling Problem). Permasalahan ini diselesaikan dengan menggabungkan teori graf (Graph Coloring) untuk solusi awal dan algoritma heuristik meta-heuristik (Simulated Annealing) untuk optimasi global.

---

## 2. Struktur Proyek dan Arsitektur File

Aplikasi ini menggunakan arsitektur tanpa langkah kompilasi (zero build step) dengan pembagian tanggung jawab sebagai berikut:

* **index.html** : Kerangka UI aplikasi. Berisi struktur sidebar, grid kalender, dashboard chart, modal ketersediaan dosen, modal cetak jadwal personal, dan modal perbandingan versi. File ini juga memuat pustaka eksternal (html2canvas, SheetJS, qrious, jsPDF, Chart.js) via CDN.
* **style.css** : Desain visual sistem. Menerapkan gaya premium bertema gelap (terinspirasi dari Linear dan Vercel) dengan variabel CSS (custom properties), tata letak Flexbox/Grid, transisi mikro-animasi, media cetak (@media print), dan kerangka visual responsif.
* **app.js** : Pengendali utama logika antarmuka dan interaksi pengguna. Mengatur state aplikasi, penanganan event input form, mekanisme drag and drop kalender (mouse dan sentuhan mobile), rendering tooltip, filtering, ekspor data, QR code sharing, perbandingan versi, i18n (bahasa), dan sinkronisasi data local storage.
* **data.js** : Model data dan konstanta dasar. Menyimpan preset mata kuliah, ruangan, ketersediaan dosen default, dan aturan pemetaan interval waktu. File ini juga memuat fungsi pendukung seperti pengecekan ketersediaan dosen (`isLecturerAvailable`) dan pencarian slot kosong.
* **graph.js** : Representasi graf konflik perkuliahan menggunakan struktur data Adjacency List.
* **solver.js** : Mesin kecerdasan buatan (AI solver). Memuat algoritma pembentuk solusi awal (Greedy Coloring) dan algoritma optimasi utama (Simulated Annealing).

---

## 3. Permodelan Algoritma dan Matematika

Proses penjadwalan dilakukan melalui dua tahapan utama: pembentukan solusi awal yang legal dan optimasi kualitas solusi.

### A. Graf Konflik (Conflict Graph)
Sebelum jadwal disusun, sistem mendeteksi potensi bentrok antar mata kuliah dan memodelkannya ke dalam graf konflik $G = (V, E)$ di mana:
* **Node (Vertex - V)** : Mewakili setiap kelas mata kuliah yang perlu dijadwalkan.
* **Edge (E)** : Menghubungkan dua node yang tidak boleh dijadwalkan pada slot waktu yang sama. Hubungan ini terbentuk berdasarkan aturan berikut:
  1. **Lecturer Conflict** : Dua kelas diajar oleh dosen yang sama.
  2. **Semester Class Conflict** : Dua kelas berada pada semester yang sama (bukan kelas paralel seperti Kelas A dan Kelas B).

### B. Greedy Graph Coloring (Solusi Awal)
Solusi awal dibentuk menggunakan pendekatan Greedy Coloring dengan heuristik **Largest Degree First** (LDF):
1. Urutkan seluruh mata kuliah berdasarkan derajat konflik terbesar (node dengan edge terbanyak diwarnai terlebih dahulu).
2. Untuk setiap mata kuliah, cari slot waktu terkecil (merepresentasikan warna dalam teori graf) dan ruangan kosong yang memenuhi kriteria kelayakan dasar (tidak memicu bentrok dosen/kelas di slot tersebut dan kapasitas ruangan mencukupi).

### C. Simulated Annealing (Optimasi Global)
Untuk menyelesaikan konflik yang tersisa dan memaksimalkan preferensi, digunakan algoritma Simulated Annealing (SA) dengan alur matematis sebagai berikut:

1. **Inisialisasi** : Dimulai dari solusi Greedy awal dengan suhu awal $T_0 = 100$ dan tingkat pendinginan (cooling rate) $\alpha = 0.995$.
2. **Generasi Solusi Tetangga** : Pada setiap iterasi, pilih satu mata kuliah secara acak dan geser secara acak ke slot waktu atau ruangan lain.
3. **Fungsi Fitness (Energi - E)** : Evaluasi solusi tetangga berdasarkan jumlah pelanggaran penalti (semakin kecil nilai fitness/penalti, semakin baik kualitas jadwal).
4. **Metropolis Acceptance Criterion** :
   * Jika solusi tetangga menghasilkan penalti lebih rendah ($\Delta E < 0$), solusi langsung diterima.
   * Jika penalti sama ($\Delta E = 0$), solusi diterima dengan probabilitas 50%.
   * Jika solusi tetangga lebih buruk ($\Delta E > 0$), solusi diterima dengan probabilitas Boltzmann:
     $$P(Accept) = e^{-\frac{\Delta E}{T}}$$
     Mekanisme ini memungkinkan algoritma keluar dari jebakan optimum lokal (*local optima*).
5. **Pendinginan** : Pada setiap langkah iterasi, suhu diturunkan:
   $$T_{k+1} = T_k \times \alpha$$
6. **Kriteria Berhenti** : Proses berhenti jika suhu mendekati nol, mencapai batas iterasi (5.000 langkah), atau ditemukan solusi sempurna tanpa penalti (fitness = 0).

---

## 4. Pemodelan Aturan Penalti (Penalty Model)

Sistem evaluasi fitness membagi aturan menjadi dua kategori:

### Hard Constraints (Wajib Dipenuhi - Pelanggaran memicu penalti +10)
* **Bentrok Slot Waktu & Ruangan** : Dua mata kuliah dijadwalkan di ruangan yang sama pada waktu yang sama.
* **Bentrok Hubungan Graf** : Dua kelas yang terhubung dalam graf konflik (dosen sama atau semester sama) diletakkan di slot waktu yang sama.
* **Kapasitas Ruangan** : Jumlah mahasiswa kelas melebihi kapasitas maksimum ruangan yang ditempatkan.
* **Ketersediaan Dosen (Time-Blocking)** : Kelas dijadwalkan di luar slot waktu mengajar yang telah diizinkan oleh dosen bersangkutan.
* **Kesesuaian Tipe Ruangan** : Kelas Praktikum wajib ditempatkan di ruangan bertipe **Lab**. Kelas Teori tidak boleh ditempatkan di ruangan bertipe **Lab**.

### Soft Constraints (Preferensi - Pelanggaran memicu penalti +2)
* **Preferensi Waktu Dosen** : Penempatan di pagi hari padahal dosen memilih preferensi "Hindari Pagi", atau penempatan di sore hari padahal dosen memilih "Hindari Sore".

---

## 5. Panduan Fitur Tingkat Lanjut

Aplikasi ini dilengkapi dengan fitur pendukung operasional penjadwalan akademik:

### A. Ketersediaan Dosen Presisi Tinggi (Time-Blocking)
Berbeda dengan sistem hari penuh, aplikasi ini memungkinkan pengguna menentukan jam mengajar dosen secara spesifik melalui matriks checkbox Hari vs Jam pada modal ketersediaan. AI akan secara otomatis memvalidasi kelayakan penempatan pada slot jam terpilih.

### B. Multi-SKS (Continuous Time Blocks)
Mata kuliah dengan bobot 4 SKS secara otomatis dialokasikan ke dalam **2 slot waktu berurutan** (continuous blocks, misal 08:00 - 10:00 dan 10:00 - 12:00) pada ruangan yang sama. AI memperlakukan ini sebagai satu entitas tunggal selama optimasi Simulated Annealing.

### C. Skor Kualitas Jadwal (Quality Rating)
Skor kualitas ditampilkan dalam skala persentase 0 hingga 100% pada bar statistik utama. Skor dihitung secara dinamis dari kombinasi:
1. Jumlah pelanggaran Hard Constraints (pengurangan 15 poin per konflik).
2. Jumlah pelanggaran Soft Constraints (pengurangan 3 poin per preferensi).
3. Tingkat pemerataan mingguan (Weekly Imbalance) : Mencegah jadwal menumpuk padat hanya pada 1 atau 2 hari saja.
4. Efisiensi Utilisasi Ruangan (Room Utilization) : Mencegah penempatan kelas kecil di ruangan yang terlalu besar.

### D. QR Code Sharing & Halaman Read-Only
Pengguna dapat membagikan jadwal spesifik dosen atau semester tertentu dengan men-scan QR Code atau menyalin tautan yang dihasilkan pada modal ekspor. 
* Tautan tersebut memuat data jadwal terkompresi berbasis **Base64**.
* Saat dibuka di browser lain (mendeteksi query parameter `?view=personal`), sistem akan memuat antarmuka kalender baca-saja (read-only view) tanpa sidebar admin, dashboard statistik, log, atau grafik, memberikan tampilan jadwal yang bersih untuk mahasiswa atau staf akademik.

### E. Perbandingan Versi (Diff View)
Modal ini memungkinkan pengguna memilih dua versi jadwal akademik yang tersimpan di memori local storage, lalu membandingkannya secara side-by-side untuk mengidentifikasi pergeseran slot waktu, perubahan ruangan, penambahan kelas baru, atau penghapusan kelas secara mendetail.

### F. Multi-Language (ID & EN)
Mendukung pelokalan bahasa instan antara Bahasa Indonesia dan Bahasa Inggris untuk seluruh label tombol, teks formulir, tooltip, bagan statistik, notifikasi pop-up, serta log konsol algoritma.

---

## 6. Deployment & Panduan Penggunaan Lokal

Karena dibangun dengan arsitektur client-side tanpa dependensi backend, aplikasi ini sangat mudah untuk dijalankan dan dideploy:

1. **Jalankan Lokal** : Cukup kloning repositori dan buka file `index.html` langsung di browser Anda, atau gunakan ekstensi *Live Server* pada editor teks VS Code.
2. **Deploy Produksi** : Anda dapat langsung mengunggah direktori proyek ini ke penyedia layanan hosting statis gratis seperti GitHub Pages, Netlify, atau Vercel. Tidak diperlukan konfigurasi server tambahan.
