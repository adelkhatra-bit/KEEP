import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const webhookUrl = Deno.env.get('STRIPE_WEBHOOK_URL') || 'https://rrhqsqzcplvmwxizqnla.supabase.co/functions/v1/keep-stripe-playlist-webhook';

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

    // Charger l'offre
    const { data: offer, error: offerError } = await supabase
      .from('playlist_sale_offers')
      .select('*')
      .eq('id', offerId)
      .single();

    if (offerError || !offer || !offer.is_active) {
      return new Response(JSON.stringify({ error: 'OFFER_NOT_FOUND_OR_INACTIVE' }), { status: 404 });
    }

    // Vérifier que ce n'est pas un auto-achat
    if (offer.seller_id === user.id) {
      return new Response(JSON.stringify({ error: 'CANNOT_BUY_OWN_PLAYLIST' }), { status: 400 });
    }

    // Vérifier que le buyer n'a pas déjà acheté
    const { data: existingPayment } = await supabase
      .from('playlist_sale_payments')
      .select('id')
      .eq('offer_id', offerId)
      .eq('buyer_id', user.id)
      .eq('status', 'COMPLETED')
      .single();

    if (existingPayment) {
      return new Response(JSON.stringify({ error: 'ALREADY_PURCHASED' }), { status: 400 });
    }

    // Créer la Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: (offer.currency_code || 'EUR').toLowerCase(),
            product_data: {
              name: offer.playlist_name || 'Playlist',
              description: `Playlist de ${offer.seller_id}`,
            },
            unit_amount: offer.price_cents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        offer_id: offerId,
        buyer_id: user.id,
        seller_id: offer.seller_id,
        playlist_name: offer.playlist_name,
      },
      success_url: `https://adelkhatra-bit.github.io/KEEP/?checkout_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://adelkhatra-bit.github.io/KEEP/?checkout_cancelled=true`,
    });

    console.log('[stripe-checkout] Session created:', {
      session_id: session.id,
      offer_id: offerId,
      buyer_id: user.id,
      seller_id: offer.seller_id,
      amount_cents: offer.price_cents,
      currency: offer.currency_code,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        checkoutUrl: session.url,
        sessionId: session.id,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[stripe-checkout] Error:', err.message);
    return new Response(
      JSON.stringify({ error: 'CHECKOUT_FAILED', details: err.message }),
      { status: 500 }
    );
  }
});
