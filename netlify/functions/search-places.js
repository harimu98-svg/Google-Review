export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }

  const q = event.queryStringParameters?.q?.trim();
  if (!q || q.length < 3) {
    return json(200, { results: [] });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.rating',
        'places.userRatingCount',
        'places.googleMapsLinks.writeAReviewUri'
      ].join(',')
    },
    body: JSON.stringify({
      textQuery: q,
      languageCode: 'id'
    })
  });

  if (!res.ok) {
    console.error('Places API error:', await res.text());
    return json(500, { error: 'Gagal cari di Google Maps' });
  }

  const data = await res.json();

  const results = (data.places || []).map(p => ({
    placeId: p.id,
    name: p.displayName?.text,
    address: p.formattedAddress,
    rating: p.rating,
    totalReviews: p.userRatingCount,
    reviewUrl: p.googleMapsLinks?.writeAReviewUri || null
  }));

  return json(200, { results });
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}
