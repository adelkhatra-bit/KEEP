jest.mock('../supabaseClient', () => ({ supabase: null }));

import {
  buildPayoutCheckoutUrl,
  detectPayoutProvider,
  payoutProviderLabel,
} from '../payoutLinkService';

describe('payoutLinkService — low-click direct payment', () => {
  it('detects PayPal.Me and pre-fills the exact offer total + currency', () => {
    expect(detectPayoutProvider('https://paypal.me/lokiseller')).toBe('PAYPAL');
    expect(payoutProviderLabel('https://paypal.me/lokiseller')).toBe('PayPal');
    expect(buildPayoutCheckoutUrl('https://paypal.me/lokiseller', 300, 'EUR'))
      .toBe('https://paypal.me/lokiseller/3EUR');
    expect(buildPayoutCheckoutUrl('https://paypal.me/lokiseller/99USD', 350, 'EUR'))
      .toBe('https://paypal.me/lokiseller/3.5EUR');
  });

  it('never rewrites arbitrary seller payout links', () => {
    const stripe = 'https://buy.stripe.com/test-link';
    expect(detectPayoutProvider(stripe)).toBe('STRIPE');
    expect(buildPayoutCheckoutUrl(stripe, 300, 'EUR')).toBe(stripe);
  });

  it('does not mistake paypal.com pages for PayPal.Me amount-path links', () => {
    const account = 'https://www.paypal.com/myaccount/';
    expect(detectPayoutProvider(account)).toBe('PAYPAL');
    expect(buildPayoutCheckoutUrl(account, 300, 'EUR')).toBe(account);
  });
});
