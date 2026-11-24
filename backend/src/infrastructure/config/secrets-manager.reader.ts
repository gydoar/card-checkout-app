import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SecretReader } from './secrets-loader';

/** Lector real basado en el SDK v3 (incluido en el runtime de Lambda Node.js 22). */
export const secretsManagerReader = (client = new SecretsManagerClient({})): SecretReader => {
  return async (secretId: string) => {
    const output = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
    if (!output.SecretString) throw new Error(`El secreto ${secretId} está vacío`);
    return output.SecretString;
  };
};
