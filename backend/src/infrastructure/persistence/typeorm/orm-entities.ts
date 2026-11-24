import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ValueTransformer,
} from 'typeorm';

/**
 * Modelos de persistencia (adaptador). Son distintos a las entidades de dominio:
 * el dominio no depende de decoradores de TypeORM. Los mappers traducen entre ambos.
 * El esquema real lo define la migración (synchronize está desactivado).
 */

/** `pg` devuelve BIGINT como string para no perder precisión; los montos caben en Number. */
const bigintToNumber: ValueTransformer = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

@Entity('products')
export class ProductOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 32, unique: true })
  sku!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ name: 'price_in_cents', type: 'bigint', transformer: bigintToNumber })
  priceInCents!: number;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'integer' })
  stock!: number;

  @Column({ name: 'image_url', type: 'varchar', length: 255 })
  imageUrl!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity('customers')
export class CustomerOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 254, unique: true })
  email!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 120 })
  fullName!: string;

  @Column({ type: 'varchar', length: 20 })
  phone!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity('transactions')
export class TransactionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  reference!: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => ProductOrmEntity)
  @JoinColumn({ name: 'product_id' })
  product?: ProductOrmEntity;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @ManyToOne(() => CustomerOrmEntity)
  @JoinColumn({ name: 'customer_id' })
  customer?: CustomerOrmEntity;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({ name: 'product_amount_in_cents', type: 'bigint', transformer: bigintToNumber })
  productAmountInCents!: number;

  @Column({ name: 'base_fee_in_cents', type: 'bigint', transformer: bigintToNumber })
  baseFeeInCents!: number;

  @Column({ name: 'delivery_fee_in_cents', type: 'bigint', transformer: bigintToNumber })
  deliveryFeeInCents!: number;

  @Column({ name: 'total_in_cents', type: 'bigint', transformer: bigintToNumber })
  totalInCents!: number;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: string;

  @Column({ name: 'status_message', type: 'varchar', length: 255, nullable: true })
  statusMessage!: string | null;

  @Column({ name: 'gateway_transaction_id', type: 'varchar', length: 64, nullable: true })
  gatewayTransactionId!: string | null;

  @Column({ name: 'card_brand', type: 'varchar', length: 20, nullable: true })
  cardBrand!: string | null;

  @Column({ name: 'card_last_four', type: 'char', length: 4, nullable: true })
  cardLastFour!: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 64, unique: true })
  idempotencyKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'finalized_at', type: 'timestamptz', nullable: true })
  finalizedAt!: Date | null;
}

@Entity('deliveries')
export class DeliveryOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'transaction_id', type: 'uuid', unique: true })
  transactionId!: string;

  @OneToOne(() => TransactionOrmEntity)
  @JoinColumn({ name: 'transaction_id' })
  transaction?: TransactionOrmEntity;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @ManyToOne(() => CustomerOrmEntity)
  @JoinColumn({ name: 'customer_id' })
  customer?: CustomerOrmEntity;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => ProductOrmEntity)
  @JoinColumn({ name: 'product_id' })
  product?: ProductOrmEntity;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({ name: 'recipient_name', type: 'varchar', length: 120 })
  recipientName!: string;

  @Column({ type: 'varchar', length: 20 })
  phone!: string;

  @Column({ name: 'address_line', type: 'varchar', length: 200 })
  addressLine!: string;

  @Column({ type: 'varchar', length: 80 })
  city!: string;

  @Column({ type: 'varchar', length: 80 })
  region!: string;

  @Column({ name: 'postal_code', type: 'varchar', length: 10, nullable: true })
  postalCode!: string | null;

  @Column({ type: 'varchar', length: 16 })
  status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

export const ORM_ENTITIES = [ProductOrmEntity, CustomerOrmEntity, TransactionOrmEntity, DeliveryOrmEntity];
