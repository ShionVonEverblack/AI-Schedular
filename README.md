# AI Auto-Scheduler 📅

Aplikasi penjadwalan kuliah otomatis cerdas berbasis web murni. Aplikasi ini dibangun untuk mempermudah penyusunan jadwal kuliah bebas bentrok dengan menerapkan algoritma Kecerdasan Buatan (AI).

## 🚀 Fitur Utama
- **Penjadwalan Otomatis Berbasis AI:** Menggunakan kombinasi algoritma **Greedy Graph Coloring** (untuk solusi awal) dan **Simulated Annealing** (untuk optimasi global terhindar dari *local optima*).
- **Aturan Ketat (*Hard Constraints*):** Perlindungan absolut 1 slot 1 matkul (tidak mengizinkan adanya kelas menumpuk di waktu yang sama).
- **Visualisasi Graf Konflik:** Menyediakan panel Canvas HTML5 interaktif yang menggambar *node* (mata kuliah) dan *edge* (konflik) menggunakan konsep gaya tolak-menolak (*Force-Directed Graph*).
- **Drag & Drop Interaktif:** Dapat memodifikasi jadwal secara manual dengan fitur geser-letak (*drag-and-drop*). Validasi ketat akan otomatis memblokir peletakan pada slot yang sudah terisi.
- **Preferensi Waktu (*Soft Constraints*):** Mendukung pengaturan preferensi pada matkul tertentu (misalnya: "Hindari Pagi" atau "Hindari Sore").
- **Eksport & Cetak:** Ekspor jadwal utuh dalam format CSV (*spreadsheets*) atau langsung cetak ke PDF dengan tampilan *print-view* (berlatar putih) yang bersih dan ramah tinta.

## 🛠️ Teknologi yang Digunakan
- **HTML5 & CSS3:** Desain web responsif menggunakan CSS Flexbox & CSS Grid, dilengkapi tema *Dark Mode*, efek *Glassmorphism*, palet HSL modern, dan mikro-animasi halus (tanpa library).
- **Vanilla JavaScript (ES6+):** Seluruh logika UI, manipulasi DOM, hingga implementasi kecerdasan buatan dieksekusi secara instan di peramban (tanpa server backend).

## 📂 Struktur Proyek
- `index.html` — Kerangka utama halaman UI.
- `style.css` — Penata gaya (*styling*), animasi, tata letak *responsive*, hingga media query khusus pencetakan (`@media print`).
- `app.js` — Mengontrol interaksi antarmuka (DOM), event *drag-and-drop*, logika ekspor CSV, dan koordinasi UI dengan mesin AI.
- `data.js` — Mengelola struktur *State* aplikasi, data uji coba (Preset), serta generator ruang lingkup kombinasi waktu-ruangan.
- `graph.js` — Kelas pembentuk graf murni (`ConflictGraph`) untuk merekam keterhubungan pertentangan antar mata kuliah.
- `solver.js` — Mesin AI utama yang menaungi *Greedy Graph Coloring*, penghitung penalti (*Fitness Calculator*), dan putaran optimasi *Simulated Annealing*.

## 💡 Cara Penggunaan
1. Jalankan `index.html` menggunakan peramban (browser) web modern apa pun (Chrome, Edge, Firefox, Safari). Anda juga bisa menggunakan fitur *Live Server* di VSCode.
2. Di panel sebelah kiri, atur dan tambahkan **Mata Kuliah**, **Ruangan**, dan daftar **Jam Kuliah**.
3. Atau, klik tombol **"📋 Load Preset"** untuk mengisi data pengujian secara otomatis sebagai contoh.
4. Klik **"⚡ Generate Jadwal"** untuk menghidupkan mesin kecerdasan buatan menyusun jadwal terbaik.
5. Bila diperlukan, geser kartu jadwal (*Drag & Drop*) ke kotak kosong lain untuk melakukan penyetelan akhir.
6. Klik **"💾 Export CSV"** atau **"🖨️ Cetak"** untuk mengunduh hasil jadwal kuliah Anda.

---
*Dikembangkan untuk memberikan solusi tata letak jadwal yang elegan, responsif, dan cerdas.*
