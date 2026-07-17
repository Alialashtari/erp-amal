import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../authorization/permissions.service';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

/**
 * Authentication flows (Phase 1):
 * register, login, refresh (with rotation), logout.
 * Refresh tokens are opaque random secrets, stored only as SHA-256 hashes,
 * bound to a session, and rotated on every use (Build Spec Part 6 §8).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionsService,
  ) {}

  async register(email: string, password: string, meta: RequestMeta): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await argon2.hash(password);
    const user = await this.prisma.user.create({ data: { email, passwordHash } });

    await this.audit.log({
      userId: user.id,
      action: 'CREATE',
      module: 'identity',
      entityType: 'User',
      entityId: user.id,
      newValue: { email },
      ...meta,
    });

    return this.issueTokens(user.id, meta);
  }

  async login(email: string, password: string, meta: RequestMeta): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = user && (await argon2.verify(user.passwordHash, password));
    if (!user || !valid) {
      await this.audit.log({
        userId: user?.id ?? null,
        action: 'LOGIN_FAILED',
        module: 'identity',
        entityType: 'User',
        entityId: user?.id,
        newValue: { email },
        ...meta,
      });
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException(`Account is ${user.status.toLowerCase()}`);
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({
      userId: user.id,
      action: 'LOGIN',
      module: 'identity',
      entityType: 'User',
      entityId: user.id,
      ...meta,
    });

    return this.issueTokens(user.id, meta);
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<TokenPair> {
    const [sessionId, secret] = refreshToken.split('.', 2);
    if (!sessionId || !secret) throw new UnauthorizedException('Malformed refresh token');

    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session is not valid');
    }
    if (this.hash(secret) !== session.refreshTokenHash) {
      // Possible token theft/replay: revoke the session entirely.
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token rejected');
    }

    // Rotation: replace the secret on every refresh.
    const newSecret = this.randomSecret();
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { refreshTokenHash: this.hash(newSecret) },
    });

    await this.audit.log({
      userId: session.userId,
      action: 'TOKEN_REFRESH',
      module: 'identity',
      entityType: 'Session',
      entityId: sessionId,
      ...meta,
    });

    const accessToken = await this.signAccessToken(session.userId, sessionId);
    return { accessToken, refreshToken: `${sessionId}.${newSecret}`, sessionId };
  }

  async logout(sessionId: string, userId: string, meta: RequestMeta): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      userId,
      action: 'LOGOUT',
      module: 'identity',
      entityType: 'Session',
      entityId: sessionId,
      ...meta,
    });
  }

  // ── internals ────────────────────────────────────────────────

  private async issueTokens(userId: string, meta: RequestMeta): Promise<TokenPair> {
    const ttlDays = Number(this.config.get('JWT_REFRESH_TTL_DAYS', 30));
    const secret = this.randomSecret();
    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: this.hash(secret),
        ip: meta.ip,
        userAgent: meta.userAgent,
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });
    const accessToken = await this.signAccessToken(userId, session.id);
    return { accessToken, refreshToken: `${session.id}.${secret}`, sessionId: session.id };
  }

  private async signAccessToken(userId: string, sessionId: string): Promise<string> {
    const { roles, permissions } = await this.permissions.getUserAccess(userId);
    return this.jwt.signAsync({ sub: userId, sessionId, roles, permissions });
  }

  private randomSecret(): string {
    return randomBytes(48).toString('base64url');
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
