import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';

@ApiTags('Salud')
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @SkipThrottle()
  @ApiOperation({ summary: 'Verifica que la API y la base de datos respondan' })
  async check() {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ statusCode: 503, error: 'UNHEALTHY', message: 'Base de datos no disponible' });
    }
  }
}
