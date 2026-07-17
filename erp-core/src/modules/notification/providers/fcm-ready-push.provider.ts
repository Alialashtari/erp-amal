import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushMessage, PushProvider, ProviderResult } from './provider.interfaces';

/**
 * FCM-ready push provider.
 * The concrete FCM HTTP v1 adapter plugs in here during mobile integration
 * (Integration Architecture §9 stage 2); it requires FCM_SERVICE_ACCOUNT_JSON.
 * Until configured, deliveries are logged (development behavior) and marked
 * with providerName "dev-logger-push" in delivery_logs, never silently dropped.
 */
@Injectable()
export class FcmReadyPushProvider implements PushProvider {
  private readonly logger = new Logger(FcmReadyPushProvider.name);
  private readonly configured: boolean;

  constructor(config: ConfigService) {
    this.configured = Boolean(config.get<string>('FCM_SERVICE_ACCOUNT_JSON'));
  }

  async send(message: PushMessage): Promise<ProviderResult> {
    if (!this.configured) {
      this.logger.log(`[dev push] to=${message.token.slice(0, 12)}… title="${message.title}"`);
      return { ok: true, providerName: 'dev-logger-push', response: 'logged (FCM not configured)' };
    }
    // FCM HTTP v1 adapter is added with the mobile integration phase (ADR catalog OD-3 / Integration §9).
    return {
      ok: false,
      providerName: 'fcm',
      response: 'FCM adapter not yet enabled for this build',
    };
  }
}
