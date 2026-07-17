/**
 * Fail-fast environment validation (Constitution Art. 9.1).
 * The application refuses to boot with an incomplete configuration.
 * In production it additionally refuses default/weak secrets (Art. 6.1).
 */
const REQUIRED_VARS = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
] as const;

const PRODUCTION_REQUIRED_VARS = [
  'REDIS_URL',
  'S3_ENDPOINT',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
] as const;

const DEFAULT_MARKERS = ['change-me', 'changeme', 'amal_dev_password', 'ChangeMe!'];

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const missing = REQUIRED_VARS.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  if (config['NODE_ENV'] === 'production') {
    const missingProd = PRODUCTION_REQUIRED_VARS.filter((key) => !config[key]);
    if (missingProd.length > 0) {
      throw new Error(
        `Missing environment variables required in production: ${missingProd.join(', ')}`,
      );
    }
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      const value = String(config[key] ?? '');
      if (value.includes('change-me') || value.length < 24) {
        throw new Error(`${key} is not production-safe (too short or default value).`);
      }
    }
    for (const key of ['S3_SECRET_KEY', 'SEED_ADMIN_PASSWORD'] as const) {
      const value = String(config[key] ?? '');
      if (DEFAULT_MARKERS.some((marker) => value.includes(marker))) {
        throw new Error(`${key} still uses a default development value; set a real secret.`);
      }
    }
    // Public origins must be explicit in production (no wildcard CORS).
    const origins = String(config['CORS_ORIGINS'] ?? '');
    if (origins.trim() === '' || origins.includes('*')) {
      throw new Error('CORS_ORIGINS must list explicit origins in production (comma-separated).');
    }
  }
  return config;
}

/** Parses CORS_ORIGINS ("https://a.com,https://b.com") into an origin list. */
export function parseCorsOrigins(raw: string | undefined): string[] | boolean {
  if (!raw || raw.trim() === '') return true; // development default: allow all
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
