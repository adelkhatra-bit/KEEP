import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    // Vérifier auth
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'authentication_required' }), { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'authentication_required' }), { status: 401 });
    }

    const body = await req.json();
    const { offerId } = body;

    if (!offerId) {
      return new Response(JSON.stringify({ error: 'OFFER_ID_REQUIRED' }), { status: 400 });
    }

    // Vérifier que l'utilisateur a acheté cette playlist
    const { data: payment, error: paymentError } = await supabase
      .from('playlist_sale_payments')
      .select(`
        *,
        offer:playlist_sale_offers(*)
      `)
      .eq('offer_id', offerId)
      .eq('buyer_id', user.id)
      .eq('status', 'COMPLETED')
      .single();

    if (paymentError || !payment) {
      return new Response(
        JSON.stringify({ error: 'PURCHASE_NOT_FOUND' }),
        { status: 403 }
      );
    }

    const offer = (payment as any).offer as any;

    // Charger les tracks de la playlist
    const { data: tracks, error: tracksError } = await supabase
      .from('playlist_tracks')
      .select(`
        *,
        track:tracks(*)
      `)
      .eq('playlist_id', offer.id); // Utiliser l'ID de la playlist depuis l'offre

    if (tracksError || !tracks) {
      return new Response(
        JSON.stringify({ error: 'TRACKS_NOT_FOUND' }),
        { status: 404 }
      );
    }

    // Charger le profil du vendeur pour le metadata
    const { data: seller, error: sellerError } = await supabase
      .from('profiles')
      .select('username, avatar_url')
      .eq('id', payment.seller_id)
      .single();

    console.log('[playlist-download] Download manifest generated:', {
      offer_id: offerId,
      buyer_id: user.id,
      track_count: tracks.length,
      playlist_name: offer.playlist_name,
    });

    // Créer une URL de téléchargement signée valable 1 heure
    // Pour l'instant, on retourne un manifest JSON avec les infos
    // Le vrai téléchargement MP3/ZIP est géré par le client

    return new Response(
      JSON.stringify({
        ok: true,
        playlistId: offer.playlist_id,
        playlistName: offer.playlist_name,
        sellerUsername: seller?.username || 'Unknown',
        trackCount: tracks.length,
        tracks: tracks.map((t: any) => ({
          trackId: t.track_id,
          title: t.track?.title,
          artist: t.track?.artist,
          spotifyUri: t.track?.spotify_uri,
          appleMusicId: t.track?.apple_music_id,
        })),
        expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 heure
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[playlist-download] Error:', err.message);
    return new Response(
      JSON.stringify({ error: 'DOWNLOAD_FAILED', details: err.message }),
      { status: 500 }
    );
  }
});
