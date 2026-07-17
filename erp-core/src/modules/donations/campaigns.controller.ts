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
import { CampaignStatus } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { CampaignUpdateDto } from './dto/campaign-update.dto';
import { TransitionCampaignDto } from './dto/transition-campaign.dto';

@ApiTags('donations')
@ApiBearerAuth()
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Post()
  @RequirePermissions('donations.manage')
  create(@Body() dto: CreateCampaignDto, @CurrentUser() user: AuthenticatedUser) {
    return this.campaigns.create(dto, user.userId);
  }

  @Get()
  @RequirePermissions('donations.view')
  findAll(
    @Query('status') status?: CampaignStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.campaigns.findAll(status, limit ? Number(limit) : 25, offset ? Number(offset) : 0);
  }

  @Get(':id')
  @RequirePermissions('donations.view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('donations.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaigns.update(id, dto, user.userId);
  }

  @Post(':id/transition')
  @RequirePermissions('donations.manage')
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionCampaignDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaigns.transition(id, dto.status, user.userId);
  }

  @Post(':id/updates')
  @RequirePermissions('donations.manage')
  addUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CampaignUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaigns.addUpdate(id, dto, user.userId);
  }
}
