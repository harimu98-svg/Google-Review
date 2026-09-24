import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    const params = event.queryStringParameters || {};
    const body = event.body ? JSON.parse(event.body) : {};
    const action = body.action || params.action || 'activate-card';

    switch (action) {
      case 'activate-card':
        return json(200, await activateCard(body), headers);

      case 'login':
        return json(200, await login(body), headers);

      case 'cards-create':
        return json(200, await cardsCreate(body), headers);

      case 'cards-sell':
        return json(200, await cardsSell(body), headers);

      case 'cards-assign-sales':
        return json(200, await cardsAssignSales(body), headers);

      case 'cards-search':
        return json(200, await cardsSearch({ ...params, ...body }), headers);

      case 'dashboard-admin':
        return json(200, await dashboardAdmin(params), headers);

      case 'dashboard-sales':
        return json(200, await dashboardSales({ ...params, ...body }), headers);

      case 'sales-list':
        return json(200, await salesList(), headers);

      case 'sales-manage':
        return json(200, await salesManage(body), headers);

      default:
        return json(400, { error: 'Action tidak dikenali: ' + action }, headers);
    }
  } catch (err) {
    console.error('API error:', err);
    return json(500, { error: err.message }, headers);
  }
}

// ============================================
// AKTIVASI CARD (user)
// Komisi di-set di sini (dari sales.komisi_per_card)
// ============================================
async function activateCard(body) {
  const { cardId, mode, placeId, placeName, placeAddress, reviewUrl, manualUrl } = body;
  if (!cardId) return { error: 'Card ID tidak ada' };

  let finalUrl, source, placeData = {};

  if (mode === 'places') {
    if (reviewUrl) finalUrl = reviewUrl;
    else if (placeId) finalUrl = `https://search.google.com/local/writereview?placeid=${placeId}`;
    else return { error: 'Data places tidak lengkap' };
    source = 'places_api';
    placeData = { place_id: placeId, place_name: placeName, place_address: placeAddress };
  } else if (mode === 'manual') {
    const validated = validateReviewUrl(manualUrl);
    if (!validated) return { error: 'Link tidak valid' };
    finalUrl = validated;
    source = 'manual_paste';
  } else {
    return { error: 'Mode tidak dikenali' };
  }

  // Ambil data card untuk tahu sales_id
  const { data: card } = await supabase
    .from('cards')
    .select('sales_id')
    .eq('id', cardId)
    .single();

  // Hitung komisi dari sales (kalau card di-assign ke sales)
  let komisi = 0;
  if (card?.sales_id) {
    const { data: sales } = await supabase
      .from('sales')
      .select('komisi_per_card')
      .eq('id', card.sales_id)
      .single();
    komisi = sales?.komisi_per_card || 0;
  }

  const { error } = await supabase
    .from('cards')
    .update({
      google_url: finalUrl,
      source,
      status: 'activated',
      activated_at: new Date().toISOString(),
      komisi: komisi,
      ...placeData
    })
    .eq('id', cardId)
    .in('status', ['sold', 'assigned', 'printed', 'activated']);

  if (error) return { error: 'Gagal menyimpan' };
  return { success: true, googleUrl: finalUrl };
}

function validateReviewUrl(input) {
  if (!input) return null;
  const url = input.trim();
  if (/^https:\/\/g\.page\/r\/[\w-]+\/review/.test(url)) return url;
  if (/^https:\/\/search\.google\.com\/local\/writereview\?placeid=[\w-]+/.test(url)) return url;
  return null;
}

// ============================================
// LOGIN
// ============================================
async function login(body) {
  const { type, username, password } = body;

  if (type === 'admin') {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: username,
      password
    });

    if (error) return { success: false, error: 'Email atau password salah' };

    return {
      success: true,
      role: 'admin',
      nama: data.user.email,
      access_token: data.session.access_token
    };
  }

  if (type === 'sales') {
    const { data, error } = await supabase
      .from('sales')
      .select('id, nama, username, password_hash, area, aktif')
      .eq('username', username)
      .eq('aktif', true)
      .single();

    if (error || !data) return { success: false, error: 'Username tidak ditemukan' };

    const isValid = await bcrypt.compare(password, data.password_hash);
    if (!isValid) return { success: false, error: 'Password salah' };

    return {
      success: true,
      role: 'sales',
      sales_id: data.id,
      nama: data.nama,
      area: data.area
    };
  }

  return { success: false, error: 'Tipe login tidak valid' };
}

