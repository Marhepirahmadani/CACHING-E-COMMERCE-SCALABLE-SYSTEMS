const { redis, TEST_TIMEOUT } = require('./setup');
const CartCache = require('../src/cart-cache');

let cartCache;

beforeAll(async () => {
  cartCache = new CartCache(redis);
}, TEST_TIMEOUT);

beforeEach(async () => {
  if (redis.client.status === 'ready') {
    await redis.flushAll(true);
  }
}, TEST_TIMEOUT);

const sampleItem = { productId: 1, name: 'Laptop', price: 15000000, quantity: 1 };
const sampleItem2 = { productId: 2, name: 'Mouse', price: 250000, quantity: 2 };

describe('CART CACHE — Basic Operations', () => {
  test('TC-CR-01: Add item — tambah item ke cart kosong', async () => {
    const cart = await cartCache.addItem('session:1', sampleItem);
    expect(cart.items.length).toBe(1);
    expect(cart.items[0].productId).toBe(1);
    expect(cart.total).toBe(15000000);
  }, TEST_TIMEOUT);

  test('TC-CR-02: Add multiple items — tambah beberapa item berbeda', async () => {
    await cartCache.addItem('session:1', sampleItem);
    const cart = await cartCache.addItem('session:1', sampleItem2);
    expect(cart.items.length).toBe(2);
    expect(cart.total).toBe(15000000 + (250000 * 2));
  }, TEST_TIMEOUT);

  test('TC-CR-03: Get cart — baca data cart', async () => {
    await cartCache.addItem('session:1', sampleItem);
    const cart = await cartCache.getCart('session:1');
    expect(cart).not.toBeNull();
    expect(cart.items.length).toBe(1);
  }, TEST_TIMEOUT);

  test('TC-CR-04: Update quantity — ubah jumlah item', async () => {
    await cartCache.addItem('session:1', sampleItem);
    const updated = await cartCache.updateQuantity('session:1', 1, 3);
    expect(updated.items[0].quantity).toBe(3);
    expect(updated.total).toBe(15000000 * 3);
  }, TEST_TIMEOUT);

  test('TC-CR-05: Remove item — hapus item dari cart', async () => {
    await cartCache.addItem('session:1', sampleItem);
    await cartCache.addItem('session:1', sampleItem2);
    const cart = await cartCache.removeItem('session:1', 1);
    expect(cart.items.length).toBe(1);
    expect(cart.items[0].productId).toBe(2);
  }, TEST_TIMEOUT);
});

describe('CART CACHE — TTL & Merge', () => {
  test('TC-CR-06: Cart TTL — data cart expired setelah TTL', async () => {
    await cartCache.addItem('session:ttl', sampleItem, 1);
    let cart = await cartCache.getCart('session:ttl');
    expect(cart).not.toBeNull();
    await new Promise(r => setTimeout(r, 1100));
    cart = await cartCache.getCart('session:ttl');
    expect(cart).toBeNull();
  }, TEST_TIMEOUT);

  test('TC-CR-07: Merge cart — anonymous ke user cart (user kosong)', async () => {
    await cartCache.addItem('anon:1', sampleItem);
    const merged = await cartCache.mergeCarts('anon:1', 'user:1');
    expect(merged.items.length).toBe(1);
    const anonCart = await cartCache.getCart('anon:1');
    expect(anonCart).toBeNull();
  }, TEST_TIMEOUT);

  test('TC-CR-08: Merge cart — anonymous ke user cart (user sudah punya item)', async () => {
    await cartCache.addItem('anon:1', sampleItem);
    await cartCache.addItem('user:1', sampleItem2);
    const merged = await cartCache.mergeCarts('anon:1', 'user:1');
    expect(merged.items.length).toBe(2);
    expect(merged.items.find(i => i.productId === 1).quantity).toBe(1);
    expect(merged.items.find(i => i.productId === 2).quantity).toBe(2);
  }, TEST_TIMEOUT);

  test('TC-CR-09: Item count — jumlah total item dalam cart', async () => {
    await cartCache.addItem('session:1', sampleItem);
    await cartCache.addItem('session:1', sampleItem2);
    const count = await cartCache.getItemCount('session:1');
    expect(count).toBe(3);
  }, TEST_TIMEOUT);

  test('TC-CR-10: Add duplicate — item sama menambah quantity', async () => {
    await cartCache.addItem('session:1', sampleItem);
    await cartCache.addItem('session:1', { ...sampleItem, quantity: 2 });
    const cart = await cartCache.getCart('session:1');
    expect(cart.items.length).toBe(1);
    expect(cart.items[0].quantity).toBe(3);
    expect(cart.total).toBe(15000000 * 3);
  }, TEST_TIMEOUT);
});

describe('CART CACHE — Advanced', () => {
  test('TC-CR-11: Concurrent cart — lock mencegah race condition', async () => {
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(cartCache.addItemConcurrent('session:1', { ...sampleItem, productId: i + 1 }));
    }
    const results = await Promise.all(promises);
    const successes = results.filter(r => r.success).length;
    expect(successes).toBeGreaterThanOrEqual(1);
    const cart = await cartCache.getCart('session:1');
    expect(cart).not.toBeNull();
  }, TEST_TIMEOUT);

  test('TC-CR-12: Clear cart — hapus semua item', async () => {
    await cartCache.addItem('session:1', sampleItem);
    await cartCache.addItem('session:1', sampleItem2);
    await cartCache.clearCart('session:1');
    const cart = await cartCache.getCart('session:1');
    expect(cart).toBeNull();
  }, TEST_TIMEOUT);
});
