import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
}

/**
 * Formato de error único para toda la API: `{ statusCode, error, message }`.
 * Los errores inesperados se registran en el servidor, pero al cliente solo llega
 * un mensaje genérico: nunca stack traces ni detalles internos (OWASP A05).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'object' && payload !== null) {
        const { error, message } = payload as Partial<ErrorBody>;
        return {
          statusCode,
          error: this.normalizeError(error, statusCode),
          message: message ?? exception.message,
        };
      }
      return { statusCode, error: this.normalizeError(undefined, statusCode), message: String(payload) };
    }

    // Errores de body-parser (JSON malformado, cuerpo demasiado grande): son del cliente, no 500
    const clientError = this.asExposedClientError(exception);
    if (clientError) {
      return {
        statusCode: clientError,
        error: this.normalizeError(undefined, clientError),
        message: clientError === HttpStatus.PAYLOAD_TOO_LARGE ? 'El cuerpo de la petición es demasiado grande' : 'Petición mal formada',
      };
    }

    this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado. Intenta de nuevo.',
    };
  }

  /** Los errores de `http-errors` marcan con `expose: true` los que son seguros de mostrar. */
  private asExposedClientError(exception: unknown): number | null {
    const candidate = exception as { status?: unknown; expose?: unknown } | null;
    const status = candidate?.status;
    return candidate?.expose === true && typeof status === 'number' && status >= 400 && status < 500 ? status : null;
  }

  /** "Bad Request" -> "BAD_REQUEST" para que todos los errores tengan el mismo estilo de código. */
  private normalizeError(error: string | undefined, statusCode: number): string {
    const label = error ?? HttpStatus[statusCode] ?? 'ERROR';
    return label.toUpperCase().replace(/\s+/g, '_');
  }
}