// ============================================
// CARDS — CREATE DRAFT (BATCH)
// ============================================
async function cardsCreate(body) {
  const { jumlah, mulai_dari } = body;
  if (!jumlah || jumlah < 1) return { error: 'Jumlah tidak valid' };

  const { data: last } = await supabase
    .from('cards')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .single();

  const lastId = last ? parseInt(last.id) : 0;
  const startId = mulai_dari || lastId + 1;

  const rows = [];
  for (let i = 0; i < jumlah; i++) {
    const num = startId + i;
    const id = String(num).padStart(3, '0');
    const batch = String.fromCharCode(64 + Math.ceil(num / 999));
    const nomor = ((num - 1) % 999) + 1;
    const kode = batch + String(nomor).padStart(3, '0');

    rows.push({
      id,
      card_id: `NFC-QR-2026-${kode}`,
      status: 'draft',
      nfc_url: `https://greviewcard.netlify.app/n/${kode}`,
      qr_url: `https://greviewcard.netlify.app/q/${kode}`,
      batch_id: `BATCH-${new Date().toISOString().slice(0, 7)}`
    });
  }

  const { error } = await supabase.from('cards').insert(rows);
  if (error) return { error: error.message };

  return {
    success: true,
    jumlah: rows.length,
    dari: rows[0].id,
    sampai: rows[rows.length - 1].id
  };
}

// ============================================
// CARDS — SELL (admin jual langsung)
// Harga jual di-set di sini. Komisi BELUM di-set.
// ============================================
async function cardsSell(body) {
  const { ids, harga_jual } = body;
  if (!ids || !ids.length) return { error: 'Pilih card' };

  const numericIds = ids.map(code => codeToNumericId(code));

  const update = {
    status: 'sold',
    sold_at: new Date().toISOString(),
    harga_jual: parseInt(harga_jual) || 0
    // sales_id tetap null
    // komisi TIDAK di-set (nanti saat activated)
  };

  const { error, count } = await supabase
    .from('cards')
    .update(update)
    .in('id', numericIds)
    .in('status', ['draft', 'printed']);

  if (error) return { error: error.message };
  return { success: true, updated: count || numericIds.length };
}

// ============================================
// CARDS — ASSIGN SALES
// Harga jual di-set di sini. Komisi BELUM di-set.
// ============================================
async function cardsAssignSales(body) {
  const { ids, sales_id, harga_jual } = body;
  if (!ids || !ids.length) return { error: 'Pilih card' };
  if (!sales_id) return { error: 'Pilih sales' };

  const numericIds = ids.map(code => codeToNumericId(code));

  const update = {
    sales_id: sales_id,
    status: 'assigned',
    sold_at: new Date().toISOString(),
    harga_jual: parseInt(harga_jual) || 0
    // komisi TIDAK di-set di sini
  };

  const { error, count } = await supabase
    .from('cards')
    .update(update)
    .in('id', numericIds)
    .in('status', ['draft', 'printed', 'assigned']);

  if (error) return { error: error.message };
  return { success: true, updated: count || numericIds.length };
}

function codeToNumericId(code) {
  const s = String(code);
  const m = s.match(/^([A-Z])(\d{3})$/);
  if (!m) return s;
  const batch = m[1].charCodeAt(0) - 64;
  const num = parseInt(m[2], 10);
  const id = (batch - 1) * 999 + num;
  return id < 1000 ? String(id).padStart(3, '0') : String(id);
}

// ============================================
// CARDS — SEARCH
// ============================================
async function cardsSearch(opts) {
  const { q, status, sales_id, dari, sampai, limit = 100, offset = 0 } = opts;

  let query = supabase
    .from('cards')
    .select('id, card_id, status, active, place_name, sales_id, sold_at, harga_jual, komisi', { count: 'exact' });

  if (q) query = query.or(`id.ilike.%${q}%,card_id.ilike.%${q}%,place_name.ilike.%${q}%`);
  if (status) query = query.eq('status', status);
  if (sales_id) query = query.eq('sales_id', sales_id);
  if (dari) query = query.gte('sold_at', dari);
  if (sampai) query = query.lte('sold_at', sampai);

  query = query.order('id', { ascending: true }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) return { error: error.message };
  return { success: true, data, total: count };
}

