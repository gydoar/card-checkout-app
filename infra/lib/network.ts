import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

/**
 * Red privada en 3 capas:
 *   public   -> solo la instancia NAT
 *   app      -> Lambdas (salida a internet vía NAT para llamar a la pasarela)
 *   data     -> RDS, sin ruta a internet en ninguna dirección
 *
 * Se usa una instancia NAT t3.micro (capa gratuita) en lugar de un NAT Gateway
 * administrado (~USD 32/mes): suficiente para el volumen de esta prueba.
 */
export class Network extends Construct {
  readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const natProvider = ec2.NatProvider.instanceV2({
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      defaultAllowedTraffic: ec2.NatTrafficDirection.OUTBOUND_ONLY,
    });

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
      natGatewayProvider: natProvider,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'app', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'data', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // La NAT solo acepta tráfico originado dentro de la VPC
    natProvider.connections.allowFrom(ec2.Peer.ipv4(this.vpc.vpcCidrBlock), ec2.Port.allTraffic());
  }
}
