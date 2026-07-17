import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { PrismaService } from '../../../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Session revocation check: a revoked session invalidates outstanding access tokens.
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      select: { revokedAt: true, expiresAt: true, user: { select: { status: true, email: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session revoked or expired');
    }
    if (session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }
    return {
      userId: payload.sub,
      email: session.user.email,
      sessionId: payload.sessionId,
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? [],
    };
  }
}
