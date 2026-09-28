// ===== SESSION CHECK =====
const session = JSON.parse(localStorage.getItem('digicard_session') || 'null');

if (!session || !session.success) {
  location.href = '/login';
  throw new Error('Not logged in');
}

document.getElementById('userName').textContent = session.nama;
document.getElementById('userRole').textContent =
  session.role === 'admin' ? 'Admin' :
  session.role === 'sales' ? 'Sales' : 'Reseller';

if (session.role === 'admin') {
  document.getElementById('menuAdmin').style.display = 'flex';
} else if (session.role === 'sales') {
  document.getElementById('menuSales').style.display = 'flex';
} else if (session.role === 'reseller') {
  document.getElementById('menuReseller').style.display = 'flex';
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

// ===== EXPORT CSV =====
function exportToCSV(filename, rows, headers) {
  if (!rows || !rows.length) {
    alert('Tidak ada data untuk di-export');
    return;
  }

  // Header
  const headerLine = headers.map(h => `"${h.label}"`).join(',');

  // Data rows
  const dataLines = rows.map(row => {
    return headers.map(h => {
      let val = row[h.key];
      if (val === null || val === undefined) val = '';
      // Escape double quotes
      val = String(val).replace(/"/g, '""');
      return `"${val}"`;
    }).join(',');
  });

  // Gabung
  const csv = [headerLine, ...dataLines].join('\n');

  // Tambah BOM untuk Excel (biar UTF-8 terbaca)
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });

  // Download
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
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
    case 'assign-reseller': return renderAssignReseller(el);
    case 'disable': return renderDisable(el);
    case 'reset': return renderReset(el);
    case 'sales': return renderSales(el);
    case 'reseller': return renderReseller(el);
    case 'pendaftar': return renderPendaftar(el);
  }
}

// ===== DASHBOARD =====
async function renderDashboard(el) {
  const action = session.role === 'admin' ? 'dashboard-admin'
                : session.role === 'sales' ? 'dashboard-sales'
                : 'dashboard-reseller';

  const data = await api(action, {
    sales_id: session.sales_id,
    reseller_id: session.reseller_id
  });

  if (!data.success) { el.innerHTML = `<div class="error">${data.error}</div>`; return; }

  const s = data.stats;

  if (session.role === 'admin') {
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px">
        <h2 style="margin:0">Dashboard Admin</h2>
        <button class="btn btn-success btn-sm" id="exportDashBtn">📥 Export Laporan</button>
      </div>
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

    document.getElementById('exportDashBtn').addEventListener('click', () => {
      const report = data.salesReport || [];
      exportToCSV(
        `digicard-laporan-${getTodayStr()}.csv`,
        report,
        [
          { key: 'nama', label: 'Nama Sales' },
          { key: 'area', label: 'Area' },
          { key: 'total_card', label: 'Total Card Activated' },
          { key: 'total_penjualan', label: 'Total Penjualan' },
          { key: 'total_komisi', label: 'Total Komisi' },
          { key: 'target', label: 'Target Bulanan' }
        ]
      );
    });
  } else if (session.role === 'sales') {
    el.innerHTML = `
      <h2>Dashboard Saya</h2>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">Total Card</div><div class="stat-value">${s.total_card || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Activated</div><div class="stat-value">${s.total_activated || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Penjualan</div><div class="stat-value">${formatRupiah(s.total_penjualan)}</div></div>
        <div class="stat-card"><div class="stat-label">Komisi</div><div class="stat-value">${formatRupiah(s.total_komisi)}</div></div>
      </div>
    `;
  } else if (session.role === 'reseller') {
    el.innerHTML = `
      <h2>Dashboard Reseller</h2>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">Total Card</div><div class="stat-value">${s.total_card || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Activated</div><div class="stat-value">${s.total_activated || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Penjualan</div><div class="stat-value">${formatRupiah(s.total_penjualan)}</div></div>
      </div>
    `;
  }
}

