const { redis, TEST_TIMEOUT } = require('./setup');
const ProductCache = require('../src/product-cache');

let productCache;

beforeAll(async () => {
  productCache = new ProductCache(redis);
}, TEST_TIMEOUT);

beforeEach(async () => {
  if (redis.client.status === 'ready') {
    await redis.flushAll(true);
  }
}, TEST_TIMEOUT);

describe('PRODUCT CACHE — Basic Operations', () => {
  test('TC-PC-01: SET & GET — data produk tersimpan dan bisa dibaca', async () => {
    const product = { id: 1, name: 'Laptop Gaming', price: 15000000, stock: 10 };
    await productCache.setProduct(1, product, 3600);
    const result = await productCache.getProduct(1);
    expect(result).toEqual(product);
  }, TEST_TIMEOUT);

  test('TC-PC-02: GET — produk tidak ada return null', async () => {
    const result = await productCache.getProduct(999);
    expect(result).toBeNull();
  }, TEST_TIMEOUT);

  test('TC-PC-03: Invalidate — hapus produk dari cache', async () => {
    await productCache.setProduct(1, { name: 'Test' }, 3600);
    let exists = await redis.exists('product:1');
    expect(exists).toBe(true);
    await productCache.invalidateProduct(1);
    exists = await redis.exists('product:1');
    expect(exists).toBe(false);
  }, TEST_TIMEOUT);
});

describe('PRODUCT CACHE — Category & Search', () => {
  test('TC-PC-04: Category page — cache listing per halaman', async () => {
    const products = [{ id: 1 }, { id: 2 }, { id: 3 }];
    await productCache.setCategoryPage('elektronik', 1, products, 1800);
    const result = await productCache.getCategoryPage('elektronik', 1);
    expect(result).toEqual(products);
  }, TEST_TIMEOUT);

  test('TC-PC-05: Category invalidation — hapus semua halaman kategori', async () => {
    await productCache.setCategoryPage('elektronik', 1, ['a'], 1800);
    await productCache.setCategoryPage('elektronik', 2, ['b'], 1800);
    await productCache.setCategoryPage('elektronik', 3, ['c'], 1800);
    const deleted = await productCache.invalidateCategory('elektronik');
    expect(deleted).toBe(3);
    const p1 = await productCache.getCategoryPage('elektronik', 1);
    const p2 = await productCache.getCategoryPage('elektronik', 2);
    const p3 = await productCache.getCategoryPage('elektronik', 3);
    expect(p1).toBeNull();
    expect(p2).toBeNull();
    expect(p3).toBeNull();
  }, TEST_TIMEOUT);

  test('TC-PC-06: Search results — cache hasil pencarian', async () => {
    const results = [{ id: 1, name: 'Laptop' }];
    await productCache.setSearchResults('laptop gaming', 1, results, 900);
    const cached = await productCache.getSearchResults('laptop gaming', 1);
    expect(cached).toEqual(results);
    const miss = await productCache.getSearchResults('laptop gaming', 2);
    expect(miss).toBeNull();
  }, TEST_TIMEOUT);

  test('TC-PC-07: Related products — cache produk terkait', async () => {
    const related = [{ id: 2, name: 'Mouse' }, { id: 3, name: 'Keyboard' }];
    await productCache.setRelatedProducts(1, related, 7200);
    const result = await productCache.getRelatedProducts(1);
    expect(result).toEqual(related);
  }, TEST_TIMEOUT);
});

describe('PRODUCT CACHE — Advanced Patterns', () => {
  test('TC-PC-08: Cache-Aside — miss ambil dari origin, hit berikutnya dari cache', async () => {
    let fetchCount = 0;
    const fetchFn = jest.fn().mockImplementation(async (id) => {
      fetchCount++;
      return { id, name: `Product ${id}`, fetchedAt: Date.now() };
    });
    const result1 = await productCache.cacheAsideProduct(1, fetchFn, 60);
    expect(result1.source).toBe('origin');
    expect(fetchCount).toBe(1);
    const result2 = await productCache.cacheAsideProduct(1, fetchFn, 60);
    expect(result2.source).toBe('cache');
    expect(fetchCount).toBe(1);
  }, TEST_TIMEOUT);

  test('TC-PC-09: Cache warming — pre-load produk populer', async () => {
    let fetchCount = 0;
    const fetchFn = jest.fn().mockImplementation(async (id) => {
      fetchCount++;
      return { id, name: 'Popular Product' };
    });
    const result1 = await productCache.warmUpProduct(1, fetchFn);
    expect(result1.source).toBe('origin');
    expect(fetchCount).toBe(1);
    const result2 = await productCache.warmUpProduct(1, fetchFn);
    expect(result2.source).toBe('cache');
    expect(fetchCount).toBe(1);
  }, TEST_TIMEOUT);

  test('TC-PC-10: Bulk get — ambil banyak produk sekaligus', async () => {
    await productCache.setProduct(1, { name: 'A' }, 3600);
    await productCache.setProduct(2, { name: 'B' }, 3600);
    await productCache.setProduct(3, { name: 'C' }, 3600);
    const results = await productCache.bulkGetProducts([1, 2, 3, 999]);
    expect(results['1']).toEqual({ name: 'A' });
    expect(results['2']).toEqual({ name: 'B' });
    expect(results['3']).toEqual({ name: 'C' });
    expect(results['999']).toBeNull();
  }, TEST_TIMEOUT);

  test('TC-PC-11: TTL — data produk expired setelah waktu tertentu', async () => {
    await productCache.setProduct(1, { name: 'Expire Test' }, 1);
    let data = await productCache.getProduct(1);
    expect(data).toEqual({ name: 'Expire Test' });
    await new Promise(r => setTimeout(r, 1100));
    data = await productCache.getProduct(1);
    expect(data).toBeNull();
  }, TEST_TIMEOUT);
});
