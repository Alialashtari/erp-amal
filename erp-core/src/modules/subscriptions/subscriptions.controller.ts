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
import { SubscriptionsService } from './subscriptions.service';
import { PlansService } from './plans.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { QuerySubscriptionsDto } from './dto/query-subscriptions.dto';
import { PayInstallmentDto } from './dto/pay-installment.dto';
import { WaiveInstallmentDto } from './dto/waive-installment.dto';
import { TransitionSubscriptionDto } from './dto/transition-subscription.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@ApiTags('subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly plans: PlansService,
  ) {}

  // ── plans ──
  @Get('plans')
  @RequirePermissions('subscriptions.view')
  listPlans(@Query('activeOnly') activeOnly?: string) {
    return this.plans.findAll(activeOnly === 'true');
  }

  @Post('plans')
  @RequirePermissions('subscriptions.manage_plans')
  createPlan(@Body() dto: CreatePlanDto, @CurrentUser() user: AuthenticatedUser) {
    return this.plans.create(dto, user.userId);
  }

  @Patch('plans/:id')
  @RequirePermissions('subscriptions.manage_plans')
  updatePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.update(id, dto, user.userId);
  }

  // ── subscriptions ──
  @Post()
  @RequirePermissions('subscriptions.create')
  create(@Body() dto: CreateSubscriptionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.subscriptions.create(dto, user.userId);
  }

  @Get()
  @RequirePermissions('subscriptions.view')
  findAll(@Query() query: QuerySubscriptionsDto) {
    return this.subscriptions.findAll(query);
  }

  @Get('summary')
  @RequirePermissions('subscriptions.view')
  summary() {
    return this.subscriptions.summary();
  }

  @Get(':id')
  @RequirePermissions('subscriptions.view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.findOne(id);
  }

  @Post(':id/transition')
  @RequirePermissions('subscriptions.manage')
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionSubscriptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subscriptions.transition(id, dto.status, user.userId);
  }

  // ── installments ──
  @Post('installments/:id/pay')
  @RequirePermissions('subscriptions.collect')
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayInstallmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subscriptions.payInstallment(id, dto, user);
  }

  @Post('installments/:id/waive')
  @RequirePermissions('subscriptions.manage')
  waive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WaiveInstallmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subscriptions.waiveInstallment(id, dto.reason, user.userId);
  }
}
