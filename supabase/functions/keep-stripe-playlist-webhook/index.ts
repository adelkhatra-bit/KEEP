import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
const brevoApiKey = Deno.env.get('BREVO_API_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    console.error('[stripe-webhook] Missing signature');
    return new Response(JSON.stringify({ error: 'Missing signature' }), { status: 400 });
  }

  let event;
  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('[stripe-webhook] Invalid signature:', err.message);
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 });
  }

  // Traiter uniquement les événements de charge réussie
  if (event.type === 'charge.succeeded') {
    const charge = event.data.object as any;
    console.log('[stripe-webhook] charge.succeeded:', charge.id);

    try {
      await handleChargeSucceeded(charge);
    } catch (err: any) {
      console.error('[stripe-webhook] Error handling charge:', err.message);
      return new Response(
        JSON.stringify({ error: 'Failed to process charge', details: err.message }),
        { status: 500 }
      );
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});

async function handleChargeSucceeded(charge: any) {
  // Extraire les métadonnées
  const { offer_id, buyer_id, seller_id, playlist_name } = charge.metadata || {};

  if (!offer_id || !buyer_id || !seller_id) {
    console.error('[stripe-webhook] Missing metadata:', { offer_id, buyer_id, seller_id });
    throw new Error('MISSING_METADATA');
  }

  // Vérifier que l'offre existe
  const { data: offer, error: offerError } = await supabase
    .from('playlist_sale_offers')
    .select('*')
    .eq('id', offer_id)
    .single();

  if (offerError || !offer) {
    console.error('[stripe-webhook] Offer not found:', offer_id);
    throw new Error('OFFER_NOT_FOUND');
  }

  // Insérer le paiement dans playlist_sale_payments
  const { error: paymentError } = await supabase
    .from('playlist_sale_payments')
    .insert({
      offer_id,
      seller_id,
      buyer_id,
      amount_cents: Math.round(charge.amount),
      currency_code: (charge.currency || 'eur').toUpperCase(),
      platform_fee_cents: 0, // KEEP prend 0% pour l'instant
      status: 'COMPLETED',
      provider: 'STRIPE_CONNECT',
      provider_payment_id: charge.id,
    });

  if (paymentError) {
    console.error('[stripe-webhook] Failed to insert payment:', paymentError);
    throw paymentError;
  }

  console.log('[stripe-webhook] Payment recorded:', {
    offer_id,
    buyer_id,
    seller_id,
    amount_cents: charge.amount,
    currency: charge.currency,
  });

  // Charger les profils du buyer et seller pour leurs emails
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, email')
    .in('id', [buyer_id, seller_id]);

  if (profilesError || !profiles) {
    console.error('[stripe-webhook] Failed to load profiles:', profilesError);
    // Ne pas lancer une erreur ici - le paiement est enregistré, continuer
  } else {
    const buyerProfile = profiles.find(p => p.id === buyer_id);
    const sellerProfile = profiles.find(p => p.id === seller_id);

    // Envoyer email au buyer avec lien de téléchargement
    if (buyerProfile?.email) {
      await sendBuyerEmail(buyerProfile, offer, charge);
    }

    // Envoyer email au seller pour confirmer la vente
    if (sellerProfile?.email) {
      await sendSellerEmail(sellerProfile, buyerProfile, offer, charge);
    }
  }
}

async function sendBuyerEmail(buyer: any, offer: any, charge: any) {
  try {
    const downloadUrl = `https://adelkhatra-bit.github.io/KEEP/?playlist_download=${offer.id}`;

    const body = {
      sender: { name: 'KEEP', email: 'noreply@keep-music.com' },
      to: [{ email: buyer.email, name: buyer.username }],
      subject: `Télécharge ta playlist : ${offer.playlist_name}`,
      htmlContent: `
        <h2>Paiement confirmé ✓</h2>
        <p>Merci d'avoir acheté la playlist "${offer.playlist_name}" !</p>
        <p><a href="${downloadUrl}">Télécharger maintenant</a></p>
        <p style="color: #999; font-size: 12px;">Montant: ${(charge.amount / 100).toFixed(2)} ${charge.currency.toUpperCase()}</p>
      `,
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoApiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error('[stripe-webhook] Failed to send buyer email:', response.status, await response.text());
    } else {
      console.log('[stripe-webhook] Buyer email sent to:', buyer.email);
    }
  } catch (err: any) {
    console.error('[stripe-webhook] Error sending buyer email:', err.message);
  }
}

async function sendSellerEmail(seller: any, buyer: any, offer: any, charge: any) {
  try {
    const body = {
      sender: { name: 'KEEP', email: 'noreply@keep-music.com' },
      to: [{ email: seller.email, name: seller.username }],
      subject: `Nouvelle vente : ${offer.playlist_name}`,
      htmlContent: `
        <h2>Nouvelle vente confirmée 🎉</h2>
        <p>Ta playlist "${offer.playlist_name}" a été achetée par <strong>${buyer?.username || 'Un utilisateur'}</strong>.</p>
        <p>Montant: ${(charge.amount / 100).toFixed(2)} ${charge.currency.toUpperCase()}</p>
        <p>Commission KEEP: 0% (gratuit pour toi)</p>
      `,
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoApiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error('[stripe-webhook] Failed to send seller email:', response.status, await response.text());
    } else {
      console.log('[stripe-webhook] Seller email sent to:', seller.email);
    }
  } catch (err: any) {
    console.error('[stripe-webhook] Error sending seller email:', err.message);
  }
