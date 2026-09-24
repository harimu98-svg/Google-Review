import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  const id = event.path.split('/').pop();

  const { data, error } = await supabase
    .from('cards')
    .select('google_url, active')
    .eq('id', id)
    .single();

  if (error || !data) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'text/html' },
      body: '<h1>Card tidak ditemukan</h1>'
    };
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
