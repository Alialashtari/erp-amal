import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import { RolesService } from './roles.service';

@ApiTags('authorization')
@ApiBearerAuth()
@Controller('authorization')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('roles')
  @RequirePermissions('authorization.view')
  findRoles() {
    return this.roles.findAllRoles();
  }

  @Get('permissions')
  @RequirePermissions('authorization.view')
  findPermissions() {
    return this.roles.findAllPermissions();
  }

  @Post('roles')
  @RequirePermissions('authorization.manage')
  createRole(@Body() dto: CreateRoleDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.roles.createRole(dto.name, dto.description, actor.userId);
  }

  @Put('roles/:id/permissions')
  @RequirePermissions('authorization.manage')
  setPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRolePermissionsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.roles.setRolePermissions(id, dto.permissionCodes, actor.userId);
  }

  @Post('users/:userId/roles')
  @RequirePermissions('authorization.manage')
  assign(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.roles.assignRole(userId, dto.roleId, actor.userId);
  }

  @Delete('users/:userId/roles/:roleId')
  @RequirePermissions('authorization.manage')
  revoke(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.roles.revokeRole(userId, roleId, actor.userId);
  }
}
