import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_UNITS_PER_ORDER } from '../../../domain/product/product';

/**
 * Validación de entrada (OWASP A03 - Injection): tipos, longitudes y formatos
 * estrictos. Con `whitelist` + `forbidNonWhitelisted` cualquier campo extra
 * (ej. un "amount" inyectado) es rechazado: el monto nunca viene del cliente.
 */

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const NAME_PATTERN = /^[\p{L}][\p{L}\s'.-]*$/u;

export class CustomerDto {
  @ApiProperty({ example: 'ana.gomez@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'email no es válido' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Ana Gómez' })
  @Transform(trim)
  @IsString()
  @Length(3, 120)
  @Matches(NAME_PATTERN, { message: 'fullName solo admite letras, espacios y . \' -' })
  fullName!: string;

  @ApiProperty({ example: '3001234567', description: '7 a 15 dígitos, opcionalmente con +' })
  @Transform(trim)
  @Matches(/^\+?\d{7,15}$/, { message: 'phone debe tener entre 7 y 15 dígitos' })
  phone!: string;
}

export class ShippingDto {
  @ApiProperty({ example: 'Calle 10 # 43-12, Apto 501' })
  @Transform(trim)
  @IsString()
  @Length(5, 200)
  addressLine!: string;

  @ApiProperty({ example: 'Medellín' })
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  @Matches(NAME_PATTERN, { message: 'city solo admite letras' })
  city!: string;

  @ApiProperty({ example: 'Antioquia' })
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  @Matches(NAME_PATTERN, { message: 'region solo admite letras' })
  region!: string;

  @ApiPropertyOptional({ example: '050021' })
  @IsOptional()
  @Transform(trim)
  @Matches(/^\d{4,10}$/, { message: 'postalCode debe tener entre 4 y 10 dígitos' })
  postalCode?: string;
}

export class PaymentDto {
  @ApiProperty({ example: 'tok_stagtest_5113_abc', description: 'Token de tarjeta generado en el navegador' })
  @IsString()
  @MaxLength(100)
  @Matches(/^tok_[A-Za-z0-9_]+$/, { message: 'cardToken no tiene un formato válido' })
  cardToken!: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 36 })
  @IsInt()
  @Min(1)
  @Max(36)
  installments!: number;

  @ApiProperty({ description: 'Token de aceptación de términos (GET /checkout/config)' })
  @IsString()
  @Length(10, 2048)
  acceptanceToken!: string;

  @ApiProperty({ description: 'Token de autorización de datos personales (GET /checkout/config)' })
  @IsString()
  @Length(10, 2048)
  personalDataAuthToken!: string;
}

export class CreateTransactionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId!: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: MAX_UNITS_PER_ORDER })
  @IsInt()
  @Min(1)
  @Max(MAX_UNITS_PER_ORDER)
  quantity!: number;

  @ApiProperty({ type: CustomerDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CustomerDto)
  customer!: CustomerDto;

  @ApiProperty({ type: ShippingDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ShippingDto)
  shipping!: ShippingDto;

  @ApiProperty({ type: PaymentDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PaymentDto)
  payment!: PaymentDto;
}
