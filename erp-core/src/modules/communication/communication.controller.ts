import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CommCampaignStatus } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CommunicationService } from './communication.service';
import { CreateCommCampaignDto } from './dto/create-comm-campaign.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@ApiTags('communication')
@ApiBearerAuth()
@Controller('communication')
export class CommunicationController {
  constructor(private readonly communication: CommunicationService) {}

  @Get('dashboard')
  @RequirePermissions('communication.view')
  dashboard() {
    return this.communication.dashboard();
  }

  // ── bulk campaigns ──

  @Post('campaigns')
  @RequirePermissions('communication.manage')
  createCampaign(@Body() dto: CreateCommCampaignDto, @CurrentUser() user: AuthenticatedUser) {
    return this.communication.createCampaign(dto, user.userId);
  }

  @Get('campaigns')
  @RequirePermissions('communication.view')
  listCampaigns(
    @Query('status') status?: CommCampaignStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.communication.listCampaigns(
      status,
      limit ? Number(limit) : undefined,
      offset ? Number(offset) : undefined,
    );
  }

  @Get('campaigns/:id')
  @RequirePermissions('communication.view')
  getCampaign(@Param('id', ParseUUIDPipe) id: string) {
    return this.communication.getCampaign(id);
  }

  @Post('campaigns/:id/launch')
  @RequirePermissions('communication.send')
  launch(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.communication.launchCampaign(id, user.userId);
  }

  @Post('campaigns/:id/cancel')
  @RequirePermissions('communication.send')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.communication.cancelCampaign(id, user.userId);
  }

  // ── announcements ──

  @Post('announcements')
  @RequirePermissions('communication.manage')
  createAnnouncement(
    @Body() dto: CreateAnnouncementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.communication.createAnnouncement(dto, user.userId);
  }

  @Get('announcements')
  @RequirePermissions('communication.view')
  listAnnouncements(@Query('includeArchived') includeArchived?: string) {
    return this.communication.listAnnouncements(includeArchived === 'true');
  }

  @Patch('announcements/:id')
  @RequirePermissions('communication.manage')
  updateAnnouncement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.communication.updateAnnouncement(id, dto, user.userId);
  }

  /** Active announcements for public surfaces (app/website banners). */
  @Public()
  @Get('announcements/active')
  activeAnnouncements() {
    return this.communication.activeAnnouncements();
  }
}
