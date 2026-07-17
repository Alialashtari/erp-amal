import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { LinkPersonDto } from './dto/link-person.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('identity.view')
  findAll(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.users.findAll(limit ? Number(limit) : undefined, offset ? Number(offset) : 0);
  }

  @Patch(':id/person')
  @RequirePermissions('identity.manage')
  linkPerson(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkPersonDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.users.linkPerson(id, dto.personId, actor.userId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Patch(':id/status')
  @RequirePermissions('identity.manage')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.users.setStatus(id, dto.status, actor.userId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
