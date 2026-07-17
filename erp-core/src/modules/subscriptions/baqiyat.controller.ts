import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { BaqiyatService } from './baqiyat.service';
import { AssignWorkDto } from './dto/assign-work.dto';
import { CreateWorkDto } from './dto/create-work.dto';
import { SetWorkStatusDto } from './dto/set-work-status.dto';

@ApiTags('subscriptions')
@ApiBearerAuth()
@Controller('baqiyat/works')
export class BaqiyatController {
  constructor(private readonly baqiyat: BaqiyatService) {}

  @Get()
  @RequirePermissions('subscriptions.view')
  findAll(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.baqiyat.findAll(status, limit ? Number(limit) : 50, offset ? Number(offset) : 0);
  }

  @Post()
  @RequirePermissions('subscriptions.manage')
  create(@Body() dto: CreateWorkDto, @CurrentUser() user: AuthenticatedUser) {
    return this.baqiyat.createWork(dto, user.userId);
  }

  @Post(':id/assign')
  @RequirePermissions('subscriptions.manage')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignWorkDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.baqiyat.assign(id, dto.subscriptionIds, user.userId);
  }

  @Post(':id/status')
  @RequirePermissions('subscriptions.manage')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetWorkStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.baqiyat.setStatus(id, dto.status, user.userId);
  }
}
