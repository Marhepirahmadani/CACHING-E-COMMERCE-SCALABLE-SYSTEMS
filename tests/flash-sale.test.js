const { redis, TEST_TIMEOUT } = require('./setup');
const FlashSale = require('../src/flash-sale');

let flashSale;

beforeAll(async () => {
  flashSale = new FlashSale(redis);
}, TEST_TIMEOUT);

beforeEach(async () => {
  if (redis.client.status === 'ready') {
    await redis.flushAll(true);
  }
}, TEST_TIMEOUT);

describe('FLASH SALE — Distributed Lock', () => {
  test('TC-FS-01: Acquire & release — lock bisa diambil dan dilepas', async () => {
    const acquired = await flashSale.acquireLock('deal:1', 10);
    expect(acquired).toBe(true);
    await flashSale.releaseLock('deal:1');
    const reacquired = await flashSale.acquireLock('deal:1', 10);
    expect(reacquired).toBe(true);
  }, TEST_TIMEOUT);

  test('TC-FS-02: Lock contention — lock kedua gagal jika belum release', async () => {
    await flashSale.acquireLock('deal:1', 10);
    const second = await flashSale.acquireLock('deal:1', 10);
    expect(second).toBe(false);
  }, TEST_TIMEOUT);
});

describe('FLASH SALE — Rate Limiting', () => {
  test('TC-FS-03: Rate limiting — request dalam batas diperbolehkan', async () => {
    const result = await flashSale.checkRateLimit('user:1', 5, 10);
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(1);
  }, TEST_TIMEOUT);

  test('TC-FS-04: Rate limit exceeded — request melebihi batas ditolak', async () => {
    for (let i = 0; i < 5; i++) {
      await flashSale.checkRateLimit('user:1', 5, 10);
    }
    const result = await flashSale.checkRateLimit('user:1', 5, 10);
    expect(result.allowed).toBe(false);
  }, TEST_TIMEOUT);
});

describe('FLASH SALE — One-Per-User & Pre-Cache', () => {
  test('TC-FS-05: One-per-user claim — user hanya bisa claim 1x', async () => {
    const first = await flashSale.claimOnePerUser('user:1', 'deal:1');
    expect(first).toBe(true);
    const second = await flashSale.claimOnePerUser('user:1', 'deal:1');
    expect(second).toBe(false);
  }, TEST_TIMEOUT);

  test('TC-FS-06: Pre-cache flash product — data flash sale siap sebelum event', async () => {
    const flashData = { productId: 1, flashPrice: 10000000, stock: 50 };
    await flashSale.preCacheFlashProduct(1, flashData, 3600);
    const cached = await flashSale.getFlashProduct(1);
    expect(cached).toEqual(flashData);
  }, TEST_TIMEOUT);
});

describe('FLASH SALE — Purchase Protection', () => {
  test('TC-FS-07: Purchase with protection — sukses jika stok cukup', async () => {
    const stockCheckFn = jest.fn().mockResolvedValue(true);
    const result = await flashSale.purchaseWithProtection('user:1', 1, 1, stockCheckFn);
    expect(result.success).toBe(true);
  }, TEST_TIMEOUT);

  test('TC-FS-08: Purchase protection — gagal jika out of stock', async () => {
    const stockCheckFn = jest.fn().mockResolvedValue(false);
    const result = await flashSale.purchaseWithProtection('user:1', 1, 1, stockCheckFn);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('out_of_stock');
  }, TEST_TIMEOUT);

  test('TC-FS-09: Purchase protection — gagal jika sudah pernah claim', async () => {
    const stockCheckFn = jest.fn().mockResolvedValue(true);
    await flashSale.purchaseWithProtection('user:1', 1, 1, stockCheckFn);
    const result = await flashSale.purchaseWithProtection('user:1', 1, 1, stockCheckFn);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('already_purchased');
  }, TEST_TIMEOUT);
});

describe('FLASH SALE — Analytics & Sliding Window', () => {
  test('TC-FS-10: Sale counter — increment dan read counter', async () => {
    const c1 = await flashSale.incrementSaleCount(1);
    expect(c1).toBe(1);
    const c2 = await flashSale.incrementSaleCount(1);
    expect(c2).toBe(2);
    const count = await flashSale.getSaleCount(1);
    expect(count).toBe(2);
  }, TEST_TIMEOUT);

  test('TC-FS-11: Sales ranking — urutkan produk terlaris', async () => {
    await flashSale.incrementSaleCount(1);
    await flashSale.incrementSaleCount(2);
    await flashSale.incrementSaleCount(2);
    await flashSale.incrementSaleCount(3);
    await flashSale.incrementSaleCount(3);
    await flashSale.incrementSaleCount(3);
    const ranking = await flashSale.getSalesRanking(3);
    expect(ranking[0].productId).toBe('3');
    expect(ranking[0].count).toBe(3);
    expect(ranking[1].productId).toBe('2');
    expect(ranking[2].productId).toBe('1');
  }, TEST_TIMEOUT);

  test('TC-FS-12: Sliding window — rate limit berbasis waktu', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await flashSale.checkSlidingWindow('user:1', 10, 60000);
      expect(r.allowed).toBe(true);
    }
    expect(true).toBe(true);
  }, TEST_TIMEOUT);
});
