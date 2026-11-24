import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CardCheckoutStack } from '../lib/card-checkout-stack';

/** Verifica sobre la plantilla CloudFormation las garantías de seguridad de la infraestructura. */
describe('CardCheckoutStack', () => {
  const assets = mkdtempSync(join(tmpdir(), 'cca-infra-'));
  const backend = join(assets, 'backend');
  const frontend = join(assets, 'frontend');
  mkdirSync(join(frontend, 'assets'), { recursive: true });
  mkdirSync(backend, { recursive: true });
  writeFileSync(join(frontend, 'index.html'), '<html></html>');
  writeFileSync(join(frontend, 'assets', 'app.js'), '');
  writeFileSync(join(backend, 'index.js'), '');

  const stack = new CardCheckoutStack(new App(), 'Test', {
    env: { account: '123456789012', region: 'us-east-1' },
    paymentGatewayBaseUrl: 'https://gateway.example/v1',
    gatewaySecretName: 'card-checkout/payment-gateway',
    backendAssetPath: backend,
    frontendAssetPath: frontend,
  });
  const template = Template.fromStack(stack);

  it('RDS: privado, cifrado y con TLS obligatorio', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'postgres',
      PubliclyAccessible: false,
      StorageEncrypted: true,
      DBInstanceClass: 'db.t4g.micro',
    });
    template.hasResourceProperties('AWS::RDS::DBParameterGroup', { Parameters: { 'rds.force_ssl': '1' } });
  });

  it('Lambdas: Node 22 arm64 dentro de la VPC y sin secretos en texto plano', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Architectures: ['arm64'],
      Handler: 'dist/lambda.handler',
      VpcConfig: Match.objectLike({ SubnetIds: Match.anyValue() }),
      Environment: {
        Variables: Match.objectLike({
          NODE_ENV: 'production',
          DB_SSL: 'true',
          GATEWAY_SECRET_ID: 'card-checkout/payment-gateway',
          DB_SECRET_ID: Match.anyValue(),
        }),
      },
    });
    const variables = JSON.stringify(template.findResources('AWS::Lambda::Function'));
    expect(variables).not.toMatch(/PRIVATE_KEY|INTEGRITY_SECRET|EVENTS_SECRET|DB_PASSWORD/);
  });

  it('migraciones automáticas en cada despliegue', () => {
    template.hasResourceProperties('AWS::Lambda::Function', { Handler: 'dist/migrate.lambda.handler' });
    template.resourceCountIs('Custom::Trigger', 1);
  });

  it('API Gateway con límite de tasa', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      DefaultRouteSettings: { ThrottlingRateLimit: 20, ThrottlingBurstLimit: 40 },
    });
  });

  it('S3 privado, cifrado y solo HTTPS', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } }),
        ]),
      },
    });
  });

  it('CloudFront: HTTPS, HTTP/3, /api/* sin caché y cabeceras de seguridad con CSP estricta', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        HttpVersion: 'http2and3',
        DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: 'redirect-to-https' }),
        CacheBehaviors: [
          Match.objectLike({
            PathPattern: '/api/*',
            ViewerProtocolPolicy: 'https-only',
            CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad', // CachingDisabled (política administrada)
          }),
        ],
      }),
    });
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: Match.objectLike({
        SecurityHeadersConfig: Match.objectLike({
          ContentSecurityPolicy: {
            ContentSecurityPolicy: Match.stringLikeRegexp("connect-src 'self' https://gateway.example;.*frame-ancestors 'none'"),
            Override: true,
          },
          StrictTransportSecurity: Match.objectLike({ Preload: true, IncludeSubdomains: true }),
          FrameOptions: { FrameOption: 'DENY', Override: true },
        }),
      }),
    });
  });

  it('expone las URLs de la app y de Swagger', () => {
    template.hasOutput('SiteUrl', {});
    template.hasOutput('ApiDocsUrl', {});
  });
});
