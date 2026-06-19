const { redis, TEST_TIMEOUT } = require('./setup');
const PriceCache = require('../src/price-cache');

let priceCache;

beforeAll(async () => {
  priceCache = new PriceCache(redis);
}, TEST_TIMEOUT);

beforeEach(async () => {
  if (redis.client.status === 'ready') {
    await redis.flushAll(true);
  }
}, TEST_TIMEOUT);

describe('PRICE CACHE — Price Management', () => {
  test('TC-PR-01: Set & get price — harga tersimpan dan terbaca', async () => {
    const priceData = { productId: 1, price: 15000000, currency: 'IDR' };
    await priceCache.setPrice(1, priceData, 3600);
    const result = await priceCache.getPrice(1);
    expect(result).toEqual(priceData);
  }, TEST_TIMEOUT);

  test('TC-PR-02: Invalidate price — hapus cache harga', async () => {
    await priceCache.setPrice(1, { price: 15000000 }, 3600);
    await priceCache.invalidatePrice(1);
    const result = await priceCache.getPrice(1);
    expect(result).toBeNull();
  }, TEST_TIMEOUT);

  test('TC-PR-03: Bulk invalidate — hapus banyak harga sekaligus', async () => {
    await priceCache.setPrice(1, { price: 100 }, 3600);
    await priceCache.setPrice(2, { price: 200 }, 3600);
    await priceCache.setPrice(3, { price: 300 }, 3600);
    const count = await priceCache.bulkInvalidatePrices([1, 2, 3]);
    expect(count).toBe(3);
    const p1 = await priceCache.getPrice(1);
    const p2 = await priceCache.getPrice(2);
    const p3 = await priceCache.getPrice(3);
    expect(p1).toBeNull();
    expect(p2).toBeNull();
    expect(p3).toBeNull();
  }, TEST_TIMEOUT);
});

describe('PRICE CACHE — Discount & Promo', () => {
  test('TC-PR-04: Apply discount — diskon persentase berhasil', async () => {
    await priceCache.setPrice(1, { price: 100000 }, 3600);
    const discounted = await priceCache.applyDiscount(1, 20);
    expect(discounted.originalPrice).toBe(100000);
    expect(discounted.price).toBe(80000);
    expect(discounted.discount).toBe(20);
  }, TEST_TIMEOUT);

  test('TC-PR-05: Flash sale discount — harga flash sale sementara', async () => {
    await priceCache.setPrice(1, { price: 200000 }, 3600);
    const flash = await priceCache.simulateFlashDiscount(1, 50);
    expect(flash.flashPrice).toBe(100000);
    expect(flash.isFlashSale).toBe(true);
  }, TEST_TIMEOUT);

  test('TC-PR-06: Coupon validation — kupon valid tersedia', async () => {
    const coupon = { code: 'DISKON10', type: 'percent', value: 10, maxUses: 100, usedCount: 0 };
    await priceCache.setCoupon('DISKON10', coupon, 86400);
    const result = await priceCache.validateCoupon('DISKON10');
    expect(result).toEqual(coupon);
    const invalid = await priceCache.validateCoupon('INVALID');
    expect(invalid).toBeNull();
  }, TEST_TIMEOUT);

  test('TC-PR-07: Use coupon — usage counter increment', async () => {
    const coupon = { code: 'DISKON10', type: 'percent', value: 10, maxUses: 2, usedCount: 0 };
    await priceCache.setCoupon('DISKON10', coupon, 86400);
    const r1 = await priceCache.useCoupon('DISKON10');
    expect(r1.valid).toBe(true);
    expect(r1.coupon.usedCount).toBe(1);
    const r2 = await priceCache.useCoupon('DISKON10');
    expect(r2.valid).toBe(true);
    expect(r2.coupon.usedCount).toBe(2);
    const r3 = await priceCache.useCoupon('DISKON10');
    expect(r3.valid).toBe(false);
    expect(r3.reason).toBe('max_uses_reached');
  }, TEST_TIMEOUT);
});

describe('PRICE CACHE — Tiered Pricing & Recommendations', () => {
  test('TC-PR-08: Tiered pricing — harga berbeda per tier user', async () => {
    const tierData = { bronze: 100000, silver: 90000, gold: 80000, default: 100000 };
    await priceCache.setTieredPrice(1, tierData, 7200);
    const goldPrice = await priceCache.getTieredPrice(1, 'gold');
    expect(goldPrice).toBe(80000);
    const bronzePrice = await priceCache.getTieredPrice(1, 'bronze');
    expect(bronzePrice).toBe(100000);
    const platinumPrice = await priceCache.getTieredPrice(1, 'platinum');
    expect(platinumPrice).toBe(100000);
  }, TEST_TIMEOUT);

  test('TC-PR-09: Discount banner — banner promo di-cache', async () => {
    const banner = { id: 1, title: 'Big Sale!', image: 'sale.jpg', link: '/sale' };
    await priceCache.setDiscountBanner('homepage', banner, 3600);
    const cached = await priceCache.getDiscountBanner('homepage');
    expect(cached).toEqual(banner);
  }, TEST_TIMEOUT);

  test('TC-PR-10: Recommendations — rekomendasi produk per user', async () => {
    const recs = [{ id: 2, name: 'Mouse' }, { id: 3, name: 'Keyboard' }];
    await priceCache.setRecommendedProducts('user:1', recs, 1800);
    const cached = await priceCache.getRecommendedProducts('user:1');
    expect(cached).toEqual(recs);
    const noRecs = await priceCache.getRecommendedProducts('user:999');
    expect(noRecs).toBeNull();
  }, TEST_TIMEOUT);
});
