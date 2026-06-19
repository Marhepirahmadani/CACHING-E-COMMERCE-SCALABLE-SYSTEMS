class ProductCache {
  constructor(redis) {
    this.redis = redis;
  }

  async getProduct(productId) {
    return await this.redis.get(`product:${productId}`);
  }

  async setProduct(productId, data, ttl = 3600) {
    await this.redis.set(`product:${productId}`, data, ttl);
  }

  async invalidateProduct(productId) {
    return await this.redis.del(`product:${productId}`);
  }

  async getCategoryPage(categoryId, page) {
    return await this.redis.get(`category:${categoryId}:page:${page}`);
  }

  async setCategoryPage(categoryId, page, data, ttl = 1800) {
    await this.redis.set(`category:${categoryId}:page:${page}`, data, ttl);
  }

  async invalidateCategory(categoryId) {
    const keys = await this.scanKeys(`category:${categoryId}:page:*`);
    const multi = this.redis.client.multi();
    for (const key of keys) multi.del(key);
    if (keys.length > 0) await multi.exec();
    return keys.length;
  }

  async getSearchResults(query, page) {
    const key = `search:${this.normalizeQuery(query)}:page:${page}`;
    return await this.redis.get(key);
  }

  async setSearchResults(query, page, data, ttl = 900) {
    const key = `search:${this.normalizeQuery(query)}:page:${page}`;
    await this.redis.set(key, data, ttl);
  }

  async getRelatedProducts(productId) {
    return await this.redis.get(`related:${productId}`);
  }

  async setRelatedProducts(productId, data, ttl = 7200) {
    await this.redis.set(`related:${productId}`, data, ttl);
  }

  async cacheAsideProduct(productId, fetchFn, ttl = 3600) {
    let data = await this.redis.get(`product:${productId}`);
    if (data) return { source: 'cache', data };
    data = await fetchFn(productId);
    await this.redis.set(`product:${productId}`, data, ttl);
    return { source: 'origin', data };
  }

  async warmUpProduct(productId, fetchFn) {
    let data = await this.redis.get(`product:${productId}`);
    if (!data) {
      data = await fetchFn(productId);
      await this.redis.set(`product:${productId}`, data, 3600);
      return { source: 'origin', data };
    }
    return { source: 'cache', data };
  }

  async bulkGetProducts(productIds) {
    const results = {};
    const multi = this.redis.client.multi();
    for (const id of productIds) multi.get(`product:${id}`);
    const rawResults = await multi.exec();
    for (let i = 0; i < productIds.length; i++) {
      const raw = rawResults[i]?.[1];
      results[productIds[i]] = raw ? JSON.parse(raw) : null;
    }
    return results;
  }

  normalizeQuery(query) {
    return query.toLowerCase().replace(/\s+/g, '+');
  }

  async scanKeys(pattern) {
    const stream = this.redis.client.scanStream({ match: pattern, count: 100 });
    const keys = [];
    for await (const batch of stream) keys.push(...batch);
    return keys;
  }
}

module.exports = ProductCache;
