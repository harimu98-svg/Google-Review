const params = new URLSearchParams(location.search);
const cardId = params.get('id');
if (!cardId) {
  document.body.innerHTML = '<p style="padding:40px;text-align:center">Card ID tidak valid.</p>';
  throw new Error('No cardId');
}
document.getElementById('cardIdDisplay').textContent = cardId;

// ===== Tabs =====
let mode = 'places';
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    mode = tab.dataset.mode;
    document.getElementById('modePlaces').classList.toggle('hidden', mode !== 'places');
    document.getElementById('modeManual').classList.toggle('hidden', mode !== 'manual');
    resetSubmit();
  });
});

// ===== Mode Places =====
const searchInput = document.getElementById('searchInput');
const resultsBox  = document.getElementById('results');
const statusMsg   = document.getElementById('statusMsg');
let selectedPlace = null;
let debounceTimer = null;

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  clearTimeout(debounceTimer);
  if (q.length < 3) {
    resultsBox.classList.add('hidden');
    statusMsg.classList.add('hidden');
    return;
  }
  statusMsg.className = 'empty';
  statusMsg.innerHTML = '<span class="spinner"></span>Mencari...';
  statusMsg.classList.remove('hidden');
  resultsBox.classList.add('hidden');
  debounceTimer = setTimeout(() => doSearch(q), 500);
});

async function doSearch(q) {
  try {
    const res = await fetch(`/api/search-places?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!data.results?.length) {
      statusMsg.textContent = 'Tidak ada hasil. Coba kata kunci lain.';
      return;
    }
    renderResults(data.results);
    statusMsg.classList.add('hidden');
  } catch (err) {
    console.error(err);
    statusMsg.textContent = 'Gagal mencari. Coba lagi.';
  }
}

function renderResults(results) {
  resultsBox.innerHTML = '';
  resultsBox.classList.remove('hidden');
  results.forEach(place => {
    const div = document.createElement('div');
    div.className = 'result-item';
    div.innerHTML = `
      <div class="name">${escapeHtml(place.name)}</div>
      <div class="addr">${escapeHtml(place.address || '')}</div>
      ${place.rating ? `<div class="meta">⭐ ${place.rating} · ${place.totalReviews || 0} review</div>` : ''}
    `;
    div.addEventListener('click', () => {
      document.querySelectorAll('.result-item').forEach(el => el.classList.remove('selected'));
      div.classList.add('selected');
      selectedPlace = place;
      document.getElementById('submitBtn').disabled = false;
      document.getElementById('submitBtn').textContent = `Aktifkan: ${place.name}`;
    });
    resultsBox.appendChild(div);
  });
}

// ===== Mode Manual =====
const manualInput = document.getElementById('manualUrl');
manualInput.addEventListener('input', () => {
  const url = manualInput.value.trim();
  const valid = /^https:\/\/(g\.page\/r\/[\w-]+\/review|search\.google\.com\/local\/writereview\?placeid=[\w-]+)/.test(url);
  document.getElementById('submitBtn').disabled = !valid;
  document.getElementById('submitBtn').textContent = valid ? 'Aktifkan Card' : 'Link belum valid';
});

// ===== Submit =====
document.getElementById('submitBtn').addEventListener('click', async () => {
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  let body;
  if (mode === 'places') {
    if (!selectedPlace) return;
    body = {
      cardId, mode: 'places',
      placeId: selectedPlace.placeId,
      placeName: selectedPlace.name,
      placeAddress: selectedPlace.address,
      reviewUrl: selectedPlace.reviewUrl
    };
  } else {
    body = { cardId, mode: 'manual', manualUrl: manualInput.value.trim() };
  }

  try {
    const res = await fetch('/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Gagal');

    document.getElementById('main').classList.add('hidden');
    document.getElementById('success').classList.remove('hidden');
    document.getElementById('successName').textContent =
      mode === 'places' ? selectedPlace.name : 'Usaha Anda';
  } catch (err) {
    alert('Gagal: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Coba lagi';
  }
});

function resetSubmit() {
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = mode === 'places' ? 'Pilih usaha dulu' : 'Link belum valid';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}
