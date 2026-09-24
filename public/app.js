// ===== SESSION CHECK =====
const session = JSON.parse(localStorage.getItem('digicard_session') || 'null');

if (!session || !session.success) {
  location.href = '/login';
  throw new Error('Not logged in');
}

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

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

// ===== PARSE CARD IDS =====
function parseCardIds(input) {
  const ids = [];
  const parts = input.split(',').map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    const rangeMatch = part.match(/^([A-Z])(\d{3})\s*-\s*([A-Z]?)(\d{3})$/);
    if (rangeMatch) {
      const [, startLetter, startNum, endLetter, endNum] = rangeMatch;
      const startNumeric = codeToNum(startLetter, startNum);
      const endNumeric = codeToNum(endLetter || startLetter, endNum);
      if (startNumeric && endNumeric) {
        for (let i = startNumeric; i <= endNumeric; i++) {
          ids.push(numToCode(i));
        }
        continue;
      }
    }
    if (/^[A-Z]\d{3}$/.test(part)) { ids.push(part); continue; }
    if (/^\d+$/.test(part)) { ids.push(part); continue; }
  }

  return [...new Set(ids)];
}

function codeToNum(letter, num) {
  const batch = letter.charCodeAt(0) - 64;
  return (batch - 1) * 999 + parseInt(num, 10);
}

function numToCode(numeric) {
  const batchIndex = Math.ceil(numeric / 999);
  const letter = String.fromCharCode(64 + batchIndex);
  const num = ((numeric - 1) % 999) + 1;
  return letter + String(num).padStart(3, '0');
}

