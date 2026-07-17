import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Consistent error envelope (Build Spec Part 6 §22):
 * { success, errorCode, message, details, timestamp, requestId }
 * Raw system errors are never exposed (Constitution Art. 3.3 / Part 8 §9).
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as { message?: string | string[]; error?: string };
        message = Array.isArray(b.message) ? (b.error ?? 'Validation failed') : (b.message ?? message);
        if (Array.isArray(b.message)) details = b.message;
      }
    }

    response.status(status).json({
      success: false,
      errorCode: HttpStatus[status] ?? String(status),
      message,
      details,
      timestamp: new Date().toISOString(),
      requestId: request.requestId,
    });
  }
}
