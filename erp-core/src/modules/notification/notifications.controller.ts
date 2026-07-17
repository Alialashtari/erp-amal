import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { NotificationService } from './notification.service';
import { SendNotificationDto } from './dto/send-notification.dto';

@ApiTags('notification')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Post('send')
  @RequirePermissions('notification.send')
  send(@Body() dto: SendNotificationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.notifications.send({
      channel: dto.channel,
      recipientUserId: dto.recipientUserId,
      recipientPersonId: dto.recipientPersonId,
      recipientAddress: dto.recipientAddress,
      templateKey: dto.templateKey,
      title: dto.title,
      body: dto.body,
      data: dto.data,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      createdBy: user.userId,
    });
  }

  /** Delivery history for administrators. */
  @Get()
  @RequirePermissions('notification.view')
  findAll(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.notifications.findAll(limit ? Number(limit) : 50, offset ? Number(offset) : 0);
  }

  /** The authenticated user's own in-app notifications (no admin permission needed). */
  @Get('my')
  my(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.notifications.myNotifications(
      user.userId,
      limit ? Number(limit) : 25,
      offset ? Number(offset) : 0,
    );
  }
}
