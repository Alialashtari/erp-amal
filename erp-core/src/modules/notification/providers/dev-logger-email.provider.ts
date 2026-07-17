import { Injectable, Logger } from '@nestjs/common';
import { EmailMessage, EmailProvider, ProviderResult } from './provider.interfaces';

/** Development email provider (OD-3 pending). Logs instead of sending. */
@Injectable()
export class DevLoggerEmailProvider implements EmailProvider {
  private readonly logger = new Logger(DevLoggerEmailProvider.name);

  async send(message: EmailMessage): Promise<ProviderResult> {
    this.logger.log(`[dev email] to=${message.to} subject="${message.subject}"`);
    return { ok: true, providerName: 'dev-logger-email', response: 'logged (no provider configured)' };
  }
}
