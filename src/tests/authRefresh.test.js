/**
 * @file authRefresh.test.js
 * @description Comprehensive unit and integration tests for authentication, JWT issuance,
 * and seamless refresh token rotation without session drops.
 */

const request = require('supertest');
const app = require('../app');
const { generateToken, verifyToken } = require('../utils/crypto');
const config = require('../config');

// Extended timeout for database connection initialization
jest.setTimeout(30000);

describe('Authentication & Seamless Refresh Token Pipeline', () => {
  let validRefreshToken = null;
  let validAccessToken = null;

  test('1. POST /api/v1/auth/login succeeds and returns robust token payload', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@mastercrm.com',
        password: 'Password123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();

    // Verify both top-level and nested token fields exist for frontend compatibility
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.tokens).toBeDefined();
    expect(res.body.data.tokens.accessToken).toBe(res.body.data.accessToken);
    expect(res.body.data.tokens.refreshToken).toBe(res.body.data.refreshToken);

    validAccessToken = res.body.data.accessToken;
    validRefreshToken = res.body.data.refreshToken;

    // Verify access token is cryptographically valid
    const secret = config.jwt.secret || config.jwt.accessSecret;
    const decoded = verifyToken(validAccessToken, secret);
    expect(decoded.userId).toBeDefined();
    expect(decoded.email).toBe('admin@mastercrm.com');
  });

  test('2. POST /api/v1/auth/refresh seamlessly rotates tokens without logging out', async () => {
    expect(validRefreshToken).toBeDefined();

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: validRefreshToken,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();

    // Must return both top-level and nested tokens so frontend client.js never gets undefined
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.tokens).toBeDefined();
    expect(res.body.data.tokens.accessToken).toBe(res.body.data.accessToken);
    expect(res.body.data.tokens.refreshToken).toBe(res.body.data.refreshToken);

    // Verify new access token works on a protected endpoint
    const newAccessToken = res.body.data.token;
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${newAccessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.data.email).toBe('admin@mastercrm.com');
  });

  test('3. POST /api/v1/auth/refresh rejects invalid or malformed tokens with 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: 'invalid_malformed_token_string',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('4. POST /api/v1/auth/refresh rejects expired refresh tokens with 401', async () => {
    // Generate an already expired token
    const refreshSecret = config.jwt.refreshSecret || config.jwt.secret || config.jwt.accessSecret;
    const expiredToken = generateToken(
      { userId: '66666666-6666-6666-6666-666666666601', tokenType: 'refresh' },
      refreshSecret,
      '0s'
    );

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: expiredToken,
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
