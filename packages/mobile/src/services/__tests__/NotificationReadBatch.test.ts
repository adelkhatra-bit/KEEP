jest.mock('../supabaseClient', () => ({ supabase: null }));

import { createNotificationChangeBatch } from '../notificationService';

describe('cross-device notification update batching', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('converts 100 read-all row updates into one reload', () => {
    const onChange = jest.fn();
    const batch = createNotificationChangeBatch(onChange, 200);
    for (let i = 0; i < 100; i++) batch.notify();
    expect(onChange).not.toHaveBeenCalled();
    jest.advanceTimersByTime(200);
    expect(onChange).toHaveBeenCalledTimes(1);
    batch.notify();
    jest.advanceTimersByTime(200);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('cancels pending updates on unmount or account change', () => {
    const onChange = jest.fn();
    const batch = createNotificationChangeBatch(onChange);
    batch.notify();
    batch.cancel();
    jest.runAllTimers();
    expect(onChange).not.toHaveBeenCalled();
  });
});