// ===== RENDER PAGE =====
function renderPage(page) {
  const el = document.getElementById('pageContent');
  el.innerHTML = '<div class="loading">Memuat...</div>';

  switch (page) {
    case 'dashboard': return renderDashboard(el);
    case 'cards': return renderCards(el);
    case 'create': return renderCreate(el);
    case 'sell': return renderSell(el);
    case 'assign': return renderAssignSales(el);
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

  if (session.role === 'admin') {
    el.innerHTML = `
      <h2>Dashboard Admin</h2>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">Total Card</div><div class="stat-value">${s.total || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Printed</div><div class="stat-value">${s.printed || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Sold</div><div class="stat-value">${s.sold || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Assigned</div><div class="stat-value">${s.assigned || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Activated</div><div class="stat-value">${s.activated || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Penjualan</div><div class="stat-value">${formatRupiah(s.total_penjualan)}</div></div>
        <div class="stat-card"><div class="stat-label">Komisi</div><div class="stat-value">${formatRupiah(s.total_komisi)}</div></div>
      </div>
      ${renderSalesReport(data.salesReport || [])}
    `;
  } else {
    el.innerHTML = `
      <h2>Dashboard Saya</h2>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">Total Card</div><div class="stat-value">${s.total_card || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Activated</div><div class="stat-value">${s.total_activated || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Penjualan</div><div class="stat-value">${formatRupiah(s.total_penjualan)}</div></div>
        <div class="stat-card"><div class="stat-label">Komisi</div><div class="stat-value">${formatRupiah(s.total_komisi)}</div></div>
      </div>
    `;
  }
}

function renderSalesReport(rows) {
  if (!rows.length) return '<div class="empty">Belum ada penjualan</div>';
  return `
    <h3>Performa Sales</h3>
    <table class="table">
      <thead><tr><th>Nama</th><th>Area</th><th>Activated</th><th>Penjualan</th><th>Komisi</th><th>Target</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${escapeHtml(r.nama)}</td>
            <td>${escapeHtml(r.area)}</td>
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

  const salesData = session.role === 'admin' ? await api('sales-list') : { data: [] };
  const salesMap = {};
  (salesData.data || []).forEach(s => { salesMap[s.id] = s.nama; });

  const data = await api('cards-search', params);

  el.innerHTML = `
    <h2>${session.role === 'admin' ? 'Semua Card' : 'Card Saya'}</h2>
    <input type="text" id="searchInput" placeholder="Cari ID / card ID / nama usaha..." class="input-search" style="margin-bottom:16px">
    <div id="cardsTable"></div>
  `;

  document.getElementById('searchInput').addEventListener('input', async (e) => {
    const q = e.target.value.trim();
    const d = await api('cards-search', { ...params, q });
    renderCardsTable(d.data || [], salesMap);
  });

  renderCardsTable(data.data || [], salesMap);
}

function renderCardsTable(rows, salesMap = {}) {
  const el = document.getElementById('cardsTable');
  if (!rows.length) { el.innerHTML = '<div class="empty">Tidak ada data</div>'; return; }
  el.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Card ID</th>
          <th>Status</th>
          <th>Usaha</th>
          <th>Sales</th>
          <th>Harga</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${r.id}</td>
            <td>${r.card_id}</td>
            <td><span class="badge badge-${r.status}">${r.status}</span></td>
            <td>${escapeHtml(r.place_name || '-')}</td>
            <td>${r.sales_id ? escapeHtml(salesMap[r.sales_id] || '?') : '-'}</td>
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

// ===== SELL (Admin jual langsung) =====
async function renderSell(el) {
  el.innerHTML = `
    <h2>Jual Card (Langsung)</h2>
    <p style="color:#666;font-size:14px;margin-bottom:16px">
      Card yang dijual akan berubah status menjadi <strong>sold</strong>.
    </p>

    <div class="form-group">
      <label>Card ID — satuan atau range</label>
      <input type="text" id="cardIds" placeholder="Contoh: B001 atau B001-B010 atau B001, B002">
      <small style="color:#888;font-size:12px;display:block;margin-top:4px">
        Format: <code>B001</code> (satuan), <code>B001-B010</code> (range), <code>B001,B002</code> (multiple)
      </small>
    </div>

    <div class="form-group">
      <label>Harga Jual per Card (Rp)</label>
      <input type="number" id="hargaJual" placeholder="150000" min="0">
    </div>

    <button class="btn btn-primary" id="sellBtn">Jual Card</button>
    <div id="sellResult"></div>
  `;

  document.getElementById('sellBtn').addEventListener('click', async () => {
    const input = document.getElementById('cardIds').value.trim();
    const harga_jual = document.getElementById('hargaJual').value;

    if (!input) { alert('Masukkan Card ID'); return; }
    if (!harga_jual) { alert('Masukkan harga jual'); return; }

    const ids = parseCardIds(input);
    if (!ids.length) { alert('Format Card ID tidak valid'); return; }

    const btn = document.getElementById('sellBtn');
    btn.disabled = true; btn.textContent = 'Memproses...';

    const data = await api('cards-sell', { ids, harga_jual });

    document.getElementById('sellResult').innerHTML = data.success
      ? `<div class="success">✅ ${data.updated} card dijual</div>`
      : `<div class="error">❌ ${data.error}</div>`;

    btn.disabled = false; btn.textContent = 'Jual Card';
  });
}

// ===== ASSIGN SALES =====
async function renderAssignSales(el) {
  const data = await api('sales-list');

  el.innerHTML = `
    <h2>Assign Sales ke Card</h2>
    <p style="color:#666;font-size:14px;margin-bottom:16px">
      Card akan berubah status menjadi <strong>assigned</strong> dan komisi dihitung saat card <strong>activated</strong>.
    </p>

    <div class="form-group">
      <label>Card ID — satuan atau range</label>
      <input type="text" id="cardIds" placeholder="Contoh: B001 atau B001-B010 atau B001, B002">
    </div>

    <div class="form-group">
      <label>Pilih Sales</label>
      <select id="salesSelect" required>
        <option value="">-- Pilih Sales --</option>
        ${(data.data || []).map(s => `
          <option value="${s.id}">
            ${escapeHtml(s.nama)} (${escapeHtml(s.area || '-')}) — Komisi: ${formatRupiah(s.komisi_per_card)}
          </option>
        `).join('')}
      </select>
    </div>

    <div class="form-group">
      <label>Harga Jual per Card (Rp)</label>
      <input type="number" id="hargaJual" placeholder="150000" min="0">
    </div>

    <button class="btn btn-primary" id="assignBtn">Assign Sales</button>
    <div id="assignResult"></div>
  `;

  document.getElementById('assignBtn').addEventListener('click', async () => {
    const input = document.getElementById('cardIds').value.trim();
    const sales_id = document.getElementById('salesSelect').value;
    const harga_jual = document.getElementById('hargaJual').value;

    if (!input) { alert('Masukkan Card ID'); return; }
    if (!sales_id) { alert('Pilih sales'); return; }
    if (!harga_jual) { alert('Masukkan harga jual'); return; }

    const ids = parseCardIds(input);
    if (!ids.length) { alert('Format Card ID tidak valid'); return; }

    const btn = document.getElementById('assignBtn');
    btn.disabled = true; btn.textContent = 'Memproses...';

    const data = await api('cards-assign-sales', { ids, sales_id, harga_jual });

    document.getElementById('assignResult').innerHTML = data.success
      ? `<div class="success">✅ ${data.updated} card di-assign ke sales</div>`
      : `<div class="error">❌ ${data.error}</div>`;

    btn.disabled = false; btn.textContent = 'Assign Sales';
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
    el.innerHTML = '<div class="empty">Belum ada sales.</div>';
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
          <input type="text" id="sf_password" ${isEdit ? '' : 'required'}>
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
      result = await api('sales-manage', { subaction: 'update', id: sales.id, data: formData });
    } else {
      result = await api('sales-manage', { subaction: 'create', data: formData });
    }

    if (result.success) {
      document.getElementById('salesFormMsg').innerHTML = 
        `<div class="success">✅ Sales berhasil ${isEdit ? 'diupdate' : 'ditambahkan'}</div>`;
      setTimeout(() => {
        document.getElementById('salesForm').innerHTML = '';
        renderPage('sales');
      }, 1000);
    } else {
      document.getElementById('salesFormMsg').innerHTML = `<div class="error">❌ ${result.error}</div>`;
      btn.disabled = false;
      btn.textContent = isEdit ? 'Simpan Perubahan' : 'Tambah Sales';
    }
  });
}

window.editSales = function(sales) {
  renderSalesForm(sales);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ===== INITIAL RENDER =====
renderPage('dashboard');
