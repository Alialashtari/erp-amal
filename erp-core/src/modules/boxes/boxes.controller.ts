import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BoxRequestStatus, BoxStatus } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { BoxesService } from './boxes.service';
import { CreateBoxRequestDto } from './dto/create-box-request.dto';
import { RecordCollectionDto } from './dto/record-collection.dto';
import { DeliverRequestDto, SetBoxStatusDto, TransitionRequestDto } from './dto/box-actions.dto';

@ApiTags('boxes')
@ApiBearerAuth()
@Controller('boxes')
export class BoxesController {
  constructor(private readonly boxes: BoxesService) {}

  @Get('summary')
  @RequirePermissions('boxes.view')
  summary() {
    return this.boxes.summary();
  }

  // ── requests (ADR-027 §5 lifecycle) ──

  @Post('requests')
  @RequirePermissions('boxes.manage')
  createRequest(@Body() dto: CreateBoxRequestDto, @CurrentUser() user: AuthenticatedUser) {
    return this.boxes.createRequest(dto, user.userId);
  }

  @Get('requests')
  @RequirePermissions('boxes.view')
  listRequests(
    @Query('status') status?: BoxRequestStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.boxes.findRequests(
      status,
      limit ? Number(limit) : undefined,
      offset ? Number(offset) : 0,
    );
  }

  @Post('requests/:id/transition')
  @RequirePermissions('boxes.manage')
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boxes.transitionRequest(id, dto.status, user, {
      reason: dto.reason,
      assignedToUserId: dto.assignedToUserId,
      scheduledDeliveryAt: dto.scheduledDeliveryAt,
    });
  }

  /** Transactional delivery: request → DELIVERED + box created (one commit). */
  @Post('requests/:id/deliver')
  @RequirePermissions('boxes.deliver')
  deliver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeliverRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boxes.deliver(id, user, dto);
  }

  // ── boxes ──

  @Get()
  @RequirePermissions('boxes.view')
  listBoxes(
    @Query('status') status?: BoxStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.boxes.findBoxes(
      status,
      limit ? Number(limit) : undefined,
      offset ? Number(offset) : 0,
    );
  }

  @Post(':id/status')
  @RequirePermissions('boxes.manage')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetBoxStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boxes.setBoxStatus(id, dto.status, user, dto.reason);
  }

  // ── collections ──

  @Post(':id/collections')
  @RequirePermissions('boxes.collect')
  recordCollection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordCollectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boxes.recordCollection(id, dto, user);
  }

  @Get(':id/collections')
  @RequirePermissions('boxes.view')
  collections(@Param('id', ParseUUIDPipe) id: string) {
    return this.boxes.boxCollections(id);
  }
}
