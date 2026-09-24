import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const {
    cardId, mode, placeId, placeName, placeAddress, reviewUrl, manualUrl
  } = JSON.parse(event.body);

  if (!cardId) return json(400, { error: 'Card ID tidak ada' });

  let finalUrl, source, placeData = {};

  // === Mode A: dari Google Places search ===
  if (mode === 'places') {
    if (reviewUrl) {
      finalUrl = reviewUrl;
    } else if (placeId) {
      finalUrl = `https://search.google.com/local/writereview?placeid=${placeId}`;
    } else {
      return json(400, { error: 'Data places tidak lengkap' });
    }
    source = 'places_api';
    placeData = {
      place_id: placeId,
      place_name: placeName,
      place_address: placeAddress
    };
  }

  // === Mode B: paste link manual ===
  else if (mode === 'manual') {
    const validated = validateReviewUrl(manualUrl);
    if (!validated) {
      return json(400, {
        error: 'Link tidak valid. Format: g.page/r/xxx/review atau search.google.com/local/writereview?placeid=...'
      });
    }
    finalUrl = validated;
    source = 'manual_paste';
  }

  else {
    return json(400, { error: 'Mode tidak dikenali' });
  }

  // Update card → status 'activated' (trigger akan set active = true)
  const { error } = await supabase
    .from('cards')
    .update({
      google_url: finalUrl,
      source,
      status: 'activated',
      activated_at: new Date().toISOString(),
      ...placeData
    })
    .eq('id', cardId)
    .in('status', ['sold', 'printed']);  // hanya bisa aktivasi kalau sudah dijual/dicetak

  if (error) return json(500, { error: 'Gagal menyimpan' });

  return json(200, { success: true, googleUrl: finalUrl });
}

function validateReviewUrl(input) {
  if (!input) return null;
  const url = input.trim();

  if (/^https:\/\/g\.page\/r\/[\w-]+\/review/.test(url)) return url;
  if (/^https:\/\/search\.google\.com\/local\/writereview\?placeid=[\w-]+/.test(url)) return url;

  return null;
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}
