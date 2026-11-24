import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  GetCheckoutConfigUseCase,
  GetDeliveryUseCase,
  GetProductUseCase,
  ListProductsUseCase,
} from '../../application/use-cases/catalog.use-cases';
import { CreateTransactionUseCase } from '../../application/use-cases/create-transaction.use-case';
import { GetTransactionUseCase } from '../../application/use-cases/get-transaction.use-case';
import { HandlePaymentEventUseCase } from '../../application/use-cases/handle-payment-event.use-case';
import { CreateTransactionDto } from './dtos/create-transaction.dto';
import { respond } from './error-mapper';
import { IdempotencyKeyHeader, IdempotencyKeyPipe } from './idempotency-key.pipe';
import {
  presentCheckoutConfig,
  presentDelivery,
  presentProduct,
  presentTransaction,
} from './presenters';

/**
 * Adaptadores de entrada (driving adapters). Cada handler:
 *   1. recibe datos ya validados por los DTO/pipes
 *   2. invoca un caso de uso
 *   3. presenta el resultado
 * Ninguna regla de negocio vive aquí.
 */

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Productos (stock)')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly listProducts: ListProductsUseCase,
    private readonly getProduct: GetProductUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista los productos con su stock disponible' })
  list() {
    return respond(this.listProducts.execute(), (products) => ({ data: products.map(presentProduct) }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un producto y unidades disponibles' })
  @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND' })
  findOne(@Param('id', uuid) id: string) {
    return respond(this.getProduct.execute(id), presentProduct);
  }
}

@ApiTags('Checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly getConfig: GetCheckoutConfigUseCase) {}

  @Get('config')
  @ApiOperation({
    summary: 'Configuración pública del checkout',
    description: 'Tarifas, llave pública para tokenizar la tarjeta y términos que el usuario debe aceptar.',
  })
  @ApiBadGatewayResponse({ description: 'PAYMENT_GATEWAY_ERROR' })
  config() {
    return respond(this.getConfig.execute(), presentCheckoutConfig);
  }
}

@ApiTags('Transacciones')
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly createTransaction: CreateTransactionUseCase,
    private readonly getTransaction: GetTransactionUseCase,
  ) {}

  @Post()
  // Límite estricto para frenar ataques de "card testing"
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Crea la transacción (PENDING) y cobra con la pasarela',
    description:
      'Reserva stock, registra cliente y entrega, y envía el cobro. Responde 201 con el estado actual ' +
      '(normalmente PENDING). Con la misma Idempotency-Key responde 200 con la transacción original.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID único por intento de pago' })
  @ApiCreatedResponse({ description: 'Transacción creada' })
  @ApiOkResponse({ description: 'Reintento idempotente: transacción existente' })
  @ApiConflictResponse({ description: 'INSUFFICIENT_STOCK | IDEMPOTENCY_CONFLICT' })
  @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND' })
  async create(
    @IdempotencyKeyHeader(new IdempotencyKeyPipe()) idempotencyKey: string,
    @Body() body: CreateTransactionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return respond(
      this.createTransaction.execute({
        idempotencyKey,
        productId: body.productId,
        quantity: body.quantity,
        customer: body.customer,
        shipping: { ...body.shipping, postalCode: body.shipping.postalCode ?? null },
        payment: body.payment,
      }),
      ({ details, replayed }) => {
        response.status(replayed ? HttpStatus.OK : HttpStatus.CREATED);
        response.setHeader('Location', `/api/v1/transactions/${details.transaction.id}`);
        return presentTransaction(details);
      },
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consulta una transacción',
    description: 'Si está PENDING se sincroniza con la pasarela antes de responder (pensado para polling).',
  })
  @ApiNotFoundResponse({ description: 'TRANSACTION_NOT_FOUND' })
  findOne(@Param('id', uuid) id: string) {
    return respond(this.getTransaction.execute(id), presentTransaction);
  }
}

@ApiTags('Entregas')
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly getDelivery: GetDeliveryUseCase) {}

  @Get(':id')
  @ApiOperation({ summary: 'Estado de una entrega' })
  @ApiNotFoundResponse({ description: 'DELIVERY_NOT_FOUND' })
  findOne(@Param('id', uuid) id: string) {
    return respond(this.getDelivery.execute(id), presentDelivery);
  }
}

@ApiTags('Webhooks')
@Controller('webhooks')
export class PaymentEventsController {
  constructor(private readonly handleEvent: HandlePaymentEventUseCase) {}

  @Post('payment-events')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recibe eventos de la pasarela (firma verificada con checksum)' })
  @ApiUnauthorizedResponse({ description: 'INVALID_EVENT_SIGNATURE' })
  receive(@Body() payload: Record<string, unknown>) {
    return respond(this.handleEvent.execute(payload), (result) => result);
  }
}
