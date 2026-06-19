const { redis, TEST_TIMEOUT } = require('./setup');
const InventoryCache = require('../src/inventory-cache');

let inventory;

beforeAll(async () => {
  inventory = new InventoryCache(redis);
}, TEST_TIMEOUT);

beforeEach(async () => {
  if (redis.client.status === 'ready') {
    await redis.flushAll(true);
  }
}, TEST_TIMEOUT);

describe('INVENTORY CACHE — Basic Stock Operations', () => {
  test('TC-IN-01: Init stock — inisialisasi stok produk', async () => {
    const result = await inventory.initStock(1, 100);
    expect(result).toBe(true);
    const stock = await inventory.getStock(1);
    expect(stock).toBe(100);
  }, TEST_TIMEOUT);

  test('TC-IN-02: Init stock — duplicate tidak overwrite', async () => {
    await inventory.initStock(1, 100);
    const result = await inventory.initStock(1, 200);
    expect(result).toBe(false);
    const stock = await inventory.getStock(1);
    expect(stock).toBe(100);
  }, TEST_TIMEOUT);

  test('TC-IN-03: Get stock — produk tanpa stok return null', async () => {
    const stock = await inventory.getStock(999);
    expect(stock).toBeNull();
  }, TEST_TIMEOUT);

  test('TC-IN-04: Set stock — update stok langsung', async () => {
    await inventory.setStock(1, 50);
    const stock = await inventory.getStock(1);
    expect(stock).toBe(50);
  }, TEST_TIMEOUT);
});

describe('INVENTORY CACHE — Deduct & Reserve', () => {
  test('TC-IN-05: Deduct stock — stok cukup, berhasil', async () => {
    await inventory.setStock(1, 100);
    const result = await inventory.deductStock(1, 30);
    expect(result).toBe(true);
    const stock = await inventory.getStock(1);
    expect(stock).toBe(70);
  }, TEST_TIMEOUT);

  test('TC-IN-06: Deduct stock — stok kurang, gagal', async () => {
    await inventory.setStock(1, 10);
    const result = await inventory.deductStock(1, 20);
    expect(result).toBe(false);
    const stock = await inventory.getStock(1);
    expect(stock).toBe(10);
  }, TEST_TIMEOUT);

  test('TC-IN-07: Atomic deduct — DECRBY operation', async () => {
    await inventory.setStock(1, 100);
    const result = await inventory.deductStockAtomic(1, 25);
    expect(result).toBe(true);
    const stock = await inventory.getStock(1);
    expect(stock).toBe(75);
  }, TEST_TIMEOUT);

  test('TC-IN-08: Reserve stock — hold stok dengan TTL', async () => {
    await inventory.setStock(1, 50);
    const reservationId = await inventory.reserveStock(1, 10, 300);
    expect(reservationId).not.toBe(false);
    const stock = await inventory.getStock(1);
    expect(stock).toBe(40);
  }, TEST_TIMEOUT);

  test('TC-IN-09: Release reservation — batalkan reservasi, stok kembali', async () => {
    await inventory.setStock(1, 50);
    const reservationId = await inventory.reserveStock(1, 10, 300);
    const released = await inventory.releaseReservation(reservationId);
    expect(released).toBe(true);
    const stock = await inventory.getStock(1);
    expect(stock).toBe(50);
  }, TEST_TIMEOUT);
});

describe('INVENTORY CACHE — Purchase & Bulk', () => {
  test('TC-IN-10: Purchase with lock — distributed lock mencegah overselling', async () => {
    await inventory.setStock(1, 5);
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(inventory.purchaseWithLock(1, 1, `user:${i}`));
    }
    const results = await Promise.all(promises);
    const successes = results.filter(r => r.success).length;
    expect(successes).toBeLessThanOrEqual(5);
    expect(successes).toBeGreaterThanOrEqual(1);
    const remaining = await inventory.getStock(1);
    expect(remaining).toBe(5 - successes);
  }, TEST_TIMEOUT);

  test('TC-IN-11: Bulk update — update stok banyak produk', async () => {
    const items = [
      { productId: 1, quantity: 100 },
      { productId: 2, quantity: 200 },
      { productId: 3, quantity: 300 },
    ];
    const count = await inventory.bulkUpdateStock(items);
    expect(count).toBe(3);
    const s1 = await inventory.getStock(1);
    const s2 = await inventory.getStock(2);
    const s3 = await inventory.getStock(3);
    expect(s1).toBe(100);
    expect(s2).toBe(200);
    expect(s3).toBe(300);
  }, TEST_TIMEOUT);

  test('TC-IN-12: Restock — tambah stok produk', async () => {
    await inventory.setStock(1, 50);
    const newStock = await inventory.restock(1, 30);
    expect(newStock).toBe(80);
  }, TEST_TIMEOUT);
});
