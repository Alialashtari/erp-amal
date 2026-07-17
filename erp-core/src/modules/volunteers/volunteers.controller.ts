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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { VolunteersService } from './volunteers.service';
import { ApplyVolunteerDto } from './dto/apply-volunteer.dto';
import { RecordHoursDto } from './dto/record-hours.dto';
import { EvaluateDto } from './dto/evaluate.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { ApplicationActionDto, DecideHoursDto, TransitionVolunteerDto } from './dto/volunteer-actions.dto';

@ApiTags('volunteers')
@ApiBearerAuth()
@Controller('volunteers')
export class VolunteersController {
  constructor(private readonly volunteers: VolunteersService) {}

  // ── profiles & recruitment ──
  @Post()
  @RequirePermissions('volunteers.manage')
  apply(@Body() dto: ApplyVolunteerDto, @CurrentUser() user: AuthenticatedUser) {
    return this.volunteers.apply(dto, user.userId);
  }

  @Get()
  @RequirePermissions('volunteers.view')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.volunteers.findAll(
      status,
      user.userId,
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
    );
  }

  @Get(':id')
  @RequirePermissions('volunteers.view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.volunteers.findOne(id);
  }

  @Post(':id/submit')
  @RequirePermissions('volunteers.manage')
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.volunteers.submitApplication(id, user.userId);
  }

  /** Recruitment workflow action (volunteers.review → volunteers.approve per step). */
  @Post(':id/application')
  actOnApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplicationActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.volunteers.actOnApplication(id, dto.action, dto.comment, user);
  }

  @Post(':id/transition')
  @RequirePermissions('volunteers.manage')
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionVolunteerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.volunteers.transition(id, dto.status, user.userId);
  }

  // ── teams ──
  @Get('teams/list')
  @RequirePermissions('volunteers.view')
  listTeams(@CurrentUser() user: AuthenticatedUser) {
    return this.volunteers.listTeams(user.userId);
  }

  @Post('teams')
  @RequirePermissions('volunteers.manage')
  createTeam(@Body() dto: CreateTeamDto, @CurrentUser() user: AuthenticatedUser) {
    return this.volunteers.createTeam(dto, user.userId);
  }

  @Post('teams/:teamId/members')
  @RequirePermissions('volunteers.manage')
  addTeamMember(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: AddTeamMemberDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.volunteers.addTeamMember(teamId, dto.volunteerId, user.userId);
  }

  // ── hours ──
  @Post(':id/hours')
  @RequirePermissions('volunteers.manage')
  recordHours(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordHoursDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.volunteers.recordHours(id, dto, user.userId);
  }

  @Post('hours/:hoursId/decide')
  @RequirePermissions('volunteers.approve_hours')
  decideHours(
    @Param('hoursId', ParseUUIDPipe) hoursId: string,
    @Body() dto: DecideHoursDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.volunteers.decideHours(hoursId, dto.approve, user.userId);
  }

  // ── evaluations ──
  @Post(':id/evaluations')
  @RequirePermissions('volunteers.manage')
  evaluate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EvaluateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.volunteers.evaluate(id, dto, user.userId);
  }
}
