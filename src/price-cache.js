class PriceCache {
  constructor(redis) {
    this.redis = redis;
  }

  async getPrice(productId) {
    return await this.redis.get(`price:${productId}`);
  }

  async setPrice(productId, priceData, ttlSeconds = 3600) {
    await this.redis.set(`price:${productId}`, priceData, ttlSeconds);
  }

  async invalidatePrice(productId) {
    return await this.redis.del(`price:${productId}`);
  }

  async bulkInvalidatePrices(productIds) {
    const multi = this.redis.client.multi();
    for (const id of productIds) multi.del(`price:${id}`);
    await multi.exec();
    return productIds.length;
  }

  async applyDiscount(productId, discountPercent) {
    const priceData = await this.redis.get(`price:${productId}`);
    if (!priceData) return null;
    const discounted = {
      ...priceData,
      originalPrice: priceData.price,
      price: Math.round(priceData.price * (1 - discountPercent / 100)),
      discount: discountPercent,
      appliedAt: Date.now(),
    };
    await this.redis.set(`price:${productId}`, discounted, 3600);
    return discounted;
  }

  async simulateFlashDiscount(productId, discountPercent) {
    const priceData = await this.redis.get(`price:${productId}`);
    if (!priceData) return null;
    const discounted = {
      ...priceData,
      originalPrice: priceData.price,
      flashPrice: Math.round(priceData.price * (1 - discountPercent / 100)),
      discount: discountPercent,
      isFlashSale: true,
      appliedAt: Date.now(),
    };
    await this.redis.set(`price:${productId}`, discounted, 900);
    return discounted;
  }

  async validateCoupon(couponCode) {
    return await this.redis.get(`coupon:${couponCode}`);
  }

  async setCoupon(couponCode, couponData, ttlSeconds = 86400) {
    await this.redis.set(`coupon:${couponCode}`, couponData, ttlSeconds);
  }

  async useCoupon(couponCode) {
    const coupon = await this.redis.get(`coupon:${couponCode}`);
    if (!coupon) return { valid: false, reason: 'not_found' };
    if (coupon.usedCount >= coupon.maxUses) return { valid: false, reason: 'max_uses_reached' };
    coupon.usedCount++;
    await this.redis.set(`coupon:${couponCode}`, coupon, 86400);
    return { valid: true, coupon };
  }

  async getTieredPrice(productId, userTier) {
    const tierData = await this.redis.get(`tiered:${productId}`);
    if (!tierData) return null;
    return tierData[userTier] || tierData.default;
  }

  async setTieredPrice(productId, tierData, ttlSeconds = 7200) {
    await this.redis.set(`tiered:${productId}`, tierData, ttlSeconds);
  }

  async getDiscountBanner(discountId) {
    return await this.redis.get(`discount:banner:${discountId}`);
  }

  async setDiscountBanner(discountId, bannerData, ttlSeconds = 3600) {
    await this.redis.set(`discount:banner:${discountId}`, bannerData, ttlSeconds);
  }

  async getRecommendedProducts(userId) {
    return await this.redis.get(`recs:${userId}`);
  }

  async setRecommendedProducts(userId, products, ttlSeconds = 1800) {
    await this.redis.set(`recs:${userId}`, products, ttlSeconds);
  }
}

module.exports = PriceCache;
