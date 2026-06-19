const { redis, TEST_TIMEOUT } = require('./setup');
const SessionCache = require('../src/session-cache');

let sessionCache;

beforeAll(async () => {
  sessionCache = new SessionCache(redis);
}, TEST_TIMEOUT);

beforeEach(async () => {
  if (redis.client.status === 'ready') {
    await redis.flushAll(true);
  }
}, TEST_TIMEOUT);

describe('SESSION CACHE — Basic Session Management', () => {
  test('TC-SS-01: Create session — session baru tersimpan', async () => {
    const session = await sessionCache.createSession('sess:1', { userId: 1, name: 'Alice' }, 3600);
    expect(session.userId).toBe(1);
    expect(session.name).toBe('Alice');
    expect(session.createdAt).toBeDefined();
  }, TEST_TIMEOUT);

  test('TC-SS-02: Get session — baca data session', async () => {
    await sessionCache.createSession('sess:1', { userId: 1, name: 'Alice' }, 3600);
    const session = await sessionCache.getSession('sess:1');
    expect(session.name).toBe('Alice');
  }, TEST_TIMEOUT);

  test('TC-SS-03: Validate session — session valid', async () => {
    await sessionCache.createSession('sess:1', { userId: 1 }, 3600);
    const result = await sessionCache.validateSession('sess:1');
    expect(result.valid).toBe(true);
    expect(result.session.userId).toBe(1);
  }, TEST_TIMEOUT);

  test('TC-SS-04: Validate session — session tidak ada return invalid', async () => {
    const result = await sessionCache.validateSession('nonexistent');
    expect(result.valid).toBe(false);
  }, TEST_TIMEOUT);
});

describe('SESSION CACHE — Session Lifecycle', () => {
  test('TC-SS-05: Refresh session — perpanjang TTL session', async () => {
    await sessionCache.createSession('sess:1', { userId: 1 }, 2);
    await new Promise(r => setTimeout(r, 1000));
    const refreshed = await sessionCache.refreshSession('sess:1', 10);
    expect(refreshed).not.toBeNull();
    expect(refreshed.lastAccess).toBeGreaterThan(refreshed.createdAt);
    await new Promise(r => setTimeout(r, 2000));
    const session = await sessionCache.getSession('sess:1');
    expect(session).not.toBeNull();
  }, TEST_TIMEOUT);

  test('TC-SS-06: Destroy session — hapus session', async () => {
    await sessionCache.createSession('sess:1', { userId: 1 }, 3600);
    await sessionCache.destroySession('sess:1');
    const session = await sessionCache.getSession('sess:1');
    expect(session).toBeNull();
  }, TEST_TIMEOUT);

  test('TC-SS-07: Session TTL — session expired otomatis', async () => {
    await sessionCache.createSession('sess:1', { userId: 1 }, 1);
    await new Promise(r => setTimeout(r, 1100));
    const session = await sessionCache.getSession('sess:1');
    expect(session).toBeNull();
  }, TEST_TIMEOUT);
});

describe('SESSION CACHE — Token & Security', () => {
  test('TC-SS-08: Token blacklist — token yang di-blacklist tidak valid', async () => {
    await sessionCache.blacklistToken('token:abc', 86400);
    const blacklisted = await sessionCache.isTokenBlacklisted('token:abc');
    expect(blacklisted).toBe(true);
    const notBlacklisted = await sessionCache.isTokenBlacklisted('token:xyz');
    expect(notBlacklisted).toBe(false);
  }, TEST_TIMEOUT);

  test('TC-SS-09: Login rate limit — percobaan login dibatasi', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await sessionCache.rateLimitLogin('user:1', 5, 300);
      expect(r.allowed).toBe(true);
    }
    const r = await sessionCache.rateLimitLogin('user:1', 5, 300);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  }, TEST_TIMEOUT);
});

describe('SESSION CACHE — Data Update', () => {
  test('TC-SS-10: Update session data — update sebagian field', async () => {
    await sessionCache.createSession('sess:1', { userId: 1, name: 'Alice', role: 'user' }, 3600);
    const updated = await sessionCache.updateSessionData('sess:1', { role: 'admin' });
    expect(updated.role).toBe('admin');
    expect(updated.name).toBe('Alice');
  }, TEST_TIMEOUT);

  test('TC-SS-11: Active sessions — session user yang masih aktif', async () => {
    await sessionCache.createSession('sess:1', { userId: 1, name: 'Alice' }, 3600);
    await sessionCache.createSession('sess:2', { userId: 1, name: 'Alice' }, 3600);
    await sessionCache.createSession('sess:3', { userId: 2, name: 'Bob' }, 3600);
    const activeSessions = await sessionCache.getActiveSessions(1);
    expect(activeSessions.length).toBe(2);
  }, TEST_TIMEOUT);
});
