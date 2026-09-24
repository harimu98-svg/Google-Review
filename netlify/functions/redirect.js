import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  const params = event.queryStringParameters || {};
  const code = params.id || event.path.split('/').pop();
  const type = params.type || 'unknown'; // 'nfc' | 'qr' | 'unknown'

  // Validasi kode
  if (!code) {
    return html(400, '<h1>Kode card tidak ada</h1>');
  }

  // Konversi kode A001 → id numerik 001
  const numericId = codeToNumericId(code);

  if (!numericId) {
    return html(400, `
      <h1>Kode card tidak valid</h1>
      <p>Kode: <code>${escapeHtml(code)}</code></p>
      <p>Format yang benar: <code>A001</code>, <code>A999</code>, <code>B001</code>, dst.</p>
    `);
  }

  // Cari card di database
  const { data, error } = await supabase
    .from('cards')
    .select('google_url, active')
    .eq('id', numericId)
    .single();

  if (error || !data) {
    return html(404, `
      <h1>Card tidak ditemukan</h1>
      <p>Kode: <code>${escapeHtml(code)}</code></p>
      <p>ID: <code>${numericId}</code></p>
    `);
  }

  // Increment counter (non-blocking, tidak menghambat redirect)
  if (type === 'nfc' || type === 'qr') {
    supabase
      .rpc('increment_tap', { card_id: numericId, tap_type: type })
      .then(() => {})
      .catch(err => console.error('Counter error:', err));
  }

  // Sudah aktif → redirect ke Google Review
  if (data.active && data.google_url) {
    return {
      statusCode: 302,
      headers: { Location: data.google_url }
    };
  }

  // Belum aktif → ke halaman aktivasi
  return {
    statusCode: 302,
    headers: { Location: `/activate?id=${numericId}` }
  };
}

// ============================================
// Konversi kode A001 → id numerik
// A001 → 001
// A999 → 999
// B001 → 1000
// B002 → 1001
// B999 → 1998
// C001 → 1999
// ============================================
function codeToNumericId(code) {
  // Format: 1 huruf + 3 digit (A001, B999, dst.)
  const match = code.match(/^([A-Z])(\d{3})$/);
  if (!match) return null;

  const letter = match[1];
  const number = parseInt(match[2], 10);
  const batchIndex = letter.charCodeAt(0) - 64; // A=1, B=2, C=3, ...

  // Rumus: ((batch - 1) * 999) + number
  const numericId = (batchIndex - 1) * 999 + number;

  // Validasi: minimal 1
  if (numericId < 1) return null;

  // Pad 3 digit untuk id ≤ 999, biarkan untuk id ≥ 1000
  return numericId < 1000
    ? String(numericId).padStart(3, '0')
    : String(numericId);
}

// ============================================
// Helper: render HTML error page
// ============================================
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
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      max-width: 480px;
      margin: 40px auto;
      padding: 20px;
      color: #1a1a1a;
    }
    h1 { font-size: 20px; color: #dc2626; }
    p { color: #555; line-height: 1.5; }
    code {
      background: #f0f0f0;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
    }
  </style>
</head>
<body>
  ${body}
</body>
</html>`
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}
