import { CACHE_MAX_AGE_MS, isCacheStale } from './offline-cache-policy';

describe('isCacheStale', () => {
  it('is not stale immediately after caching', () => {
    const now = Date.now();
    expect(isCacheStale(now, now)).toBe(false);
  });

  it('is not stale just under the max age', () => {
    const now = Date.now();
    expect(isCacheStale(now - (CACHE_MAX_AGE_MS - 1000), now)).toBe(false);
  });

  it('is stale just over the max age', () => {
    const now = Date.now();
    expect(isCacheStale(now - (CACHE_MAX_AGE_MS + 1000), now)).toBe(true);
  });

  it('is stale for a cache entry far in the past', () => {
    const now = Date.now();
    expect(isCacheStale(now - 7 * 24 * 60 * 60 * 1000, now)).toBe(true);
  });
});
