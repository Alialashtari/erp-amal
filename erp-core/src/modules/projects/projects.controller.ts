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
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { ProjectsService } from './projects.service';
import { CertificatesService } from './certificates.service';
import { CreateProgramDto } from './dto/create-program.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { AddParticipantDto } from './dto/add-participant.dto';
import { RecordAttendanceDto } from './dto/record-attendance.dto';
import { IssueCertificateDto } from './dto/issue-certificate.dto';
import { TransitionDto } from './dto/transition.dto';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly certificates: CertificatesService,
  ) {}

  // ── programs ──
  @Get('programs')
  @RequirePermissions('projects.view')
  listPrograms() {
    return this.projects.listPrograms();
  }

  @Post('programs')
  @RequirePermissions('projects.manage')
  createProgram(@Body() dto: CreateProgramDto, @CurrentUser() user: AuthenticatedUser) {
    return this.projects.createProgram(dto, user.userId);
  }

  // ── projects ──
  @Post()
  @RequirePermissions('projects.manage')
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: AuthenticatedUser) {
    return this.projects.createProject(dto, user.userId);
  }

  @Get()
  @RequirePermissions('projects.view')
  findAll(@Query() query: QueryProjectsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.projects.findProjects(query, user.userId);
  }

  @Get(':id')
  @RequirePermissions('projects.view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.findProject(id);
  }

  @Patch(':id')
  @RequirePermissions('projects.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.updateProject(id, dto, user.userId);
  }

  @Post(':id/transition')
  @RequirePermissions('projects.manage')
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.transitionProject(id, dto.status, user.userId);
  }

  // ── activities & attendance ──
  @Post(':id/activities')
  @RequirePermissions('projects.manage')
  addActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateActivityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.addActivity(id, dto, user.userId);
  }

  @Post('activities/:activityId/attendance')
  @RequirePermissions('projects.manage_participants')
  recordAttendance(
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Body() dto: RecordAttendanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.recordAttendance(activityId, dto, user.userId);
  }

  // ── tasks ──
  @Post(':id/tasks')
  @RequirePermissions('projects.manage_tasks')
  addTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.addTask(id, dto, user.userId);
  }

  @Post('tasks/:taskId/transition')
  @RequirePermissions('projects.manage_tasks')
  transitionTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: TransitionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.transitionTask(taskId, dto.status, user.userId);
  }

  // ── participants ──
  @Post(':id/participants')
  @RequirePermissions('projects.manage_participants')
  addParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddParticipantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.addParticipant(id, dto, user.userId);
  }

  // ── certificates ──
  @Post('certificates')
  @RequirePermissions('projects.issue_certificates')
  issueCertificate(@Body() dto: IssueCertificateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.certificates.issue(dto.personId, dto.projectId, dto.title, dto.titleAr, user.userId);
  }

  @Get('certificates/person/:personId')
  @RequirePermissions('projects.view')
  certificatesForPerson(@Param('personId', ParseUUIDPipe) personId: string) {
    return this.certificates.forPerson(personId);
  }

  /** Public QR verification endpoint (no auth; exposes certificate essentials only). */
  @Public()
  @Get('certificates/verify/:code')
  verifyCertificate(@Param('code') code: string) {
    return this.certificates.verify(code);
  }
}
