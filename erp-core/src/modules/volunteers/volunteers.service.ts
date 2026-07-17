import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CrmTimelineService } from '../crm/timeline.service';
import { ScopingService, SCOPE_TYPES } from '../authorization/scoping.service';
import { WorkflowService } from '../workflow/workflow.service';
import { canTransitionVolunteer, totalApprovedHours, validateScores } from './volunteer-rules';
import { ApplyVolunteerDto } from './dto/apply-volunteer.dto';
import { RecordHoursDto } from './dto/record-hours.dto';
import { EvaluateDto } from './dto/evaluate.dto';

export const VOLUNTEER_WORKFLOW_KEY = 'volunteer_application';

/**
 * Volunteers (Phase 6, FRS-008 volunteer scope; employees/HR deferred).
 * Profiles layer on CRM Persons. Recruitment runs on the workflow engine
 * (review → interview → approval); hours require approval; evaluations are
 * structured. History is never deleted (Art. 4.4).
 */
@Injectable()
export class VolunteersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly timeline: CrmTimelineService,
    private readonly scoping: ScopingService,
    private readonly workflow: WorkflowService,
  ) {}

  // ── recruitment (FRS-008 استقطاب المتطوعين) ──
  async apply(dto: ApplyVolunteerDto, actorId: string) {
    const person = await this.prisma.person.findUnique({
      where: { id: dto.personId },
      select: { id: true },
    });
    if (!person) throw new NotFoundException('Person not found');
    const existing = await this.prisma.volunteerProfile.findUnique({
      where: { personId: dto.personId },
    });
    if (existing) throw new BadRequestException('A volunteer profile already exists for this person');

    const profile = await this.prisma.volunteerProfile.create({
      data: {
        personId: dto.personId,
        skills: dto.skills ?? [],
        interests: dto.interests,
        availability: dto.availability,
        emergencyContact: dto.emergencyContact,
        createdBy: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'volunteers',
      entityType: 'VolunteerProfile',
      entityId: profile.id,
      newValue: { personId: dto.personId, skills: dto.skills ?? [] },
    });
    return profile;
  }

  /** Sends the application into the recruitment workflow. */
  async submitApplication(profileId: string, actorId: string) {
    const profile = await this.getProfile(profileId);
    if (profile.status !== 'APPLICANT') {
      throw new BadRequestException(`Application cannot be submitted from status ${profile.status}`);
    }
    const wf = await this.workflow.start(
      VOLUNTEER_WORKFLOW_KEY,
      'VolunteerProfile',
      profileId,
      actorId,
    );
    const updated = await this.prisma.volunteerProfile.update({
      where: { id: profileId },
      data: { status: 'REVIEW', workflowInstanceId: wf.instanceId },
    });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'volunteers',
      entityType: 'VolunteerProfile',
      entityId: profileId,
      newValue: { status: 'REVIEW', workflowInstanceId: wf.instanceId },
    });
    return updated;
  }

  /** Recruitment step action; approval activates the volunteer. */
  async actOnApplication(
    profileId: string,
    action: 'APPROVE' | 'REJECT' | 'RETURN' | 'COMMENT',
    comment: string | undefined,
    actor: { userId: string; permissions: string[] },
  ) {
    const profile = await this.getProfile(profileId);
    if (!profile.workflowInstanceId) {
      throw new BadRequestException('Profile has no active recruitment workflow');
    }
    const result = await this.workflow.act(profile.workflowInstanceId, action, comment, actor);

    if (result.status === 'APPROVED') {
      await this.prisma.volunteerProfile.update({
        where: { id: profileId },
        data: { status: 'ACTIVE', joinDate: new Date() },
      });
      await this.prisma.personRole.upsert({
        where: { personId_roleType: { personId: profile.personId, roleType: 'VOLUNTEER' } },
        create: { personId: profile.personId, roleType: 'VOLUNTEER', assignedBy: actor.userId },
        update: { active: true },
      });
      await this.timeline.record({
        personId: profile.personId,
        eventType: 'VOLUNTEER_ACTIVATED',
        module: 'volunteers',
        title: 'Volunteer application approved',
        entityType: 'VolunteerProfile',
        entityId: profileId,
        createdBy: actor.userId,
      });
    } else if (result.status === 'REJECTED') {
      await this.prisma.volunteerProfile.update({
        where: { id: profileId },
        data: { status: 'ARCHIVED' },
      });
    }
    return { profile: await this.getProfile(profileId), workflow: result };
  }

  async transition(profileId: string, to: string, actorId: string) {
    const profile = await this.getProfile(profileId);
    if (!canTransitionVolunteer(profile.status, to)) {
      throw new BadRequestException(`Cannot transition volunteer from ${profile.status} to ${to}`);
    }
    const updated = await this.prisma.volunteerProfile.update({
      where: { id: profileId },
      data: { status: to as never },
    });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'volunteers',
      entityType: 'VolunteerProfile',
      entityId: profileId,
      oldValue: { status: profile.status },
      newValue: { status: to },
    });
    return updated;
  }

  async findAll(status: string | undefined, userId: string, limit = 50, offset = 0) {
    const take = Math.min(limit, 200);
    const where: Record<string, unknown> = {
      ...(status ? { status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.volunteerProfile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip: offset,
        include: { teams: { include: { team: true } } },
      }),
      this.prisma.volunteerProfile.count({ where }),
    ]);
    return { items, total, limit: take, offset };
  }

  /** Volunteer file: profile + teams + hours totals + evaluations (FRS-008). */
  async findOne(profileId: string) {
    const profile = await this.prisma.volunteerProfile.findUnique({
      where: { id: profileId },
      include: {
        teams: { include: { team: true } },
        hours: { orderBy: { workDate: 'desc' }, take: 100 },
        evaluations: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!profile) throw new NotFoundException('Volunteer profile not found');
    const hours = (profile as { hours: { status: string; hours: unknown }[] }).hours.map((h) => ({
      status: h.status,
      hours: Number(h.hours),
    }));
    return { ...profile, totalApprovedHours: totalApprovedHours(hours) };
  }

  // ── teams ──
  async createTeam(
    dto: { code: string; name: string; nameAr?: string; department?: string; leaderPersonId?: string },
    actorId: string,
  ) {
    const team = await this.prisma.team.create({ data: { ...dto } });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'volunteers',
      entityType: 'Team',
      entityId: team.id,
      newValue: { code: dto.code, name: dto.name },
    });
    return team;
  }

  /** DEPARTMENT scoping (ADR-016): scoped supervisors see their departments only. */
  async listTeams(userId: string) {
    const departments = await this.scoping.getScopeValues(userId, SCOPE_TYPES.DEPARTMENT);
    return this.prisma.team.findMany({
      where: ScopingService.teamWhere(departments),
      orderBy: { code: 'asc' },
      include: { members: true },
    });
  }

  async addTeamMember(teamId: string, volunteerId: string, actorId: string) {
    const [team, volunteer] = await Promise.all([
      this.prisma.team.findUnique({ where: { id: teamId } }),
      this.prisma.volunteerProfile.findUnique({ where: { id: volunteerId } }),
    ]);
    if (!team || !volunteer) throw new NotFoundException('Team or volunteer not found');
    if ((volunteer as { status: string }).status !== 'ACTIVE') {
      throw new BadRequestException('Only ACTIVE volunteers can join teams');
    }
    const member = await this.prisma.teamMember.upsert({
      where: { teamId_volunteerId: { teamId, volunteerId } },
      create: { teamId, volunteerId, addedBy: actorId },
      update: {},
    });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'volunteers',
      entityType: 'Team',
      entityId: teamId,
      newValue: { addedVolunteer: volunteerId },
    });
    return member;
  }

  // ── hours (FRS-008 ساعات التطوع) ──
  async recordHours(volunteerId: string, dto: RecordHoursDto, actorId: string) {
    const volunteer = await this.getProfile(volunteerId);
    if (volunteer.status !== 'ACTIVE') {
      throw new BadRequestException('Hours can only be recorded for ACTIVE volunteers');
    }
    const hours = await this.prisma.volunteerHours.create({
      data: {
        volunteerId,
        projectId: dto.projectId,
        workDate: new Date(dto.workDate),
        hours: dto.hours,
        description: dto.description,
        createdBy: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'volunteers',
      entityType: 'VolunteerHours',
      entityId: hours.id,
      newValue: { volunteerId, hours: dto.hours, workDate: dto.workDate },
    });
    return hours;
  }

  async decideHours(hoursId: string, approve: boolean, actorId: string) {
    const record = await this.prisma.volunteerHours.findUnique({
      where: { id: hoursId },
      include: { volunteer: { select: { personId: true } } },
    });
    if (!record) throw new NotFoundException('Hours record not found');
    if ((record as { status: string }).status !== 'PENDING') {
      throw new BadRequestException('Only PENDING hours can be decided');
    }
    const updated = await this.prisma.volunteerHours.update({
      where: { id: hoursId },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        approvedBy: actorId,
        approvedAt: new Date(),
      },
    });
    if (approve) {
      await this.timeline.record({
        personId: (record as { volunteer: { personId: string } }).volunteer.personId,
        eventType: 'VOLUNTEER_HOURS_APPROVED',
        module: 'volunteers',
        title: `${Number((record as { hours: unknown }).hours)} volunteer hours approved`,
        entityType: 'VolunteerHours',
        entityId: hoursId,
        createdBy: actorId,
      });
    }
    await this.audit.log({
      userId: actorId,
      action: approve ? 'APPROVE' : 'REJECT',
      module: 'volunteers',
      entityType: 'VolunteerHours',
      entityId: hoursId,
      newValue: { status: approve ? 'APPROVED' : 'REJECTED' },
    });
    return updated;
  }

  // ── evaluations (FRS-008 تقييم الأداء) ──
  async evaluate(volunteerId: string, dto: EvaluateDto, actorId: string) {
    await this.getProfile(volunteerId);
    const error = validateScores(dto.scores);
    if (error) throw new BadRequestException(error);
    const evaluation = await this.prisma.volunteerEvaluation.create({
      data: {
        volunteerId,
        period: dto.period,
        scores: dto.scores as Prisma.InputJsonValue,
        comments: dto.comments,
        evaluatedBy: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'volunteers',
      entityType: 'VolunteerEvaluation',
      entityId: evaluation.id,
      newValue: { volunteerId, period: dto.period ?? null },
    });
    return evaluation;
  }

  private async getProfile(profileId: string): Promise<{
    id: string;
    personId: string;
    status: string;
    workflowInstanceId: string | null;
  }> {
    const profile = await this.prisma.volunteerProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Volunteer profile not found');
    return profile as never;
  }
}
