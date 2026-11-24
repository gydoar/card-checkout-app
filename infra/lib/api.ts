import { Duration } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as triggers from 'aws-cdk-lib/triggers';
import { Construct } from 'constructs';

export interface ApiProps {
  readonly vpc: ec2.IVpc;
  readonly database: rds.DatabaseInstance;
  /** Carpeta generada por `npm run package:lambda` en /backend */
  readonly assetPath: string;
  readonly gatewaySecretName: string;
  readonly paymentGatewayBaseUrl: string;
  readonly baseFeeInCents: string;
  readonly deliveryFeeInCents: string;
}

/**
 * Backend NestJS en AWS Lambda (arm64, Node 22) detrás de API Gateway HTTP API.
 * Una segunda Lambda aplica migraciones + seed automáticamente en cada despliegue.
 */
export class Api extends Construct {
  readonly httpApi: apigwv2.HttpApi;
  readonly handler: lambda.Function;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    const dbSecret = props.database.secret!;
    const gatewaySecret = secretsmanager.Secret.fromSecretNameV2(this, 'GatewaySecret', props.gatewaySecretName);

    // Los secretos NO van en variables de entorno: solo sus identificadores
    const environment = {
      NODE_ENV: 'production',
      DB_SECRET_ID: dbSecret.secretArn,
      GATEWAY_SECRET_ID: props.gatewaySecretName,
      DB_SSL: 'true',
      DB_SSL_CA_PATH: '/var/task/certs/rds-global-bundle.pem',
      PAYMENT_GATEWAY_BASE_URL: props.paymentGatewayBaseUrl,
      BASE_FEE_IN_CENTS: props.baseFeeInCents,
      DELIVERY_FEE_IN_CENTS: props.deliveryFeeInCents,
      // SPA y API comparten dominio (CloudFront): no se necesita CORS
      CORS_ORIGINS: '',
      NODE_OPTIONS: '--enable-source-maps',
    };

    const code = lambda.Code.fromAsset(props.assetPath);
    const shared = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      code,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      environment,
    };

    this.handler = new lambda.Function(this, 'ApiFunction', {
      ...shared,
      handler: 'dist/lambda.handler',
      memorySize: 1024,
      timeout: Duration.seconds(29),
      logGroup: new logs.LogGroup(this, 'ApiLogs', { retention: logs.RetentionDays.TWO_WEEKS }),
    });

    const migrate = new lambda.Function(this, 'MigrateFunction', {
      ...shared,
      handler: 'dist/migrate.lambda.handler',
      memorySize: 512,
      timeout: Duration.minutes(2),
      logGroup: new logs.LogGroup(this, 'MigrateLogs', { retention: logs.RetentionDays.TWO_WEEKS }),
    });

    for (const fn of [this.handler, migrate]) {
      dbSecret.grantRead(fn);
      gatewaySecret.grantRead(fn);
      props.database.connections.allowDefaultPortFrom(fn, 'Lambda -> Postgres');
    }

    // Migraciones + seed en cada despliegue, después de que la BD exista
    new triggers.Trigger(this, 'MigrateOnDeploy', {
      handler: migrate,
      executeAfter: [props.database],
      executeOnHandlerChange: true,
    });

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      description: 'Card checkout API',
      defaultIntegration: new HttpLambdaIntegration('LambdaIntegration', this.handler),
    });

    // Límite de tasa a nivel de API Gateway (complementa el rate limiting de la app)
    const stage = this.httpApi.defaultStage!.node.defaultChild as apigwv2.CfnStage;
    stage.defaultRouteSettings = { throttlingRateLimit: 20, throttlingBurstLimit: 40 };
  }
}