function renderSalesReport(rows) {
  if (!rows.length) return '<div class="empty">Belum ada penjualan</div>';
  return `
    <h3>Performa Sales</h3>
    <div class="table-wrapper">
      <div class="table-scroll">
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
      </div>
    </div>
  `;
}

// ===== DISABLE CARD =====
async function renderDisable(el) {
  el.innerHTML = `
    <h2>Disable Card</h2>
    <p style="color:#5F6368;font-size:14px;margin-bottom:16px">
      Card yang di-disable <strong>tidak bisa</strong> di-tap/scan untuk review.
      Status akan berubah menjadi <strong>disabled</strong>.
    </p>

    <div class="form-group">
      <label>Card ID — satuan atau range</label>
      <input type="text" id="cardIds" placeholder="Contoh: B001 atau B001-B010 atau B001, B002">
      <small style="color:#888;font-size:12px;display:block;margin-top:4px">
        Format: <code>B001</code> (satuan), <code>B001-B010</code> (range), <code>B001,B002</code> (multiple)
      </small>
    </div>

    <button class="btn btn-danger" id="disableBtn">🚫 Disable Card</button>
    <div id="disableResult"></div>
  `;

  document.getElementById('disableBtn').addEventListener('click', async () => {
    const input = document.getElementById('cardIds').value.trim();
    if (!input) { alert('Masukkan Card ID'); return; }

    const ids = parseCardIds(input);
    if (!ids.length) { alert('Format Card ID tidak valid'); return; }

    if (!confirm(`Disable ${ids.length} card? Card tidak akan bisa di-tap/scan.`)) return;

    const btn = document.getElementById('disableBtn');
    btn.disabled = true; btn.textContent = 'Memproses...';

    const data = await api('cards-disable', { ids });

    document.getElementById('disableResult').innerHTML = data.success
      ? `<div class="success">✅ ${data.updated} card di-disable</div>`
      : `<div class="error">❌ ${data.error}</div>`;

    btn.disabled = false; btn.textContent = '🚫 Disable Card';
  });
}

// ===== RESET CARD =====
async function renderReset(el) {
  el.innerHTML = `
    <h2>Reset Card</h2>
    <p style="color:#5F6368;font-size:14px;margin-bottom:16px">
      Reset card akan mengembalikan status ke <strong>printed</strong> dan 
      <strong>menghapus semua data aktivasi</strong> (URL review, nama usaha, sales, dll).
      Gunakan kalau ada salah aktivasi.
    </p>

    <div class="form-group">
      <label>Card ID — satuan atau range</label>
      <input type="text" id="cardIds" placeholder="Contoh: B001 atau B001-B010">
    </div>

    <button class="btn btn-danger" id="resetBtn">🔄 Reset Card</button>
    <div id="resetResult"></div>
  `;

  document.getElementById('resetBtn').addEventListener('click', async () => {
    const input = document.getElementById('cardIds').value.trim();
    if (!input) { alert('Masukkan Card ID'); return; }

    const ids = parseCardIds(input);
    if (!ids.length) { alert('Format Card ID tidak valid'); return; }

    if (!confirm(`Reset ${ids.length} card? Semua data aktivasi akan dihapus.`)) return;

    const btn = document.getElementById('resetBtn');
    btn.disabled = true; btn.textContent = 'Memproses...';

    const data = await api('cards-reset', { ids });

    document.getElementById('resetResult').innerHTML = data.success
      ? `<div class="success">✅ ${data.updated} card di-reset ke status printed</div>`
      : `<div class="error">❌ ${data.error}</div>`;

    btn.disabled = false; btn.textContent = '🔄 Reset Card';
  });
}

