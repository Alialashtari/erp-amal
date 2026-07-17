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
import { MedicalService } from './medical.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { QueryCasesDto } from './dto/query-cases.dto';
import { RecordTreatmentDto } from './dto/record-treatment.dto';
import { ReviewActionDto, TransitionCaseDto } from './dto/case-actions.dto';

@ApiTags('medical')
@ApiBearerAuth()
@Controller('medical/cases')
export class MedicalController {
  constructor(private readonly medical: MedicalService) {}

  @Post()
  @RequirePermissions('medical.manage')
  create(@Body() dto: CreateCaseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.medical.create(dto, user.userId);
  }

  @Get()
  @RequirePermissions('medical.view')
  findAll(@Query() query: QueryCasesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.medical.findAll(query, user.userId);
  }

  @Get(':id')
  @RequirePermissions('medical.view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.medical.findOne(id);
  }

  /** Sends the case into the committee review workflow. */
  @Post(':id/submit')
  @RequirePermissions('medical.manage')
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.medical.submitForReview(id, user.userId);
  }

  /**
   * Committee/step action. Authorization is enforced per workflow step
   * (medical.review → medical.committee → medical.approve).
   */
  @Post(':id/review')
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.medical.actOnReview(id, dto.action, dto.comment, user);
  }

  @Post(':id/transition')
  @RequirePermissions('medical.manage')
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.medical.transition(id, dto.status, user.userId);
  }

  @Post(':id/treatments')
  @RequirePermissions('medical.execute')
  recordTreatment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordTreatmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.medical.recordTreatment(id, dto, user);
  }
}
