import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { ContentService } from './content.service';
import { CatalogService } from './catalog.service';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { QueryContentDto } from './dto/query-content.dto';
import { TransitionContentDto } from './dto/transition-content.dto';
import {
  CreateBannerDto,
  CreateCategoryDto,
  CreatePopupDto,
  FeatureCampaignDto,
  UpdateBannerDto,
  UpdateCategoryDto,
  UpdatePopupDto,
  UpsertMenuDto,
} from './dto/catalog.dtos';

@ApiTags('cms')
@ApiBearerAuth()
@Controller('cms')
export class CmsController {
  constructor(
    private readonly content: ContentService,
    private readonly catalog: CatalogService,
  ) {}

  @Get('dashboard')
  @RequirePermissions('cms.view')
  dashboard() {
    return this.content.dashboard();
  }

  // ── content (pages / news / articles) ──

  @Post('content')
  @RequirePermissions('cms.manage')
  createContent(@Body() dto: CreateContentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.content.create(dto, user.userId);
  }

  @Get('content')
  @RequirePermissions('cms.view')
  listContent(@Query() query: QueryContentDto) {
    return this.content.findMany(query);
  }

  @Get('content/:id')
  @RequirePermissions('cms.view')
  getContent(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.findOne(id);
  }

  @Patch('content/:id')
  @RequirePermissions('cms.manage')
  updateContent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.content.update(id, dto, user.userId);
  }

  /** Lifecycle: submit / approve / publish / unpublish / archive / restore. */
  @Post('content/:id/transition')
  @RequirePermissions('cms.view')
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionContentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.content.transition(id, dto.status, {
      userId: user.userId,
      permissions: user.permissions,
    });
  }

  @Get('content/:id/revisions')
  @RequirePermissions('cms.view')
  revisions(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.listRevisions(id);
  }

  @Post('content/:id/revisions/:version/restore')
  @RequirePermissions('cms.manage')
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version', ParseIntPipe) version: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.content.restoreRevision(id, version, user.userId);
  }

  // ── categories ──

  @Post('categories')
  @RequirePermissions('cms.manage')
  createCategory(@Body() dto: CreateCategoryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.catalog.createCategory(dto, user.userId);
  }

  @Get('categories')
  @RequirePermissions('cms.view')
  listCategories(@Query('includeInactive') includeInactive?: string) {
    return this.catalog.listCategories(includeInactive === 'true');
  }

  @Patch('categories/:id')
  @RequirePermissions('cms.manage')
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalog.updateCategory(id, dto, user.userId);
  }

  // ── banners ──

  @Post('banners')
  @RequirePermissions('cms.manage')
  createBanner(@Body() dto: CreateBannerDto, @CurrentUser() user: AuthenticatedUser) {
    return this.catalog.createBanner(dto, user.userId);
  }

  @Get('banners')
  @RequirePermissions('cms.view')
  listBanners(@Query('includeArchived') includeArchived?: string) {
    return this.catalog.listBanners(includeArchived === 'true');
  }

  @Patch('banners/:id')
  @RequirePermissions('cms.manage')
  updateBanner(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBannerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalog.updateBanner(id, dto, user.userId);
  }

  // ── popups ──

  @Post('popups')
  @RequirePermissions('cms.manage')
  createPopup(@Body() dto: CreatePopupDto, @CurrentUser() user: AuthenticatedUser) {
    return this.catalog.createPopup(dto, user.userId);
  }

  @Get('popups')
  @RequirePermissions('cms.view')
  listPopups(@Query('includeArchived') includeArchived?: string) {
    return this.catalog.listPopups(includeArchived === 'true');
  }

  @Patch('popups/:id')
  @RequirePermissions('cms.manage')
  updatePopup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePopupDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalog.updatePopup(id, dto, user.userId);
  }

  // ── menus ──

  @Get('menus')
  @RequirePermissions('cms.view')
  listMenus() {
    return this.catalog.listMenus();
  }

  @Get('menus/:key')
  @RequirePermissions('cms.view')
  getMenu(@Param('key') key: string) {
    return this.catalog.getMenu(key);
  }

  @Post('menus')
  @RequirePermissions('cms.manage')
  upsertMenu(@Body() dto: UpsertMenuDto, @CurrentUser() user: AuthenticatedUser) {
    return this.catalog.upsertMenu(dto, user.userId);
  }

  // ── featured campaigns ──

  @Get('featured-campaigns')
  @RequirePermissions('cms.view')
  listFeatured() {
    return this.catalog.listFeatured();
  }

  @Post('featured-campaigns')
  @RequirePermissions('cms.manage')
  feature(@Body() dto: FeatureCampaignDto, @CurrentUser() user: AuthenticatedUser) {
    return this.catalog.featureCampaign(dto, user.userId);
  }

  @Delete('featured-campaigns/:campaignId')
  @RequirePermissions('cms.manage')
  unfeature(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalog.unfeatureCampaign(campaignId, user.userId);
  }
}
