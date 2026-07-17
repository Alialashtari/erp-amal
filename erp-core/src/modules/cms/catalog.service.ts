import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BannerPlacement } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CampaignsService } from '../donations/campaigns.service';
import {
  CreateBannerDto,
  CreateCategoryDto,
  CreatePopupDto,
  FeatureCampaignDto,
  MenuItemDto,
  UpdateBannerDto,
  UpdateCategoryDto,
  UpdatePopupDto,
  UpsertMenuDto,
} from './dto/catalog.dtos';

/**
 * CMS catalog objects (FRS-010): categories, banners, popups, menus and
 * featured campaigns. Campaign details come through the donations service
 * interface — never by reaching into another module's tables (Art. 3.2).
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly campaigns: CampaignsService,
  ) {}

  // ── categories ──

  async createCategory(dto: CreateCategoryDto, actorId: string) {
    const existing = await this.prisma.contentCategory.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Category slug '${dto.slug}' already exists`);
    const category = await this.prisma.contentCategory.create({
      data: { name: dto.name, nameAr: dto.nameAr, slug: dto.slug },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'cms',
      entityType: 'ContentCategory',
      entityId: (category as { id: string }).id,
      newValue: { name: dto.name, slug: dto.slug },
    });
    return category;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, actorId: string) {
    const existing = await this.prisma.contentCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');
    const category = await this.prisma.contentCategory.update({ where: { id }, data: { ...dto } });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'cms',
      entityType: 'ContentCategory',
      entityId: id,
      newValue: { changed: Object.keys(dto) },
    });
    return category;
  }

  listCategories(includeInactive = false) {
    return this.prisma.contentCategory.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { name: 'asc' },
    });
  }

  // ── banners ──

  async createBanner(dto: CreateBannerDto, actorId: string) {
    const banner = await this.prisma.banner.create({
      data: {
        title: dto.title,
        imageFileId: dto.imageFileId,
        linkUrl: dto.linkUrl,
        placement: dto.placement ?? 'WEBSITE',
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        priority: dto.priority ?? 0,
        createdBy: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'cms',
      entityType: 'Banner',
      entityId: (banner as { id: string }).id,
      newValue: { title: dto.title, placement: dto.placement ?? 'WEBSITE' },
    });
    return banner;
  }

  async updateBanner(id: string, dto: UpdateBannerDto, actorId: string) {
    const existing = await this.prisma.banner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Banner not found');
    const banner = await this.prisma.banner.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.imageFileId !== undefined ? { imageFileId: dto.imageFileId } : {}),
        ...(dto.linkUrl !== undefined ? { linkUrl: dto.linkUrl } : {}),
        ...(dto.placement !== undefined ? { placement: dto.placement } : {}),
        ...(dto.startDate !== undefined
          ? { startDate: dto.startDate ? new Date(dto.startDate) : null }
          : {}),
        ...(dto.endDate !== undefined
          ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
          : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.archived !== undefined ? { archived: dto.archived } : {}),
      },
    });
    await this.audit.log({
      userId: actorId,
      action: dto.archived ? 'ARCHIVE' : 'UPDATE',
      module: 'cms',
      entityType: 'Banner',
      entityId: id,
      newValue: { changed: Object.keys(dto) },
    });
    return banner;
  }

  listBanners(includeArchived = false) {
    return this.prisma.banner.findMany({
      where: includeArchived ? {} : { archived: false },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** Live banners for a public channel (date window + active). */
  activeBanners(placement?: BannerPlacement) {
    const now = new Date();
    return this.prisma.banner.findMany({
      where: {
        active: true,
        archived: false,
        ...(placement ? { placement } : {}),
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        imageFileId: true,
        linkUrl: true,
        placement: true,
        priority: true,
      },
    });
  }

  // ── popups ──

  async createPopup(dto: CreatePopupDto, actorId: string) {
    const popup = await this.prisma.popup.create({
      data: {
        title: dto.title,
        body: dto.body,
        imageFileId: dto.imageFileId,
        linkUrl: dto.linkUrl,
        showInApp: dto.showInApp ?? true,
        showInWebsite: dto.showInWebsite ?? true,
        startAt: dto.startAt ? new Date(dto.startAt) : undefined,
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
        createdBy: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'cms',
      entityType: 'Popup',
      entityId: (popup as { id: string }).id,
      newValue: { title: dto.title },
    });
    return popup;
  }

  async updatePopup(id: string, dto: UpdatePopupDto, actorId: string) {
    const existing = await this.prisma.popup.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Popup not found');
    const popup = await this.prisma.popup.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.imageFileId !== undefined ? { imageFileId: dto.imageFileId } : {}),
        ...(dto.linkUrl !== undefined ? { linkUrl: dto.linkUrl } : {}),
        ...(dto.showInApp !== undefined ? { showInApp: dto.showInApp } : {}),
        ...(dto.showInWebsite !== undefined ? { showInWebsite: dto.showInWebsite } : {}),
        ...(dto.startAt !== undefined ? { startAt: dto.startAt ? new Date(dto.startAt) : null } : {}),
        ...(dto.endAt !== undefined ? { endAt: dto.endAt ? new Date(dto.endAt) : null } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.archived !== undefined ? { archived: dto.archived } : {}),
      },
    });
    await this.audit.log({
      userId: actorId,
      action: dto.archived ? 'ARCHIVE' : 'UPDATE',
      module: 'cms',
      entityType: 'Popup',
      entityId: id,
      newValue: { changed: Object.keys(dto) },
    });
    return popup;
  }

  listPopups(includeArchived = false) {
    return this.prisma.popup.findMany({
      where: includeArchived ? {} : { archived: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  activePopups(channel?: 'app' | 'website') {
    const now = new Date();
    return this.prisma.popup.findMany({
      where: {
        active: true,
        archived: false,
        ...(channel === 'app' ? { showInApp: true } : {}),
        ...(channel === 'website' ? { showInWebsite: true } : {}),
        OR: [{ startAt: null }, { startAt: { lte: now } }],
        AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, body: true, imageFileId: true, linkUrl: true },
    });
  }

  // ── menus ──

  /** Full-replace upsert of a menu and its item tree (admin-managed). */
  async upsertMenu(dto: UpsertMenuDto, actorId: string) {
    const menu = await this.prisma.menu.upsert({
      where: { key: dto.key },
      create: { key: dto.key, title: dto.title, active: dto.active ?? true },
      update: { title: dto.title, active: dto.active ?? true },
    });
    const menuId = (menu as { id: string }).id;
    // Menu items are structural configuration, not institutional records:
    // full replace keeps the tree consistent (audited below).
    await this.prisma.menuItem.deleteMany({ where: { menuId } });
    await this.createMenuItems(menuId, null, dto.items);
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'cms',
      entityType: 'Menu',
      entityId: menuId,
      newValue: { key: dto.key, itemCount: dto.items.length },
    });
    return this.getMenu(dto.key);
  }

  private async createMenuItems(
    menuId: string,
    parentId: string | null,
    items: MenuItemDto[],
  ): Promise<void> {
    let index = 0;
    for (const item of items) {
      if (!item.url && !item.contentId) {
        throw new BadRequestException(`Menu item '${item.label}' needs a url or contentId`);
      }
      const created = await this.prisma.menuItem.create({
        data: {
          menuId,
          parentId,
          label: item.label,
          labelAr: item.labelAr,
          url: item.url,
          contentId: item.contentId,
          order: item.order ?? index,
          active: item.active ?? true,
        },
      });
      if (item.children?.length) {
        await this.createMenuItems(menuId, (created as { id: string }).id, item.children);
      }
      index += 1;
    }
  }

  async getMenu(key: string) {
    const menu = await this.prisma.menu.findUnique({
      where: { key },
      include: { items: { where: { parentId: null }, orderBy: { order: 'asc' } } },
    });
    if (!menu) throw new NotFoundException(`Menu '${key}' not found`);
    const m = menu as { id: string; items: { id: string }[] };
    const withChildren = await Promise.all(
      m.items.map(async (item) => ({
        ...item,
        children: await this.prisma.menuItem.findMany({
          where: { parentId: item.id },
          orderBy: { order: 'asc' },
        }),
      })),
    );
    return { ...menu, items: withChildren };
  }

  listMenus() {
    return this.prisma.menu.findMany({ orderBy: { key: 'asc' } });
  }

  // ── featured campaigns ──

  async featureCampaign(dto: FeatureCampaignDto, actorId: string) {
    // Validates existence through the owner module's service (Art. 3.2).
    await this.campaigns.findOne(dto.campaignId);
    const featured = await this.prisma.featuredCampaign.upsert({
      where: { campaignId: dto.campaignId },
      create: {
        campaignId: dto.campaignId,
        order: dto.order ?? 0,
        visible: dto.visible ?? true,
        createdBy: actorId,
      },
      update: {
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.visible !== undefined ? { visible: dto.visible } : {}),
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'cms',
      entityType: 'FeaturedCampaign',
      entityId: (featured as { id: string }).id,
      newValue: { campaignId: dto.campaignId, order: dto.order ?? 0, visible: dto.visible ?? true },
    });
    return featured;
  }

  async unfeatureCampaign(campaignId: string, actorId: string) {
    const existing = await this.prisma.featuredCampaign.findUnique({ where: { campaignId } });
    if (!existing) throw new NotFoundException('Campaign is not featured');
    await this.prisma.featuredCampaign.delete({ where: { campaignId } });
    await this.audit.log({
      userId: actorId,
      action: 'DELETE',
      module: 'cms',
      entityType: 'FeaturedCampaign',
      entityId: (existing as { id: string }).id,
      oldValue: { campaignId },
    });
    return { removed: true };
  }

  listFeatured() {
    return this.prisma.featuredCampaign.findMany({ orderBy: { order: 'asc' } });
  }

  /** Public: visible featured campaigns with donor-safe campaign fields. */
  async publicFeatured() {
    const featured = (await this.prisma.featuredCampaign.findMany({
      where: { visible: true },
      orderBy: { order: 'asc' },
    })) as { campaignId: string; order: number }[];
    const results: unknown[] = [];
    for (const f of featured) {
      try {
        const campaign = (await this.campaigns.findOne(f.campaignId)) as Record<string, unknown>;
        if (campaign.status !== 'ACTIVE' && campaign.status !== 'COMPLETED') continue;
        results.push({
          order: f.order,
          id: campaign.id,
          name: campaign.name,
          nameAr: campaign.nameAr,
          type: campaign.type,
          status: campaign.status,
          coverImageFileId: campaign.coverImageFileId,
        });
      } catch {
        // Campaign no longer resolvable — skip from public list.
      }
    }
    return results;
  }
}