// ============================================
// DASHBOARD — ADMIN
// Komisi & penjualan dihitung dari status 'activated'
// ============================================
async function dashboardAdmin(params) {
  const { dari, sampai } = params;

  // Stats per status
  const { data: statusCount } = await supabase.from('cards').select('status');
  const stats = { total: 0, draft: 0, printed: 0, sold: 0, assigned: 0, activated: 0, disabled: 0 };
  (statusCount || []).forEach(c => {
    stats.total++;
    stats[c.status] = (stats[c.status] || 0) + 1;
  });

  // Komisi & penjualan: HANYA dari status 'activated'
  let komisiQuery = supabase
    .from('cards')
    .select('sales_id, harga_jual, komisi, activated_at')
    .eq('status', 'activated');
  if (dari) komisiQuery = komisiQuery.gte('activated_at', dari);
  if (sampai) komisiQuery = komisiQuery.lte('activated_at', sampai);

  const { data: komisiData } = await komisiQuery;

  const perSales = {};
  let totalPenjualan = 0;
  let totalKomisi = 0;

  (komisiData || []).forEach(c => {
    totalPenjualan += c.harga_jual || 0;
    totalKomisi += c.komisi || 0;

    if (!c.sales_id) return;
    if (!perSales[c.sales_id]) {
      perSales[c.sales_id] = { total_card: 0, total_penjualan: 0, total_komisi: 0 };
    }
    perSales[c.sales_id].total_card++;
    perSales[c.sales_id].total_penjualan += c.harga_jual || 0;
    perSales[c.sales_id].total_komisi += c.komisi || 0;
  });

  stats.total_penjualan = totalPenjualan;
  stats.total_komisi = totalKomisi;

  // Ambil nama sales
  const salesIds = Object.keys(perSales);
  let salesNames = {};
  if (salesIds.length) {
    const { data: sl } = await supabase
      .from('sales')
      .select('id, nama, area, target_bulanan')
      .in('id', salesIds);
    (sl || []).forEach(s => { salesNames[s.id] = s; });
  }

  const salesReport = salesIds.map(id => ({
    sales_id: id,
    nama: salesNames[id]?.nama || '-',
    area: salesNames[id]?.area || '-',
    target: salesNames[id]?.target_bulanan || 0,
    ...perSales[id]
  }));

  return { success: true, stats, salesReport };
}

// ============================================
// DASHBOARD — SALES
// Komisi dihitung dari status 'activated'
// ============================================
async function dashboardSales(opts) {
  const { dari, sampai, sales_id } = opts;
  if (!sales_id) return { error: 'sales_id diperlukan' };

  let query = supabase
    .from('cards')
    .select('id, card_id, status, place_name, sold_at, activated_at, harga_jual, komisi')
    .eq('sales_id', sales_id);
  if (dari) query = query.gte('activated_at', dari);
  if (sampai) query = query.lte('activated_at', sampai);

  const { data, error } = await query;
  if (error) return { error: error.message };

  const activated = data.filter(c => c.status === 'activated');
  const total_card = data.length;
  const total_activated = activated.length;
  const total_penjualan = activated.reduce((s, c) => s + (c.harga_jual || 0), 0);
  const total_komisi = activated.reduce((s, c) => s + (c.komisi || 0), 0);

  return {
    success: true,
    stats: { total_card, total_activated, total_penjualan, total_komisi },
    data
  };
}

// ============================================
// SALES — LIST & MANAGE
// ============================================
async function salesList() {
  const { data, error } = await supabase
    .from('sales')
    .select('id, nama, username, email, no_hp, area, target_bulanan, komisi_per_card, aktif, created_at')
    .order('nama');
  if (error) return { error: error.message };
  return { success: true, data };
}

async function salesManage(body) {
  const { subaction, id, data } = body;

  if (subaction === 'create') {
    if (data.password) {
      data.password_hash = await bcrypt.hash(data.password, 10);
      delete data.password;
    }
    const { error } = await supabase.from('sales').insert([data]);
    if (error) return { error: error.message };
    return { success: true };
  }

  if (subaction === 'update') {
    if (data.password) {
      data.password_hash = await bcrypt.hash(data.password, 10);
      delete data.password;
    }
    const { error } = await supabase.from('sales').update(data).eq('id', id);
    if (error) return { error: error.message };
    return { success: true };
  }

  if (subaction === 'delete') {
    const { error } = await supabase.from('sales').delete().eq('id', id);
    if (error) return { error: error.message };
    return { success: true };
  }

  return { error: 'Action tidak valid' };
}

// ============================================
// HELPER
// ============================================
function json(status, body, headers = {}) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  };
}