// ===== CARDS =====
async function renderCards(el) {
  let params = {};
  if (session.role === 'sales') params.sales_id = session.sales_id;
  if (session.role === 'reseller') params.reseller_id = session.reseller_id;

  const [salesData, resellerData, data] = await Promise.all([
    session.role === 'admin' ? api('sales-list') : Promise.resolve({ data: [] }),
    session.role === 'admin' ? api('reseller-list', {}, { status: 'approved' }) : Promise.resolve({ data: [] }),
    api('cards-search', params)
  ]);

  const salesMap = {};
  (salesData.data || []).forEach(s => { salesMap[s.id] = s.nama; });

  const resellerMap = {};
  (resellerData.data || []).forEach(r => { resellerMap[r.id] = r.nama; });

  el.innerHTML = `
    <h2>${session.role === 'admin' ? 'Semua Card' : 'Card Saya'}</h2>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <input type="text" id="searchInput" placeholder="Cari ID / card ID / nama usaha..." class="input-search" style="flex:1;min-width:200px">
      <button class="btn btn-success btn-sm" id="exportCardsBtn">📥 Export CSV</button>
    </div>
    <div id="cardsTable"></div>
  `;

  document.getElementById('searchInput').addEventListener('input', async (e) => {
    const q = e.target.value.trim();
    const d = await api('cards-search', { ...params, q });
    renderCardsTable(d.data || [], salesMap, resellerMap);
  });

  document.getElementById('exportCardsBtn').addEventListener('click', () => {
    const exportRows = (data.data || []).map(c => ({
      id: c.id,
      card_id: c.card_id,
      type: c.type || '',
      status: c.status,
      place_name: c.place_name || '',
      sales: c.sales_id ? (salesMap[c.sales_id] || '') : '',
      reseller: c.reseller_id ? (resellerMap[c.reseller_id] || '') : '',
      harga_jual: c.harga_jual || 0,
      komisi: c.komisi || 0,
      sold_at: c.sold_at ? new Date(c.sold_at).toLocaleDateString('id-ID') : ''
    }));

    exportToCSV(
      `digicard-card-${getTodayStr()}.csv`,
      exportRows,
      [
        { key: 'id', label: 'ID' },
        { key: 'card_id', label: 'Card ID' },
        { key: 'type', label: 'Type' },
        { key: 'status', label: 'Status' },
        { key: 'place_name', label: 'Nama Usaha' },
        { key: 'sales', label: 'Sales' },
        { key: 'reseller', label: 'Reseller' },
        { key: 'harga_jual', label: 'Harga Jual' },
        { key: 'komisi', label: 'Komisi' },
        { key: 'sold_at', label: 'Tanggal Jual' }
      ]
    );
  });

  renderCardsTable(data.data || [], salesMap, resellerMap);
}

// ===== STATE PAGINASI =====
let currentPage = 1;
const PER_PAGE = 20;
let allCardsData = [];
let salesMapGlobal = {};
let resellerMapGlobal = {};

