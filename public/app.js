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
        <input type="date"
