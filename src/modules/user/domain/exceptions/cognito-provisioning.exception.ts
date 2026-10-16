import { InternalServerErrorException } from '@nestjs/common';

export class CognitoProvisioningException extends InternalServerErrorException {
  public readonly errorCode?: string;

  constructor(message: string, errorCode?: string, cause?: unknown) {
    super(
      {
        statusCode: 500,
        error: 'CognitoProvisioningError',
        message,
        errorCode,
      },
      cause ? { cause: cause as Error } : undefined,
    );
    this.errorCode = errorCode;
  }
}
