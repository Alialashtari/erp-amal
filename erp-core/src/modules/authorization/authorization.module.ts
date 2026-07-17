import { Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { ScopingService } from './scoping.service';

@Module({
  controllers: [RolesController],
  providers: [PermissionsService, RolesService, ScopingService],
  exports: [PermissionsService, ScopingService],
})
export class AuthorizationModule {}
