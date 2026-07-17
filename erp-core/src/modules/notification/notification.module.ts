import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationService } from './notification.service';
import { NotificationProcessor } from './notification.processor';
import { NotificationsController } from './notifications.controller';
import { TemplatesController } from './templates.controller';
import {
  EMAIL_PROVIDER,
  PUSH_PROVIDER,
  SMS_PROVIDER,
} from './providers/provider.tokens';
import { DevLoggerEmailProvider } from './providers/dev-logger-email.provider';
import { DevLoggerSmsProvider } from './providers/dev-logger-sms.provider';
import { FcmReadyPushProvider } from './providers/fcm-ready-push.provider';

export const NOTIFICATIONS_QUEUE = 'notifications';

/**
 * Notification module foundation (Phase 2).
 * All outbound messages pass through here (FRS-009: no module sends on its own).
 * Channel providers are swappable behind tokens (OD-3): the concrete FCM/email/SMS
 * adapters are registered here when providers are selected; development providers
 * log deliveries and record them in delivery_logs.
 */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE })],
  controllers: [NotificationsController, TemplatesController],
  providers: [
    NotificationService,
    NotificationProcessor,
    { provide: PUSH_PROVIDER, useClass: FcmReadyPushProvider },
    { provide: EMAIL_PROVIDER, useClass: DevLoggerEmailProvider },
    { provide: SMS_PROVIDER, useClass: DevLoggerSmsProvider },
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
