import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BannerPlacement, ContentType } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from './catalog.service';

/** Whitelisted fields for public content delivery (no author/reviewer ids). */
const PUBLIC_CONTENT_SELECT = {
  id: true,
  type: true,
  title: true,
  slug: true,
  summary: true,
  featuredImageFileId: true,
  tags: true,
  locale: true,
  publishedAt: true,
  category: { select: { name: true, nameAr: true, slug: true } },
} as const;

/**
 * Public CMS delivery APIs (Hub Model): the website and mobile app render
 * ERP-published content. PUBLISHED items only, channel-filtered, field
 * whitelist — never internal workflow or authorship data.
 */
@ApiTags('public')
@Controller('public')
export class PublicCmsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  @Public()
  @Get('content')
  async listContent(
    @Query('type') type?: ContentType,
    @Query('channel') channel?: 'app' | 'website',
    @Query('category') category?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const take = Math.min(limit ? Number(limit) : 25, 100);
    const where = {
      status: 'PUBLISHED' as const,
      ...(type && Object.values(ContentType).includes(type) ? { type } : {}),
      ...(channel === 'app' ? { showInApp: true } : {}),
      ...(channel === 'website' ? { showInWebsite: true } : {}),
      ...(category ? { category: { slug: category } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.contentItem.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        take,
        skip: offset ? Number(offset) : 0,
        select: PUBLIC_CONTENT_SELECT,
      }),
      this.prisma.contentItem.count({ where }),
    ]);
    return { items, total };
  }

  @Public()
  @Get('content/:type/:slug')
  async getContent(@Param('type') typeParam: string, @Param('slug') slug: string) {
    const type = typeParam.toUpperCase() as ContentType;
    if (!Object.values(ContentType).includes(type)) {
      throw new NotFoundException('Content not found');
    }
    const item = await this.prisma.contentItem.findFirst({
      where: { type, slug, status: 'PUBLISHED' },
      select: {
        ...PUBLIC_CONTENT_SELECT,
        body: true,
        metaTitle: true,
        metaDescription: true,
        metaKeywords: true,
        ogImageFileId: true,
      },
    });
    if (!item) throw new NotFoundException('Content not found');
    return item;
  }

  @Public()
  @Get('banners')
  banners(@Query('placement') placement?: BannerPlacement) {
    const valid = placement && Object.values(BannerPlacement).includes(placement);
    return this.catalog.activeBanners(valid ? placement : undefined);
  }

  @Public()
  @Get('popups')
  popups(@Query('channel') channel?: 'app' | 'website') {
    return this.catalog.activePopups(channel);
  }

  @Public()
  @Get('menus/:key')
  async menu(@Param('key') key: string) {
    const menu = (await this.catalog.getMenu(key)) as {
      key: string;
      title: string;
      active: boolean;
      items: unknown[];
    };
    if (!menu.active) throw new NotFoundException(`Menu '${key}' not found`);
    return { key: menu.key, title: menu.title, items: menu.items };
  }

  @Public()
  @Get('featured-campaigns')
  featuredCampaigns() {
    return this.catalog.publicFeatured();
  }
}
