#!/usr/bin/env node
import * as path from 'node:path';
import { App, Tags } from 'aws-cdk-lib';
import { CardCheckoutStack } from '../lib/card-checkout-stack';

/**
 * La URL de la pasarela llega por variable de entorno (no se versiona en el repo).
 *   PAYMENT_GATEWAY_BASE_URL=https://.../v1 npx cdk deploy
 */
const paymentGatewayBaseUrl = process.env.PAYMENT_GATEWAY_BASE_URL;
if (!paymentGatewayBaseUrl?.startsWith('https://')) {
  throw new Error('Define PAYMENT_GATEWAY_BASE_URL (https) antes de sintetizar o desplegar.');
}

const app = new App();
const stack = new CardCheckoutStack(app, 'CardCheckoutStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1' },
  paymentGatewayBaseUrl,
  gatewaySecretName: process.env.GATEWAY_SECRET_NAME ?? 'card-checkout/payment-gateway',
  backendAssetPath: path.join(__dirname, '../../backend/.lambda'),
  frontendAssetPath: path.join(__dirname, '../../frontend/dist'),
  baseFeeInCents: process.env.BASE_FEE_IN_CENTS,
  deliveryFeeInCents: process.env.DELIVERY_FEE_IN_CENTS,
});
Tags.of(stack).add('project', 'card-checkout-app');