function renderCardsTable(rows, salesMap = {}, resellerMap = {}, page = 1) {
  allCardsData = rows;
  salesMapGlobal = salesMap;
  resellerMapGlobal = resellerMap;
  currentPage = page;

  const el = document.getElementById('cardsTable');
  if (!rows.length) {
    el.innerHTML = '<div class="empty">Tidak ada data</div>';
    return;
  }

  const totalPages = Math.ceil(rows.length / PER_PAGE);
  const start = (page - 1) * PER_PAGE;
  const end = start + PER_PAGE;
  const pageRows = rows.slice(start, end);

  el.innerHTML = `
    <div class="table-wrapper">
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Card ID</th>
              <th>Type</th>
              <th>Status</th>
              <th>Usaha</th>
              <th>Sales</th>
              <th>Reseller</th>
              <th>Harga</th>
            </tr>
          </thead>
          <tbody>
            ${pageRows.map(r => `
              <tr>
                <td>${r.id}</td>
                <td>${r.card_id}</td>
                <td>${escapeHtml(r.type || '-')}</td>
                <td><span class="badge badge-${r.status}">${r.status}</span></td>
                <td>${escapeHtml(r.place_name || '-')}</td>
                <td>${r.sales_id ? escapeHtml(salesMap[r.sales_id] || '?') : '-'}</td>
                <td>${r.reseller_id ? escapeHtml(resellerMap[r.reseller_id] || '?') : '-'}</td>
                <td>${r.harga_jual ? formatRupiah(r.harga_jual) : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${renderPagination(rows.length, page, totalPages)}
    </div>
  `;
}

function renderPagination(total, currentPage, totalPages) {
  if (totalPages <= 1) return '';

  const start = (currentPage - 1) * PER_PAGE + 1;
  const end = Math.min(currentPage * PER_PAGE, total);

  let buttons = '';

  buttons += `<button onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`;

  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

  if (startPage > 1) {
    buttons += `<button onclick="goToPage(1)">1</button>`;
    if (startPage > 2) buttons += `<span class="pagination-ellipsis">...</span>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    buttons += `<button onclick="goToPage(${i})" class="${i === currentPage ? 'active' : ''}">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) buttons += `<span class="pagination-ellipsis">...</span>`;
    buttons += `<button onclick="goToPage(${totalPages})">${totalPages}</button>`;
  }

  buttons += `<button onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>›</button>`;

  return `
    <div class="pagination">
      <div class="pagination-info">Menampilkan ${start}-${end} dari ${total} card</div>
      ${buttons}
    </div>
  `;
}

window.goToPage = function(page) {
  if (page < 1) return;
  const totalPages = Math.ceil(allCardsData.length / PER_PAGE);
  if (page > totalPages) return;
  renderCardsTable(allCardsData, salesMapGlobal, resellerMapGlobal, page);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ===== CREATE CARD =====
async function renderCreate(el) {
  const produkData = await api('produk-list');
  const produkList = produkData.data || [];

  el.innerHTML = `
    <h2>Buat Card</h2>
    <div class="form-group">
      <label>Type Produk *</label>
      <select id="cardType" required>
        <option value="">-- Pilih Type --</option>
        ${produkList.map(p => `<option value="${p.id}">${escapeHtml(p.nama)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Jumlah Card</label>
      <input type="number" id="jumlah" value="100" min="1" max="1000">
    </div>
    <button class="btn btn-primary" id="createBtn">Buat Card</button>
    <div id="createResult"></div>
  `;

  document.getElementById('createBtn').addEventListener('click', async () => {
    const type = document.getElementById('cardType').value;
    const jumlah = parseInt(document.getElementById('jumlah').value);

    if (!type) { alert('Pilih type produk'); return; }

    const btn = document.getElementById('createBtn');
    btn.disabled = true; btn.textContent = 'Memproses...';

    const data = await api('cards-create', { jumlah, type });
    document.getElementById('createResult').innerHTML = data.success
      ? `<div class="success">✅ ${data.jumlah} card dibuat (ID ${data.dari} - ${data.sampai})</div>`
      : `<div class="error">❌ ${data.error}</div>`;

    btn.disabled = false; btn.textContent = 'Buat Card';
  });
}

// ===== SELL =====
async function renderSell(el) {
  el.innerHTML = `
    <h2>Jual Card (Langsung)</h2>
    <p style="color:#5F6368;font-size:14px;margin-bottom:16px">
      Card akan berubah status menjadi <strong>sold</strong>.
    </p>
    <div class="form-group">
      <label>Card ID — satuan atau range</label>
      <input type="text" id="cardIds" placeholder="Contoh: B001 atau B001-B010">
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
    <div class="form-group">
      <label>Card ID — satuan atau range</label>
      <input type="text" id="cardIds" placeholder="Contoh: B001 atau B001-B010">
    </div>
    <div class="form-group">
      <label>Pilih Sales</label>
      <select id="salesSelect">
        <option value="">-- Pilih Sales --</option>
        ${(data.data || []).map(s => `
          <option value="${s.id}">${escapeHtml(s.nama)} (${escapeHtml(s.area || '-')})</option>
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

    if (!input || !sales_id) { alert('Lengkapi data'); return; }
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

// ===== ASSIGN RESELLER =====
async function renderAssignReseller(el) {
  const data = await api('reseller-list', {}, { status: 'approved' });

  el.innerHTML = `
    <h2>Assign Reseller ke Card</h2>
    <div class="form-group">
      <label>Card ID — satuan atau range</label>
      <input type="text" id="cardIds" placeholder="Contoh: B001 atau B001-B010">
    </div>
    <div class="form-group">
      <label>Pilih Reseller</label>
      <select id="resellerSelect">
        <option value="">-- Pilih Reseller --</option>
        ${(data.data || []).map(r => `
          <option value="${r.id}">${escapeHtml(r.nama)} (${escapeHtml(r.area || '-')})</option>
        `).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Harga Jual per Card (Rp)</label>
      <input type="number" id="hargaJual" placeholder="150000" min="0">
    </div>
    <button class="btn btn-primary" id="assignBtn">Assign Reseller</button>
    <div id="assignResult"></div>
  `;

  document.getElementById('assignBtn').addEventListener('click', async () => {
    const input = document.getElementById('cardIds').value.trim();
    const reseller_id = document.getElementById('resellerSelect').value;
    const harga_jual = document.getElementById('hargaJual').value;

    if (!input || !reseller_id) { alert('Lengkapi data'); return; }
    const ids = parseCardIds(input);
    if (!ids.length) { alert('Format Card ID tidak valid'); return; }

    const btn = document.getElementById('assignBtn');
    btn.disabled = true; btn.textContent = 'Memproses...';

    const data = await api('cards-assign-reseller', { ids, reseller_id, harga_jual });
    document.getElementById('assignResult').innerHTML = data.success
      ? `<div class="success">✅ ${data.updated} card di-assign ke reseller</div>`
      : `<div class="error">❌ ${data.error}</div>`;

    btn.disabled = false; btn.textContent = 'Assign Reseller';
  });
}

// ===== SALES =====
async function renderSales(el) {
  const data = await api('sales-list');
  const list = data.data || [];

  el.innerHTML = `
    <h2>Sales</h2>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn btn-primary" id="addSalesBtn">+ Tambah Sales</button>
      <button class="btn btn-success" id="exportSalesBtn">📥 Export CSV</button>
    </div>
    <div id="salesForm"></div>
    <div id="salesTable"></div>
  `;

  document.getElementById('addSalesBtn').addEventListener('click', () => renderSalesForm(null));

  document.getElementById('exportSalesBtn').addEventListener('click', () => {
    exportToCSV(
      `digicard-sales-${getTodayStr()}.csv`,
      list,
      [
        { key: 'nama', label: 'Nama' },
        { key: 'username', label: 'Username' },
        { key: 'email', label: 'Email' },
        { key: 'no_hp', label: 'No HP' },
        { key: 'area', label: 'Area' },
        { key: 'komisi_per_card', label: 'Komisi/Card' },
        { key: 'target_bulanan', label: 'Target Bulanan' },
        { key: 'aktif', label: 'Aktif' }
      ]
    );
  });

  renderSalesTable(list);
}

function renderSalesTable(rows) {
  const el = document.getElementById('salesTable');
  if (!rows.length) { el.innerHTML = '<div class="empty">Belum ada sales.</div>'; return; }

  el.innerHTML = `
    <div class="table-wrapper">
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr><th>Nama</th><th>Username</th><th>Area</th><th>No HP</th><th>Komisi/Card</th><th>Target</th><th>Status</th><th>Aksi</th></tr>
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
                <td>${s.aktif ? '✅' : '❌'}</td>
                <td><button class="btn btn-outline btn-sm" onclick='editSales(${JSON.stringify(s).replace(/'/g, "&apos;")})'>Edit</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderSalesForm(sales) {
  const isEdit = !!sales;
  const el = document.getElementById('salesForm');

  el.innerHTML = `
    <div class="form-card">
      <h3>${isEdit ? 'Edit Sales' : 'Tambah Sales'}</h3>
      <form id="salesFormEl">
        <div class="form-group"><label>Nama *</label><input type="text" id="sf_nama" required value="${escapeHtml(sales?.nama || '')}"></div>
        <div class="form-group"><label>Username *</label><input type="text" id="sf_username" required value="${escapeHtml(sales?.username || '')}" ${isEdit ? 'readonly' : ''}></div>
        <div class="form-group"><label>Password ${isEdit ? '(kosongkan jika tidak diubah)' : '*'}</label><input type="text" id="sf_password" ${isEdit ? '' : 'required'}></div>
        <div class="form-group"><label>No HP</label><input type="text" id="sf_no_hp" value="${escapeHtml(sales?.no_hp || '')}"></div>
        <div class="form-group"><label>Area</label><input type="text" id="sf_area" value="${escapeHtml(sales?.area || '')}"></div>
        <div class="form-group"><label>Komisi/Card</label><input type="number" id="sf_komisi" value="${sales?.komisi_per_card || 0}"></div>
        <div class="form-group"><label>Target Bulanan</label><input type="number" id="sf_target" value="${sales?.target_bulanan || 0}"></div>
        <div class="form-group"><label>Status</label>
          <select id="sf_aktif">
            <option value="true" ${sales?.aktif !== false ? 'selected' : ''}>Aktif</option>
            <option value="false" ${sales?.aktif === false ? 'selected' : ''}>Nonaktif</option>
          </select>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${isEdit ? 'Simpan' : 'Tambah'}</button>
          <button type="button" class="btn btn-outline" id="cancelSalesBtn">Batal</button>
        </div>
      </form>
      <div id="salesFormMsg"></div>
    </div>
  `;

  document.getElementById('cancelSalesBtn').addEventListener('click', () => { el.innerHTML = ''; });

  document.getElementById('salesFormEl').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Menyimpan...';

    const formData = {
      nama: document.getElementById('sf_nama').value.trim(),
      username: document.getElementById('sf_username').value.trim(),
      no_hp: document.getElementById('sf_no_hp').value.trim(),
      area: document.getElementById('sf_area').value.trim(),
      komisi_per_card: parseInt(document.getElementById('sf_komisi').value) || 0,
      target_bulanan: parseInt(document.getElementById('sf_target').value) || 0,
      aktif: document.getElementById('sf_aktif').value === 'true'
    };
    const password = document.getElementById('sf_password').value;
    if (password) formData.password = password;

    const result = isEdit
      ? await api('sales-manage', { subaction: 'update', id: sales.id, data: formData })
      : await api('sales-manage', { subaction: 'create', data: formData });

    if (result.success) {
      document.getElementById('salesFormMsg').innerHTML = `<div class="success">✅ Berhasil</div>`;
      setTimeout(() => { el.innerHTML = ''; renderPage('sales'); }, 800);
    } else {
      document.getElementById('salesFormMsg').innerHTML = `<div class="error">❌ ${result.error}</div>`;
      btn.disabled = false; btn.textContent = isEdit ? 'Simpan' : 'Tambah';
    }
  });
}

window.editSales = function(s) { renderSalesForm(s); window.scrollTo({ top: 0, behavior: 'smooth' }); };

// ===== RESELLER =====
async function renderReseller(el) {
  const data = await api('reseller-list', {}, { status: 'approved' });
  const list = data.data || [];

  el.innerHTML = `
    <h2>Reseller Aktif</h2>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn btn-primary" id="addResellerBtn">+ Tambah Reseller</button>
      <button class="btn btn-success" id="exportResellerBtn">📥 Export CSV</button>
    </div>
    <div id="resellerForm"></div>
    <div id="resellerTable"></div>
  `;

  document.getElementById('addResellerBtn').addEventListener('click', () => renderResellerForm(null));

  document.getElementById('exportResellerBtn').addEventListener('click', () => {
    exportToCSV(
      `digicard-reseller-${getTodayStr()}.csv`,
      list,
      [
        { key: 'nama', label: 'Nama' },
        { key: 'username', label: 'Username' },
        { key: 'email', label: 'Email' },
        { key: 'no_hp', label: 'No HP' },
        { key: 'area', label: 'Area' },
        { key: 'alamat', label: 'Alamat' },
        { key: 'harga_khusus', label: 'Harga Khusus' },
        { key: 'aktif', label: 'Aktif' }
      ]
    );
  });

  renderResellerTable(list);
}

function renderResellerTable(rows) {
  const el = document.getElementById('resellerTable');
  if (!rows.length) { el.innerHTML = '<div class="empty">Belum ada reseller.</div>'; return; }

  el.innerHTML = `
    <div class="table-wrapper">
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr><th>Nama</th><th>Username</th><th>Area</th><th>No HP</th><th>Harga Khusus</th><th>Status</th><th>Aksi</th></tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${escapeHtml(r.nama)}</td>
                <td>${escapeHtml(r.username)}</td>
                <td>${escapeHtml(r.area || '-')}</td>
                <td>${escapeHtml(r.no_hp || '-')}</td>
                <td>${formatRupiah(r.harga_khusus)}</td>
                <td>${r.aktif ? '✅' : '❌'}</td>
                <td><button class="btn btn-outline btn-sm" onclick='editReseller(${JSON.stringify(r).replace(/'/g, "&apos;")})'>Edit</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderResellerForm(reseller) {
  const isEdit = !!reseller;
  const el = document.getElementById('resellerForm');

  el.innerHTML = `
    <div class="form-card">
      <h3>${isEdit ? 'Edit Reseller' : 'Tambah Reseller'}</h3>
      <form id="resellerFormEl">
        <div class="form-group"><label>Nama *</label><input type="text" id="rf_nama" required value="${escapeHtml(reseller?.nama || '')}"></div>
        <div class="form-group"><label>Username *</label><input type="text" id="rf_username" required value="${escapeHtml(reseller?.username || '')}" ${isEdit ? 'readonly' : ''}></div>
        <div class="form-group"><label>Password ${isEdit ? '(kosongkan jika tidak diubah)' : '*'}</label><input type="text" id="rf_password" ${isEdit ? '' : 'required'}></div>
        <div class="form-group"><label>No HP</label><input type="text" id="rf_no_hp" value="${escapeHtml(reseller?.no_hp || '')}"></div>
        <div class="form-group"><label>Email</label><input type="email" id="rf_email" value="${escapeHtml(reseller?.email || '')}"></div>
        <div class="form-group"><label>Area</label><input type="text" id="rf_area" value="${escapeHtml(reseller?.area || '')}"></div>
        <div class="form-group"><label>Alamat</label><textarea id="rf_alamat" rows="2">${escapeHtml(reseller?.alamat || '')}</textarea></div>
        <div class="form-group"><label>Harga Khusus (Rp)</label><input type="number" id="rf_harga" value="${reseller?.harga_khusus || 0}"></div>
        <div class="form-group"><label>Status</label>
          <select id="rf_aktif">
            <option value="true" ${reseller?.aktif !== false ? 'selected' : ''}>Aktif</option>
            <option value="false" ${reseller?.aktif === false ? 'selected' : ''}>Nonaktif</option>
          </select>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${isEdit ? 'Simpan' : 'Tambah'}</button>
          <button type="button" class="btn btn-outline" id="cancelResellerBtn">Batal</button>
        </div>
      </form>
      <div id="resellerFormMsg"></div>
    </div>
  `;

  document.getElementById('cancelResellerBtn').addEventListener('click', () => { el.innerHTML = ''; });

  document.getElementById('resellerFormEl').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Menyimpan...';

    const formData = {
      nama: document.getElementById('rf_nama').value.trim(),
      username: document.getElementById('rf_username').value.trim(),
      no_hp: document.getElementById('rf_no_hp').value.trim(),
      email: document.getElementById('rf_email').value.trim(),
      area: document.getElementById('rf_area').value.trim(),
      alamat: document.getElementById('rf_alamat').value.trim(),
      harga_khusus: parseInt(document.getElementById('rf_harga').value) || 0,
      aktif: document.getElementById('rf_aktif').value === 'true'
    };
    const password = document.getElementById('rf_password').value;
    if (password) formData.password = password;

    const result = isEdit
      ? await api('reseller-manage', { subaction: 'update', id: reseller.id, data: formData })
      : await api('reseller-manage', { subaction: 'create', data: formData });

    if (result.success) {
      document.getElementById('resellerFormMsg').innerHTML = `<div class="success">✅ Berhasil</div>`;
      setTimeout(() => { el.innerHTML = ''; renderPage('reseller'); }, 800);
    } else {
      document.getElementById('resellerFormMsg').innerHTML = `<div class="error">❌ ${result.error}</div>`;
      btn.disabled = false; btn.textContent = isEdit ? 'Simpan' : 'Tambah';
    }
  });
}

