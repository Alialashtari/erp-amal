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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { DonationsService } from './donations.service';
import { RecurringService } from './recurring.service';
import { CreateDonationDto } from './dto/create-donation.dto';
import { QueryDonationsDto } from './dto/query-donations.dto';
import { RefundDonationDto } from './dto/refund-donation.dto';
import { CreateRecurringDto } from './dto/create-recurring.dto';
import { SetRecurringStatusDto } from './dto/set-recurring-status.dto';

@ApiTags('donations')
@ApiBearerAuth()
@Controller('donations')
export class DonationsController {
  constructor(
    private readonly donations: DonationsService,
    private readonly recurring: RecurringService,
  ) {}

  @Post()
  @RequirePermissions('donations.create')
  create(@Body() dto: CreateDonationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.donations.create(dto, user);
  }

  @Get()
  @RequirePermissions('donations.view')
  findAll(@Query() query: QueryDonationsDto) {
    return this.donations.findAll(query);
  }

  @Get('donors/:personId/stats')
  @RequirePermissions('donations.view')
  donorStats(@Param('personId', ParseUUIDPipe) personId: string) {
    return this.donations.donorStats(personId);
  }

  @Get(':id')
  @RequirePermissions('donations.view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.donations.findOne(id);
  }

  @Post(':id/complete')
  @RequirePermissions('donations.create')
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.donations.complete(id, user);
  }

  @Post(':id/refund')
  @RequirePermissions('donations.refund')
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundDonationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.donations.refund(id, dto.reason, user);
  }

  // ── recurring ──
  @Post('recurring')
  @RequirePermissions('donations.create')
  createRecurring(@Body() dto: CreateRecurringDto, @CurrentUser() user: AuthenticatedUser) {
    return this.recurring.create(dto, user.userId);
  }

  @Get('recurring/list')
  @RequirePermissions('donations.view')
  listRecurring(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.recurring.findAll(limit ? Number(limit) : 50, offset ? Number(offset) : 0);
  }

  @Patch('recurring/:id/status')
  @RequirePermissions('donations.manage')
  setRecurringStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRecurringStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recurring.setStatus(id, dto.status, user.userId);
  }
}
