import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

/**
 * PostgreSQL 16 en RDS (db.t4g.micro, capa gratuita):
 * subred aislada, cifrado en reposo, TLS obligatorio (rds.force_ssl) y
 * credenciales generadas en Secrets Manager (nadie las ve ni se versionan).
 */
export class Database extends Construct {
  readonly instance: rds.DatabaseInstance;

  constructor(scope: Construct, id: string, props: { vpc: ec2.IVpc }) {
    super(scope, id);

    const engine = rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 });

    this.instance = new rds.DatabaseInstance(this, 'Postgres', {
      engine,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      credentials: rds.Credentials.fromGeneratedSecret('checkout_admin'),
      databaseName: 'checkout',
      allocatedStorage: 20,
      maxAllocatedStorage: 20,
      storageEncrypted: true,
      publiclyAccessible: false,
      multiAz: false,
      backupRetention: Duration.days(1),
      parameterGroup: new rds.ParameterGroup(this, 'Parameters', {
        engine,
        parameters: { 'rds.force_ssl': '1' },
      }),
      // Ambiente de prueba técnica: se puede destruir sin dejar costos
      deletionProtection: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}
