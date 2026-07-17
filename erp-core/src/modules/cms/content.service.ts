import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentStatus, ContentType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CommunicationService } from '../communication/communication.service';
import { canTransition, isValidSlug, permissionForTransition } from './content-rules';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { QueryContentDto } from './dto/query-content.dto';

/** Fields captured in every immutable revision snapshot (FRS-010). */
const SNAPSHOT_FIELDS = [
  'type',
  'title',
  'slug',
  'summary',
  'body',
  'featuredImageFileId',
  'categoryId',
  'tags',
  'locale',
  'showInApp',
  'showInWebsite',
  'metaTitle',
  'metaDescription',
  'metaKeywords',
  'ogImageFileId',
] as const;

/**
 * CMS content engine (Phase 7, FRS-010). Owner of ContentItem, ContentRevision,
 * ContentCategory (Data Ownership Model §3). Everything users see on the app
 * and website is manageable here without code changes (Hub Model: channels
 * consume ERP-published content through public APIs).
 *
 * Rules: guarded lifecycle (review → approve → publish, separation of duties);
 * every edit writes an immutable revision; archive only, never delete
 * (Art. 4.4); binaries live in MinIO via StoredFile ids (Art. 3.5).
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly communication: CommunicationService,
  ) {}

  async create(dto: CreateContentDto, actorId: string) {
    if (!isValidSlug(dto.slug)) throw new BadRequestException('Invalid slug format');
    await this.assertSlugFree(dto.type, dto.slug);
    if (dto.categoryId) await this.assertCategory(dto.categoryId);

    const item = await this.prisma.contentItem.create({
      data: {
        type: dto.type,
        title: dto.title,
        slug: dto.slug,
        summary: dto.summary,
        body: dto.body ?? '',
        featuredImageFileId: dto.featuredImageFileId,
        categoryId: dto.categoryId,
        tags: dto.tags ?? [],
        locale: dto.locale ?? 'ar',
        showInApp: dto.showInApp ?? false,
        showInWebsite: dto.showInWebsite ?? true,
        publishAt: dto.publishAt ? new Date(dto.publishAt) : undefined,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        metaKeywords: dto.metaKeywords ?? [],
        ogImageFileId: dto.ogImageFileId,
        authorId: actorId,
      },
    });
    await this.snapshot(item as Record<string, unknown>, 1, actorId);
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'cms',
      entityType: 'ContentItem',
      entityId: (item as { id: string }).id,
      newValue: { type: dto.type, slug: dto.slug, title: dto.title },
    });
    return item;
  }

  async update(id: string, dto: UpdateContentDto, actorId: string) {
    const existing = await this.findOne(id);
    const e = existing as { status: ContentStatus; type: ContentType; slug: string; version: number };
    if (e.status === 'ARCHIVED') {
      throw new BadRequestException('Archived content must be restored before editing');
    }
    if (dto.slug && dto.slug !== e.slug) {
      if (!isValidSlug(dto.slug)) throw new BadRequestException('Invalid slug format');
      await this.assertSlugFree(e.type, dto.slug);
    }
    if (dto.categoryId) await this.assertCategory(dto.categoryId);

    const nextVersion = e.version + 1;
    const item = await this.prisma.contentItem.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.summary !== undefined ? { summary: dto.summary } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.featuredImageFileId !== undefined
          ? { featuredImageFileId: dto.featuredImageFileId }
          : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
        ...(dto.showInApp !== undefined ? { showInApp: dto.showInApp } : {}),
        ...(dto.showInWebsite !== undefined ? { showInWebsite: dto.showInWebsite } : {}),
        ...(dto.publishAt !== undefined
          ? { publishAt: dto.publishAt ? new Date(dto.publishAt) : null }
          : {}),
        ...(dto.metaTitle !== undefined ? { metaTitle: dto.metaTitle } : {}),
        ...(dto.metaDescription !== undefined ? { metaDescription: dto.metaDescription } : {}),
        ...(dto.metaKeywords !== undefined ? { metaKeywords: dto.metaKeywords } : {}),
        ...(dto.ogImageFileId !== undefined ? { ogImageFileId: dto.ogImageFileId } : {}),
        version: nextVersion,
      },
    });
    await this.snapshot(item as Record<string, unknown>, nextVersion, actorId);
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'cms',
      entityType: 'ContentItem',
      entityId: id,
      newValue: { version: nextVersion, changed: Object.keys(dto) },
    });
    return item;
  }

  /**
   * Guarded lifecycle transition. The permission depends on the target state
   * (editors submit, reviewers approve, publishers publish — FRS-010 workflow).
   */
  async transition(
    id: string,
    to: ContentStatus,
    actor: { userId: string; permissions: string[] },
  ) {
    const existing = await this.findOne(id);
    const e = existing as { status: ContentStatus; publishAt: Date | null };
    if (!canTransition(e.status, to)) {
      throw new BadRequestException(`Cannot transition content from ${e.status} to ${to}`);
    }
    const required = permissionForTransition(e.status, to);
    if (!actor.permissions.includes(required)) {
      throw new ForbiddenException(`Transition requires permission '${required}'`);
    }
    // APPROVED content with a future publishAt is published by the scheduler.
    if (to === 'PUBLISHED' && e.publishAt && e.publishAt.getTime() > Date.now()) {
      throw new BadRequestException(
        'Content is scheduled; it will be published automatically at publishAt',
      );
    }

    const item = await this.prisma.contentItem.update({
      where: { id },
      data: {
        status: to,
        ...(to === 'APPROVED' ? { reviewedBy: actor.userId } : {}),
        ...(to === 'PUBLISHED'
          ? { publishedBy: actor.userId, publishedAt: new Date(), unpublishedAt: null }
          : {}),
        ...(to === 'UNPUBLISHED' ? { unpublishedAt: new Date() } : {}),
      },
    });
    await this.audit.log({
      userId: actor.userId,
      action: to === 'ARCHIVED' ? 'ARCHIVE' : 'UPDATE',
      module: 'cms',
      entityType: 'ContentItem',
      entityId: id,
      oldValue: { status: e.status },
      newValue: { status: to },
    });
    if (to === 'PUBLISHED') await this.notifyPublished(id);
    return item;
  }

  /** Publishes due APPROVED items (called by the CMS scheduler queue). */
  async publishDueScheduled(): Promise<number> {
    const due = (await this.prisma.contentItem.findMany({
      where: { status: 'APPROVED', publishAt: { lte: new Date() } },
      select: { id: true },
    })) as { id: string }[];
    for (const { id } of due) {
      await this.prisma.contentItem.update({
        where: { id },
        data: { status: 'PUBLISHED', publishedAt: new Date(), unpublishedAt: null },
      });
      await this.audit.log({
        userId: null,
        action: 'UPDATE',
        module: 'cms',
        entityType: 'ContentItem',
        entityId: id,
        newValue: { status: 'PUBLISHED', by: 'scheduler' },
      });
      await this.notifyPublished(id);
    }
    return due.length;
  }

  async findMany(query: QueryContentDto) {
    const take = Math.min(query.limit ?? 25, 100);
    const where: Prisma.ContentItemWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { body: { contains: query.search, mode: 'insensitive' } },
              { tags: { has: query.search } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.contentItem.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take,
        skip: query.offset ?? 0,
        include: { category: true },
      }),
      this.prisma.contentItem.count({ where }),
    ]);
    return { items, total, limit: take, offset: query.offset ?? 0 };
  }

  async findOne(id: string) {
    const item = await this.prisma.contentItem.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!item) throw new NotFoundException('Content not found');
    return item;
  }

  async listRevisions(id: string) {
    await this.findOne(id);
    return this.prisma.contentRevision.findMany({
      where: { contentId: id },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, editedBy: true, createdAt: true },
    });
  }

  /** Restores an old revision as a new version (history stays intact). */
  async restoreRevision(id: string, version: number, actorId: string) {
    const existing = await this.findOne(id);
    const e = existing as { version: number; status: ContentStatus; type: ContentType };
    if (e.status === 'ARCHIVED') {
      throw new BadRequestException('Archived content must be restored before editing');
    }
    const revision = await this.prisma.contentRevision.findUnique({
      where: { contentId_version: { contentId: id, version } },
    });
    if (!revision) throw new NotFoundException(`Revision ${version} not found`);
    const snap = (revision as { snapshot: Record<string, unknown> }).snapshot;

    // Slug from the snapshot may now collide with newer content.
    const slug = snap.slug as string;
    const clash = await this.prisma.contentItem.findFirst({
      where: { type: e.type, slug, NOT: { id } },
      select: { id: true },
    });
    if (clash) throw new ConflictException('Snapshot slug now belongs to another item');

    const nextVersion = e.version + 1;
    const item = await this.prisma.contentItem.update({
      where: { id },
      data: {
        title: snap.title as string,
        slug,
        summary: (snap.summary as string | null) ?? null,
        body: (snap.body as string) ?? '',
        featuredImageFileId: (snap.featuredImageFileId as string | null) ?? null,
        categoryId: (snap.categoryId as string | null) ?? null,
        tags: (snap.tags as string[]) ?? [],
        locale: (snap.locale as string) ?? 'ar',
        showInApp: Boolean(snap.showInApp),
        showInWebsite: Boolean(snap.showInWebsite),
        metaTitle: (snap.metaTitle as string | null) ?? null,
        metaDescription: (snap.metaDescription as string | null) ?? null,
        metaKeywords: (snap.metaKeywords as string[]) ?? [],
        ogImageFileId: (snap.ogImageFileId as string | null) ?? null,
        version: nextVersion,
      },
    });
    await this.snapshot(item as Record<string, unknown>, nextVersion, actorId);
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'cms',
      entityType: 'ContentItem',
      entityId: id,
      newValue: { restoredFromVersion: version, newVersion: nextVersion },
    });
    return item;
  }

  /** CMS dashboard counters (FRS-010). */
  async dashboard() {
    const [pages, news, articles, published, inReview, banners, popups, recent] =
      await Promise.all([
        this.prisma.contentItem.count({ where: { type: 'PAGE', status: { not: 'ARCHIVED' } } }),
        this.prisma.contentItem.count({ where: { type: 'NEWS', status: { not: 'ARCHIVED' } } }),
        this.prisma.contentItem.count({
          where: { type: 'ARTICLE', status: { not: 'ARCHIVED' } },
        }),
        this.prisma.contentItem.count({ where: { status: 'PUBLISHED' } }),
        this.prisma.contentItem.count({ where: { status: 'IN_REVIEW' } }),
        this.prisma.banner.count({ where: { archived: false } }),
        this.prisma.popup.count({ where: { archived: false } }),
        this.prisma.contentItem.findMany({
          where: { status: 'PUBLISHED' },
          orderBy: { publishedAt: 'desc' },
          take: 10,
          select: { id: true, type: true, title: true, slug: true, publishedAt: true },
        }),
      ]);
    return { pages, news, articles, published, inReview, banners, popups, recentPublished: recent };
  }

  // ── helpers ──

  private async assertSlugFree(type: ContentType, slug: string) {
    const existing = await this.prisma.contentItem.findUnique({
      where: { type_slug: { type, slug } },
      select: { id: true },
    });
    if (existing) throw new ConflictException(`Slug '${slug}' already exists for type ${type}`);
  }

  private async assertCategory(categoryId: string) {
    const category = await this.prisma.contentCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, active: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (!(category as { active: boolean }).active) {
      throw new BadRequestException('Category is inactive');
    }
  }

  private async snapshot(item: Record<string, unknown>, version: number, editedBy: string) {
    const snapshot: Record<string, unknown> = {};
    for (const field of SNAPSHOT_FIELDS) snapshot[field] = item[field] ?? null;
    await this.prisma.contentRevision.create({
      data: {
        contentId: item.id as string,
        version,
        snapshot: snapshot as Prisma.InputJsonValue,
        editedBy,
      },
    });
  }

  /** FRS-010: notify users when new public content is published. */
  private async notifyPublished(id: string) {
    const item = (await this.prisma.contentItem.findUnique({
      where: { id },
      select: { type: true, title: true, slug: true, showInApp: true, showInWebsite: true },
    })) as { type: ContentType; title: string; slug: string; showInApp: boolean } | null;
    if (!item || item.type === 'PAGE' || !item.showInApp) return; // pages are static; app-only pushes
    await this.communication.announceContentPublished({
      title: item.title,
      type: item.type,
      slug: item.slug,
    });
  }
}
