import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';

/**
 * Monitoring module (production hardening, Constitution Art. 9.3):
 * queue health, database latency, process metrics, delivery-failure surface.
 * Read-only; permission-protected (`monitoring.view`).
 */
@Module({
  controllers: [MonitoringController],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
