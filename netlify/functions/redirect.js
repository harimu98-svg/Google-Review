import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  const params = event.queryStringParameters || {};

  // Ambil id & type
  const id = params.id || event.path.split('/').pop();
  const type = params.type || 'unknown'; // 'nfc' | 'qr' | 'unknown'

  // Validasi id
  if (!id) {
    return { statusCode: 400, body: 'Card ID tidak ada' };
  }

  // Cek card di database
  const { data, error } = await supabase
    .from('cards')
    .select('google_url, active')
    .eq('id', id)
    .single();

  if (error || !data) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'text/html' },
      body: `<h1>Card tidak ditemukan</h1><p>ID: ${id}</p>`
    };
  }

  // Increment counter (non-blocking, jangan tunggu)
  if (type === 'nfc' || type === 'qr') {
    supabase
      .rpc('increment_tap', { card_id: id, tap_type: type })
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
    headers: { Location: `/activate?id=${id}` }
  };
}
