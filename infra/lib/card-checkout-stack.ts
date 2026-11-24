import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Api } from './api';
import { Database } from './database';
import { Frontend } from './frontend';
import { Network } from './network';

export interface CardCheckoutStackProps extends StackProps {
  readonly paymentGatewayBaseUrl: string;
  readonly gatewaySecretName: string;
  readonly backendAssetPath: string;
  readonly frontendAssetPath: string;
  readonly baseFeeInCents?: string;
  readonly deliveryFeeInCents?: string;
}

/**
 *   Usuario ──HTTPS──> CloudFront ──/*──────> S3 (SPA)
 *                         └──────/api/*──> API Gateway ──> Lambda (NestJS) ──> RDS PostgreSQL
 *                                                              └──NAT──> Pasarela de pagos
 */
export class CardCheckoutStack extends Stack {
  constructor(scope: Construct, id: string, props: CardCheckoutStackProps) {
    super(scope, id, props);

    const { vpc } = new Network(this, 'Network');
    const database = new Database(this, 'Database', { vpc });
    const api = new Api(this, 'Api', {
      vpc,
      database: database.instance,
      assetPath: props.backendAssetPath,
      gatewaySecretName: props.gatewaySecretName,
      paymentGatewayBaseUrl: props.paymentGatewayBaseUrl,
      baseFeeInCents: props.baseFeeInCents ?? '300000',
      deliveryFeeInCents: props.deliveryFeeInCents ?? '1000000',
    });
    const frontend = new Frontend(this, 'Frontend', {
      httpApi: api.httpApi,
      assetPath: props.frontendAssetPath,
      paymentGatewayBaseUrl: props.paymentGatewayBaseUrl,
    });

    const siteUrl = `https://${frontend.distribution.distributionDomainName}`;
    new CfnOutput(this, 'SiteUrl', { value: siteUrl, description: 'Aplicación (SPA)' });
    new CfnOutput(this, 'ApiDocsUrl', { value: `${siteUrl}/api/v1/docs`, description: 'Swagger UI' });
    new CfnOutput(this, 'ApiGatewayUrl', { value: api.httpApi.apiEndpoint, description: 'API directa (sin CDN)' });
  }
}
