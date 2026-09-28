import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  const params = event.queryStringParameters || {};
  const code = params.id || event.path.split('/').pop();
  const type = params.type || 'unknown';

  if (!code) {
    return html(400, '<h1>Kode card tidak ada</h1>');
  }

  const numericId = codeToNumericId(code);

  if (!numericId) {
    return html(400, `
      <h1>Kode card tidak valid</h1>
      <p>Kode: <code>${escapeHtml(code)}</code></p>
      <p>Format yang benar: <code>A001</code>, <code>A999</code>, <code>B001</code>, dst.</p>
    `);
  }

  // ← PERBAIKAN: tambah 'status' di select
  const { data, error } = await supabase
    .from('cards')
    .select('google_url, active, status')
    .eq('id', numericId)
    .single();

  if (error || !data) {
    return html(404, `
      <h1>Card tidak ditemukan</h1>
      <p>Kode: <code>${escapeHtml(code)}</code></p>
      <p>ID: <code>${numericId}</code></p>
    `);
  }

  // Increment counter (non-blocking)
  if (type === 'nfc' || type === 'qr') {
    supabase
      .rpc('increment_tap', { card_id: numericId, tap_type: type })
      .then(() => {})
      .catch(err => console.error('Counter error:', err));
  }

  // Card disabled → tampilkan error
  if (data.status === 'disabled') {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Card Dinonaktifkan</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      text-align: center;
      padding: 60px 20px;
      background: #F8F9FA;
      color: #202124;
    }
    h1 { font-size: 28px; color: #EA4335; margin-bottom: 16px; }
    p { color: #5F6368; line-height: 1.6; max-width: 400px; margin: 0 auto; }
    .icon { font-size: 64px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="icon">🚫</div>
  <h1>Card Dinonaktifkan</h1>
  <p>Card ini sudah tidak aktif. Hubungi admin untuk informasi lebih lanjut.</p>
</body>
</html>`
    };
  }

  // Sudah aktif → redirect ke Google Review
  if (data.active && data.google_url) {
    return {
      statusCode: 302,
      headers: { Location: data.google_url }
    };
  }

  // ← PERBAIKAN: pakai `code`, bukan `id`
  return {
    statusCode: 302,
    headers: { Location: `/activate?id=${encodeURIComponent(code)}` }
  };
}

function codeToNumericId(code) {
  const s = String(code).toUpperCase().trim();
  const m = s.match(/^([A-Z])(\d{3})$/);
  if (!m) return null;
  const batch = m[1].charCodeAt(0) - 64;
  const num = parseInt(m[2], 10);
  const id = (batch - 1) * 999 + num;
  return id < 1000
    ? String(id).padStart(3, '0')
    : String(id);
}

function html(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 40px auto; padding: 20px; color: #1a1a1a; }
    h1 { font-size: 20px; color: #dc2626; }
    p { color: #555; line-height: 1.5; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  </style>
</head>
<body>${body}</body>
</html>`
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}
