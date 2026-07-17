import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    PassportModule,
    AuthorizationModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_ACCESS_TTL', '900s') },
      }),
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [AuthService, UsersService, JwtStrategy],
  exports: [AuthService],
})
export class IdentityModule {}
