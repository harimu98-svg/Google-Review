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
  const salesList = data.data || [];

  el.innerHTML = `
    <h2>Sales</h2>
    <button class="btn btn-primary" id="addSalesBtn" style="margin-bottom:16px">+ Tambah Sales</button>
    <div id="salesForm"></div>
    <div id="salesTable"></div>
  `;

  document.getElementById('addSalesBtn').addEventListener('click', () => {
    renderSalesForm(null);
  });

  renderSalesTable(salesList);
}

function renderSalesTable(rows) {
  const el = document.getElementById('salesTable');
  if (!rows.length) {
    el.innerHTML = '<div class="empty">Belum ada sales. Klik "+ Tambah Sales" untuk menambahkan.</div>';
    return;
  }

  el.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Nama</th>
          <th>Username</th>
          <th>Area</th>
          <th>No HP</th>
          <th>Komisi/Card</th>
          <th>Target</th>
          <th>Status</th>
          <th>Aksi</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(s => `
          <tr>
            <td>${escapeHtml(s.nama)}</td>
            <td>${escapeHtml(s.username)}</td>
            <td>${escapeHtml(s.area || '-')}</td>
            <td>${escapeHtml(s.no_hp || '-')}</td>
            <td>${formatRupiah(s.komisi_per_card)}</td>
            <td>${s.target_bulanan}</td>
            <td>${s.aktif ? '✅ Aktif' : '❌ Nonaktif'}</td>
            <td>
              <button class="btn btn-outline btn-sm" onclick='editSales(${JSON.stringify(s).replace(/'/g, "&apos;")})'>Edit</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderSalesForm(sales) {
  const isEdit = !!sales;
  const el = document.getElementById('salesForm');

  el.innerHTML = `
    <div class="form-card">
      <h3>${isEdit ? 'Edit Sales' : 'Tambah Sales Baru'}</h3>
      <form id="salesFormEl">
        <div class="form-group">
          <label>Nama Lengkap *</label>
          <input type="text" id="sf_nama" required value="${escapeHtml(sales?.nama || '')}">
        </div>
        <div class="form-group">
          <label>Username *</label>
          <input type="text" id="sf_username" required value="${escapeHtml(sales?.username || '')}" ${isEdit ? 'readonly' : ''}>
        </div>
        <div class="form-group">
          <label>Password ${isEdit ? '(kosongkan jika tidak diubah)' : '*'}</label>
          <input type="text" id="sf_password" ${isEdit ? '' : 'required'} placeholder="${isEdit ? 'Biarkan kosong jika tidak diubah' : 'Password untuk login'}">
        </div>
        <div class="form-group">
          <label>Email (opsional)</label>
          <input type="email" id="sf_email" value="${escapeHtml(sales?.email || '')}">
        </div>
        <div class="form-group">
          <label>No HP</label>
          <input type="text" id="sf_no_hp" value="${escapeHtml(sales?.no_hp || '')}" placeholder="6281234567890">
        </div>
        <div class="form-group">
          <label>Area</label>
          <input type="text" id="sf_area" value="${escapeHtml(sales?.area || '')}" placeholder="Jakarta Selatan">
        </div>
        <div class="form-group">
          <label>Komisi per Card (Rp)</label>
          <input type="number" id="sf_komisi" value="${sales?.komisi_per_card || 0}" min="0">
        </div>
        <div class="form-group">
          <label>Target Bulanan (jumlah card)</label>
          <input type="number" id="sf_target" value="${sales?.target_bulanan || 0}" min="0">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="sf_aktif">
            <option value="true" ${sales?.aktif !== false ? 'selected' : ''}>Aktif</option>
            <option value="false" ${sales?.aktif === false ? 'selected' : ''}>Nonaktif</option>
          </select>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${isEdit ? 'Simpan Perubahan' : 'Tambah Sales'}</button>
          <button type="button" class="btn btn-outline" id="cancelSalesBtn">Batal</button>
        </div>
      </form>
      <div id="salesFormMsg"></div>
    </div>
  `;

  document.getElementById('cancelSalesBtn').addEventListener('click', () => {
    el.innerHTML = '';
  });

  document.getElementById('salesFormEl').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';

    const formData = {
      nama: document.getElementById('sf_nama').value.trim(),
      username: document.getElementById('sf_username').value.trim(),
      email: document.getElementById('sf_email').value.trim(),
      no_hp: document.getElementById('sf_no_hp').value.trim(),
      area: document.getElementById('sf_area').value.trim(),
      komisi_per_card: parseInt(document.getElementById('sf_komisi').value) || 0,
      target_bulanan: parseInt(document.getElementById('sf_target').value) || 0,
      aktif: document.getElementById('sf_aktif').value === 'true'
    };

    const password = document.getElementById('sf_password').value;
    if (password) formData.password = password;

    let result;
    if (isEdit) {
      result = await api('sales-manage', {
        action: 'update',
        id: sales.id,
        data: formData
      });
    } else {
      result = await api('sales-manage', {
        action: 'create',
        data: formData
      });
    }

    if (result.success) {
      document.getElementById('salesFormMsg').innerHTML = 
        `<div class="success">✅ Sales berhasil ${isEdit ? 'diupdate' : 'ditambahkan'}</div>`;
      setTimeout(() => {
        document.getElementById('salesForm').innerHTML = '';
        renderPage('sales');
      }, 1000);
    } else {
      document.getElementById('salesFormMsg').innerHTML = 
        `<div class="error">❌ ${result.error}</div>`;
      btn.disabled = false;
      btn.textContent = isEdit ? 'Simpan Perubahan' : 'Tambah Sales';
    }
  });
}

// Global function untuk edit (dipanggil dari onclick)
window.editSales = function(sales) {
  renderSalesForm(sales);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}
// ===== INITIAL RENDER =====
renderPage('dashboard');