window.editReseller = function(r) { renderResellerForm(r); window.scrollTo({ top: 0, behavior: 'smooth' }); };

// ===== PENDAFTAR RESELLER (approval) =====
async function renderPendaftar(el) {
  const data = await api('reseller-list', {}, { status: 'pending' });
  const list = data.data || [];

  el.innerHTML = `
    <h2>Pendaftar Reseller (Pending)</h2>
    <div style="margin-bottom:16px">
      <button class="btn btn-success" id="exportPendaftarBtn">📥 Export CSV</button>
    </div>
    <div id="approveResult"></div>
    <div class="table-wrapper">
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr><th>Nama</th><th>No HP</th><th>Email</th><th>Area</th><th>Alamat</th><th>Tanggal</th><th>Aksi</th></tr>
          </thead>
          <tbody>
            ${list.length ? list.map(p => `
              <tr>
                <td>${escapeHtml(p.nama)}</td>
                <td>${escapeHtml(p.no_hp)}</td>
                <td>${escapeHtml(p.email || '-')}</td>
                <td>${escapeHtml(p.area || '-')}</td>
                <td>${escapeHtml(p.alamat || '-')}</td>
                <td>${new Date(p.created_at).toLocaleDateString('id-ID')}</td>
                <td>
                  <button class="btn btn-success btn-sm" onclick='approvePendaftar("${p.id}")'>✓ Setujui</button>
                  <button class="btn btn-danger btn-sm" onclick='rejectPendaftar("${p.id}")'>✗ Tolak</button>
                </td>
              </tr>
            `).join('') : '<tr><td colspan="7" class="empty">Belum ada pendaftar</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('exportPendaftarBtn').addEventListener('click', () => {
    const exportRows = list.map(p => ({
      nama: p.nama,
      no_hp: p.no_hp,
      email: p.email || '',
      area: p.area || '',
      alamat: p.alamat || '',
      status: p.status || 'pending',
      created_at: p.created_at ? new Date(p.created_at).toLocaleDateString('id-ID') : ''
    }));

    exportToCSV(
      `digicard-pendaftar-${getTodayStr()}.csv`,
      exportRows,
      [
        { key: 'nama', label: 'Nama' },
        { key: 'no_hp', label: 'No HP' },
        { key: 'email', label: 'Email' },
        { key: 'area', label: 'Area' },
        { key: 'alamat', label: 'Alamat' },
        { key: 'status', label: 'Status' },
        { key: 'created_at', label: 'Tanggal Daftar' }
      ]
    );
  });
}

window.approvePendaftar = async function(id) {
  if (!confirm('Setujui pendaftar ini?')) return;
  const data = await api('reseller-approve', { reseller_id: id });
  if (data.success) {
    document.getElementById('approveResult').innerHTML = `
      <div class="success">
        ✅ Reseller disetujui!<br>
        <strong>Username:</strong> <code>${data.username}</code><br>
        <strong>Password:</strong> <code>${data.password}</code><br>
        <small>Kirim ke reseller via WhatsApp.</small>
      </div>
    `;
    setTimeout(() => renderPage('pendaftar'), 5000);
  } else {
    alert('Gagal: ' + data.error);
  }
};

window.rejectPendaftar = async function(id) {
  const catatan = prompt('Alasan penolakan (opsional):') || '';
  const data = await api('reseller-reject', { reseller_id: id, catatan });
  if (data.success) renderPage('pendaftar');
  else alert('Gagal: ' + data.error);
};

// ===== INITIAL RENDER =====
renderPage('dashboard');
