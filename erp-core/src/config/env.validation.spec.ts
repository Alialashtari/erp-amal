import { parseCorsOrigins, validateEnv } from './env.validation';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://x',
    JWT_ACCESS_SECRET: 'a-sufficiently-long-secret-value-123',
    JWT_REFRESH_SECRET: 'another-sufficiently-long-secret-456',
  };

  const prodBase = {
    ...base,
    NODE_ENV: 'production',
    REDIS_URL: 'redis://prod:6379',
    S3_ENDPOINT: 'https://s3.internal',
    S3_ACCESS_KEY: 'prod-access',
    S3_SECRET_KEY: 'prod-secret-value-long',
    SEED_ADMIN_PASSWORD: 'a-real-strong-password-1!',
    CORS_ORIGINS: 'https://admin.amal.org',
  };

  it('accepts a complete configuration', () => {
    expect(validateEnv({ ...base })).toEqual(base);
  });

  it('rejects missing required variables', () => {
    expect(() => validateEnv({ DATABASE_URL: 'x' })).toThrow(/Missing required/);
  });

  it('rejects default secrets in production', () => {
    expect(() =>
      validateEnv({ ...prodBase, JWT_ACCESS_SECRET: 'change-me-access-secret' }),
    ).toThrow(/not production-safe/);
  });

  it('accepts a hardened production configuration', () => {
    expect(validateEnv({ ...prodBase })).toEqual(prodBase);
  });

  it('requires infrastructure variables in production', () => {
    const { REDIS_URL: _omitted, ...withoutRedis } = prodBase;
    expect(() => validateEnv(withoutRedis)).toThrow(/required in production/);
  });

  it('rejects default dev passwords in production', () => {
    expect(() => validateEnv({ ...prodBase, S3_SECRET_KEY: 'amal_dev_password' })).toThrow(
      /default development value/,
    );
  });

  it('requires explicit CORS origins in production (no wildcard)', () => {
    expect(() => validateEnv({ ...prodBase, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
    expect(() => validateEnv({ ...prodBase, CORS_ORIGINS: '' })).toThrow(/CORS_ORIGINS/);
  });
});

describe('parseCorsOrigins', () => {
  it('allows all origins in development when unset', () => {
    expect(parseCorsOrigins(undefined)).toBe(true);
  });

  it('parses a comma-separated origin list', () => {
    expect(parseCorsOrigins('https://a.com, https://b.com')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });
});
