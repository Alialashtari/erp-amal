import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { SetFlagDto } from './dto/set-flag.dto';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import { SettingsService } from './settings.service';

@ApiTags('configuration')
@ApiBearerAuth()
@Controller('configuration')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('settings')
  @RequirePermissions('configuration.view')
  findSettings() {
    return this.settings.findAllSettings();
  }

  @Get('settings/:key')
  @RequirePermissions('configuration.view')
  getSetting(@Param('key') key: string) {
    return this.settings.getSetting(key);
  }

  @Put('settings/:key')
  @RequirePermissions('configuration.manage')
  upsertSetting(
    @Param('key') key: string,
    @Body() dto: UpsertSettingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.settings.upsertSetting(key, dto.value, dto.description, actor.userId);
  }

  @Get('flags')
  @RequirePermissions('configuration.view')
  findFlags() {
    return this.settings.findAllFlags();
  }

  @Put('flags/:key')
  @RequirePermissions('configuration.manage')
  setFlag(
    @Param('key') key: string,
    @Body() dto: SetFlagDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.settings.setFlag(key, dto.enabled, dto.description, actor.userId);
  }
}
