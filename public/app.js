// ===== SESSION CHECK =====
const session = JSON.parse(localStorage.getItem('digicard_session') || 'null');

if (!session || !session.success) {
  location.href = '/login';
  throw new Error('Not logged in');
}

// ===== INIT DASHBOARD =====
document.getElementById('userName').textContent = session.nama;
document.getElementById('userRole').textContent = session.role === 'admin' ? 'Admin' : 'Sales';

if (session.role === 'admin') {
  document.getElementById('menuAdmin').style.display = 'flex';
} else {
  document.getElementById('menuSales').style.display = 'flex';
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('digicard_session');
  location.href = '/login';
});

document.querySelectorAll('.menu-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderPage(btn.dataset.page);
  });
});

// ===== API HELPER =====
async function api(action, body = {}, params = {}) {
  const url = new URL('/.netlify/functions/activate', location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body, ...session })
  });
  return res.json();
}

function formatRupiah(n) {
  return 'Rp ' + (n || 0).toLocaleString('id-ID');
}

function formatTanggal(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ===== RENDER PAGE =====
function renderPage(page) {
  const el = document.getElementById('pageContent');
  el.innerHTML = '<div class="loading">Memuat...</div>';

  switch (page) {
    case 'dashboard': return renderDashboard(el);
    case 'cards': return renderCards(el);
    case 'create': return renderCreate(el);
    case 'update': return renderUpdate(el);
    case 'sales': return renderSales(el);
  }
}

// ===== DASHBOARD =====
async function renderDashboard(el) {
  const data = await api(
    session.role === 'admin' ? 'dashboard-admin' : 'dashboard-sales',
    { sales_id: session.sales_id }
  );

  if (!data.success) { el.innerHTML = `<div class="error">${data.error}</div>`; return; }

  const s = data.stats;
  el.innerHTML = `
    <h2>Dashboard</h2>
    <div class="filter-bar">
      <div class="form-group">
        <label>Dari Tanggal</label>
        <input type="date" id="filterDari">
      </div>
      <div class="form-group">
        <label>Sampai Tanggal</label>
        <input type="date" id="filterSampai">
      </div>
      <button class="btn btn-primary btn-sm" id="applyFilter" style="margin-bottom:1px">Terapkan</button>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total Card</div><div class="stat-value">${s.total || s.total_card || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Terjual</div><div class="stat-value">${s.sold || s.total_card || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Penjualan</div><div class="stat-value">${formatRupiah(s.total_penjualan)}</div></div>
      <div class="stat-card"><div class="stat-label">Komisi</div><div class="stat-value">${formatRupiah(s.total_komisi)}</div></div>
    </div>
    ${session.role === 'admin' ? renderSalesReport(data.salesReport || []) : ''}
  `;

  document.getElementById('applyFilter').addEventListener('click', () => {
    const dari = document.getElementById('filterDari').value;
    const sampai = document.getElementById('filterSampai').value;
    if (dari) session._dari = dari;
    if (sampai) session._sampai = sampai;
    renderDashboard(el);
  });
}

function renderSalesReport(rows) {
  if (!rows.length) return '<div class="empty">Belum ada penjualan</div>';
  return `
    <h3>Performa Sales</h3>
    <table class="table">
      <thead><tr><th>Nama</th><th>Area</th><th>Terjual</th><th>Penjualan</th><th>Komisi</th><th>Target</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${r.nama}</td>
            <td>${r.area}</td>
            <td>${r.total_card}</td>
            <td>${formatRupiah(r.total_penjualan)}</td>
            <td>${formatRupiah(r.total_komisi)}</td>
            <td>${r.target || 0}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ===== CARDS =====
async function renderCards(el) {
  const params = session.role === 'sales' ? { sales_id: session.sales_id } : {};
  const data = await api('cards-search', params);

  el.innerHTML = `
    <h2>${session.role === 'admin' ? 'Semua Card' : 'Card Saya'}</h2>
    <input type="text" id="searchInput" placeholder="Cari ID / card ID / nama usaha..." class="input-search" style="margin-bottom:16px">
    <div id="cardsTable"></div>
  `;

  document.getElementById('searchInput').addEventListener('input', async (e) => {
    const q = e.target.value.trim();
    const d = await api('cards-search', { ...params, q });
    renderCardsTable(d.data || []);
  });

  renderCardsTable(data.data || []);
}

function renderCardsTable(rows) {
  const el = document.getElementById('cardsTable');
  if (!rows.length) { el.innerHTML = '<div class="empty">Tidak ada data</div>'; return; }
  el.innerHTML = `
    <table class="table">
      <thead><tr><th>ID</th><th>Card ID</th><th>Status</th><th>Usaha</th><th>Harga</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${r.id}</td>
            <td>${r.card_id}</td>
            <td><span class="badge badge-${r.status}">${r.status}</span></td>
            <td>${r.place_name || '-'}</td>
            <td>${r.harga_jual ? formatRupiah(r.harga_jual) : '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ===== CREATE CARD =====
async function renderCreate(el) {
  el.innerHTML = `
    <h2>Buat Card Draft</h2>
    <div class="form-group">
      <label>Jumlah Card</label>
      <input type="number" id="jumlah" value="100" min="1" max="1000">
    </div>
    <button class="btn btn-primary" id="createBtn">Buat Card</button>
    <div id="createResult"></div>
  `;

  document.getElementById('createBtn').addEventListener('click', async () => {
    const jumlah = parseInt(document.getElementById('jumlah').value);
    const btn = document.getElementById('createBtn');
    btn.disabled = true; btn.textContent = 'Memproses...';

    const data = await api('cards-create', { jumlah });
    document.getElementById('createResult').innerHTML = data.success
      ? `<div class="success">✅ ${data.jumlah} card dibuat (ID ${data.dari} - ${data.sampai})</div>`
      : `<div class="error">❌ ${data.error}</div>`;

    btn.disabled = false; btn.textContent = 'Buat Card';
  });
}

// ===== UPDATE STATUS =====
async function renderUpdate(el) {
  const data = await api('sales-list');

  el.innerHTML = `
    <h2>Update Status Card</h2>
    <div class="form-group">
      <label>ID Card (bisa multiple, pisah koma)</label>
      <input type="text" id="cardIds" placeholder="Contoh: B001, B002, B003">
    </div>
    <div class="form-group">
      <label>Status Baru</label>
      <select id="newStatus">
        <option value="printed">Printed</option>
        <option value="sold">Sold</option>
        <option value="disabled">Disabled</option>
      </select>
    </div>
    <div id="soldFields" style="display:none">
      <div class="form-group">
        <label>Sales</label>
        <select id="salesSelect">
          <option value="">-- Pilih Sales --</option>
          ${(data.data || []).map(s => `<option value="${s.id}" data-komisi="${s.komisi_per_card}">${s.nama} (${s.area || '-'})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Harga Jual (Rp)</label>
        <input type="number" id="hargaJual" placeholder="150000" min="0">
      </div>
      <div class="form-group">
        <label>Komisi (Rp) — kosongkan untuk pakai default sales</label>
        <input type="number" id="komisiInput" placeholder="15000" min="0">
      </div>
    </div>
    <button class="btn btn-primary" id="updateBtn">Update</button>
    <div id="updateResult"></div>
  `;

  document.getElementById('newStatus').addEventListener('change', (e) => {
    document.getElementById('soldFields').style.display = e.target.value === 'sold' ? 'block' : 'none';
  });

  document.getElementById('updateBtn').addEventListener('click', async () => {
    const ids = document.getElementById('cardIds').value.split(',').map(s => s.trim()).filter(Boolean);
    const status = document.getElementById('newStatus').value;
    const sales_id = document.getElementById('salesSelect')?.value;
    const harga_jual = document.getElementById('hargaJual')?.value;
    const komisi = document.getElementById('komisiInput')?.value;

    if (!ids.length) { alert('Masukkan ID card'); return; }

    const btn = document.getElementById('updateBtn');
    btn.disabled = true; btn.textContent = 'Memproses...';

    const data = await api('cards-update', {
      ids, status,
      sales_id: sales_id || undefined,
      harga_jual: harga_jual || undefined,
      komisi: komisi || undefined
    });

    document.getElementById('updateResult').innerHTML = data.success
      ? `<div class="success">✅ ${data.updated} card di-update ke ${status}</div>`
      : `<div class="error">❌ ${data.error}</div>`;

    btn.disabled = false; btn.textContent = 'Update';
  });
}

// ===== SALES =====
async function renderSales(el) {
  const data = await api('sales-list');
  el.innerHTML = `
    <h2>Sales</h2>
    <table class="table">
      <thead><tr><th>Nama</th><th>Username</th><th>Area</th><th>Komisi/Card</th><th>Target</th><th>Status</th></tr></thead>
      <tbody>
        ${(data.data || []).map(s => `
          <tr>
            <td>${s.nama}</td>
            <td>${s.username}</td>
            <td>${s.area || '-'}</td>
            <td>${formatRupiah(s.komisi_per_card)}</td>
            <td>${s.target_bulanan}</td>
            <td>${s.aktif ? '✅ Aktif' : '❌ Nonaktif'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ===== INITIAL RENDER =====
renderPage('dashboard');
