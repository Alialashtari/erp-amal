import { Injectable, Logger } from '@nestjs/common';
import { SmsMessage, SmsProvider, ProviderResult } from './provider.interfaces';

/** Development SMS provider (OD-3 pending). Logs instead of sending. */
@Injectable()
export class DevLoggerSmsProvider implements SmsProvider {
  private readonly logger = new Logger(DevLoggerSmsProvider.name);

  async send(message: SmsMessage): Promise<ProviderResult> {
    this.logger.log(`[dev sms] to=${message.to} len=${message.text.length}`);
    return { ok: true, providerName: 'dev-logger-sms', response: 'logged (no provider configured)' };
  }
}
