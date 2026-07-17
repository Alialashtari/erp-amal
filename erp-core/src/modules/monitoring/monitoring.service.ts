import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';

/** Every BullMQ queue in the platform (kept in sync with module registrations). */
export const PLATFORM_QUEUES = [
  'notifications',
  'donations-recurring',
  'subscriptions-billing',
  'cms',
  'communication',
  'analytics',
] as const;

export interface QueueHealth {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  paused: boolean;
}

/**
 * Operational monitoring (Constitution Art. 9.3): application, queue and
 * database health must be observable. Read-only diagnostics — no mutations.
 */
@Injectable()
export class MonitoringService implements OnModuleDestroy {
  private readonly queues: Queue[];

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const url = new URL(config.get<string>('REDIS_URL', 'redis://localhost:6379'));
    const connection = {
      host: url.hostname,
      port: url.port ? Number(url.port) : 6379,
      ...(url.password ? { password: url.password } : {}),
    };
    this.queues = PLATFORM_QUEUES.map((name) => new Queue(name, { connection }));
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.queues.map((q) => q.close()));
  }

  /** Queue depths and failure counts (Art. 9.3: background jobs observable). */
  async queueHealth(): Promise<QueueHealth[]> {
    return Promise.all(
      this.queues.map(async (queue) => {
        const [counts, paused] = await Promise.all([
          queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'),
          queue.isPaused(),
        ]);
        return {
          name: queue.name,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
          completed: counts.completed ?? 0,
          paused,
        };
      }),
    );
  }

  /** Database round-trip latency in milliseconds. */
  async databaseLatency(): Promise<{ status: string; latencyMs: number | null }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', latencyMs: Date.now() - start };
    } catch {
      return { status: 'down', latencyMs: null };
    }
  }

  /** Process-level metrics for dashboards and alerting. */
  processMetrics() {
    const memory = process.memoryUsage();
    return {
      uptimeSeconds: Math.round(process.uptime()),
      memory: {
        rssMb: Math.round(memory.rss / 1024 / 1024),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
      },
      node: process.version,
      pid: process.pid,
    };
  }

  /** Recent failed notification deliveries (operational alert surface). */
  async recentDeliveryFailures(limit = 20) {
    return this.prisma.notificationRecord.findMany({
      where: { status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      select: { id: true, channel: true, templateKey: true, error: true, createdAt: true },
    });
  }

  async full() {
    const [queues, database, failures] = await Promise.all([
      this.queueHealth(),
      this.databaseLatency(),
      this.recentDeliveryFailures(10),
    ]);
    return {
      timestamp: new Date().toISOString(),
      database,
      queues,
      process: this.processMetrics(),
      recentDeliveryFailures: failures,
    };
  }
}
