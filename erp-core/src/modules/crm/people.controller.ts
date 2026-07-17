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
import { PeopleService } from './people.service';
import { DedupService } from './dedup.service';
import { MergeService } from './merge.service';
import { CrmTimelineService } from './timeline.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { QueryPeopleDto } from './dto/query-people.dto';
import { AddContactDto } from './dto/add-contact.dto';
import { AddAddressDto } from './dto/add-address.dto';
import { AddRelationshipDto } from './dto/add-relationship.dto';
import { AddIdentityLinkDto } from './dto/add-identity-link.dto';
import { CheckDuplicatesDto } from './dto/check-duplicates.dto';
import { MergePersonsDto } from './dto/merge-persons.dto';
import { SetPersonRolesDto } from './dto/set-person-roles.dto';
import { SetTagsDto } from './dto/set-tags.dto';

@ApiTags('crm')
@ApiBearerAuth()
@Controller('crm/people')
export class PeopleController {
  constructor(
    private readonly people: PeopleService,
    private readonly dedup: DedupService,
    private readonly merges: MergeService,
    private readonly timeline: CrmTimelineService,
  ) {}

  private sensitive(user: AuthenticatedUser): boolean {
    return user.permissions.includes('crm.view_sensitive');
  }

  @Get()
  @RequirePermissions('crm.view')
  findAll(@Query() query: QueryPeopleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.people.findAll(query, user.userId, this.sensitive(user));
  }

  @Post()
  @RequirePermissions('crm.manage')
  create(@Body() dto: CreatePersonDto, @CurrentUser() user: AuthenticatedUser) {
    return this.people.create(dto, user.userId);
  }

  @Post('check-duplicates')
  @RequirePermissions('crm.view')
  checkDuplicates(@Body() dto: CheckDuplicatesDto) {
    return this.dedup.findCandidates(dto);
  }

  @Get(':id')
  @RequirePermissions('crm.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.people.findOne(id, this.sensitive(user));
  }

  @Patch(':id')
  @RequirePermissions('crm.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePersonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.people.update(id, dto, user.userId);
  }

  @Post(':id/archive')
  @RequirePermissions('crm.manage')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.people.archive(id, user.userId);
  }

  @Post(':id/restore')
  @RequirePermissions('crm.manage')
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.people.restore(id, user.userId);
  }

  @Get(':id/timeline')
  @RequirePermissions('crm.view')
  getTimeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.timeline.forPerson(id, limit ? Number(limit) : 50, offset ? Number(offset) : 0);
  }

  @Post(':id/contacts')
  @RequirePermissions('crm.manage')
  addContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddContactDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.people.addContact(id, dto, user.userId);
  }

  @Post(':id/addresses')
  @RequirePermissions('crm.manage')
  addAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddAddressDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.people.addAddress(id, dto, user.userId);
  }

  @Patch(':id/roles')
  @RequirePermissions('crm.manage')
  setRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPersonRolesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.people.setRoles(id, dto, user.userId);
  }

  @Patch(':id/tags')
  @RequirePermissions('crm.manage')
  setTags(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTagsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.people.setTags(id, dto, user.userId);
  }

  @Post(':id/relationships')
  @RequirePermissions('crm.manage')
  addRelationship(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddRelationshipDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.people.addRelationship(id, dto, user.userId);
  }

  @Post(':id/identity-links')
  @RequirePermissions('crm.manage')
  addIdentityLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddIdentityLinkDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.people.addIdentityLink(id, dto, user.userId);
  }

  @Post(':id/merge')
  @RequirePermissions('crm.merge')
  merge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MergePersonsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.merges.merge(id, dto.sourcePersonId, user.userId);
  }

  @Post('merges/:mergeRecordId/reverse')
  @RequirePermissions('crm.merge')
  reverseMerge(
    @Param('mergeRecordId', ParseUUIDPipe) mergeRecordId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.merges.reverse(mergeRecordId, user.userId);
  }
}
