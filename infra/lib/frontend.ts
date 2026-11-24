import * as path from 'node:path';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export interface FrontendProps {
  readonly httpApi: apigwv2.HttpApi;
  /** Carpeta generada por `npm run build` en /frontend */
  readonly assetPath: string;
  /** Origen de la pasarela: el navegador tokeniza la tarjeta directamente contra él */
  readonly paymentGatewayBaseUrl: string;
}

/**
 * SPA en S3 privado + CloudFront (HTTPS, HTTP/3, compresión).
 * CloudFront también enruta /api/* hacia API Gateway: un solo dominio para todo,
 * sin CORS y con una CSP estricta.
 */
export class Frontend extends Construct {
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: FrontendProps) {
    super(scope, id);

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const gatewayOrigin = new URL(props.paymentGatewayBaseUrl).origin;

    // Cabeceras de seguridad (OWASP / Mozilla Observatory)
    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy: [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            `connect-src 'self' ${gatewayOrigin}`,
            "font-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            'upgrade-insecure-requests',
          ].join('; '),
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(730),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          { header: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()', override: true },
          { header: 'Cross-Origin-Opener-Policy', value: 'same-origin', override: true },
        ],
      },
    });

    // Rutas del SPA (/products/x, /checkout/y) -> index.html. Se hace con una función
    // y no con "error responses" para no convertir los 404 reales de la API en HTML.
    const spaRouting = new cloudfront.Function(this, 'SpaRouting', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(
        "function handler(event) { var r = event.request; if (r.uri.indexOf('.') === -1) { r.uri = '/index.html'; } return r; }",
      ),
    });

    const apiDomain = `${props.httpApi.apiId}.execute-api.${Stack.of(this).region}.amazonaws.com`;

    this.distribution = new cloudfront.Distribution(this, 'Cdn', {
      comment: 'Card checkout SPA + API',
      defaultRootObject: 'index.html',
      // Con un dominio propio (certificado ACM) se añadiría minimumProtocolVersion: TLS_V1_2_2021.
      // Con *.cloudfront.net la política TLS la fija AWS.
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
        functionAssociations: [{ function: spaRouting, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
        compress: true,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(apiDomain, { protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          // Stock y pagos nunca se cachean en el CDN
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    // Assets con hash en el nombre: caché de 1 año. El resto (index, imágenes): caché corta.
    new s3deploy.BucketDeployment(this, 'DeployHashedAssets', {
      sources: [s3deploy.Source.asset(path.join(props.assetPath, 'assets'))],
      destinationBucket: bucket,
      destinationKeyPrefix: 'assets/',
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=31536000, immutable')],
      prune: false,
    });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(props.assetPath, { exclude: ['assets/*'] })],
      destinationBucket: bucket,
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=300, must-revalidate')],
      prune: false,
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });
  }
}
