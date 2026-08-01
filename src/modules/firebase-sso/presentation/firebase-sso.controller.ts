import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  FirebaseSsoApplicationService,
  FirebaseSsoAuthResult,
} from '../application/firebase-sso-application.service';
import { LoginWithFirebaseDto } from './dto/login-with-firebase.dto';
import {
  AmbiguousIdentityMappingException,
  ExternalIdentityNotMappedException,
  FirebaseProviderUnavailableException,
  InvalidFirebaseTokenException,
} from '../domain/exceptions/firebase-sso.exceptions';

@Controller('auth/login/firebase')
export class FirebaseSsoController {
  constructor(private readonly ssoAppService: FirebaseSsoApplicationService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async loginWithFirebase(
    @Body() dto: LoginWithFirebaseDto,
  ): Promise<{ status: string; data: FirebaseSsoAuthResult }> {
    try {
      const result = await this.ssoAppService.authenticateSso(dto);
      return {
        status: 'SUCCESS',
        data: result,
      };
    } catch (error) {
      if (
        error instanceof InvalidFirebaseTokenException ||
        error instanceof ExternalIdentityNotMappedException
      ) {
        throw new UnauthorizedException(
          'Authentication failed via Single Sign-On. Please try again or contact your administrator.',
        );
      }
      if (error instanceof AmbiguousIdentityMappingException) {
        throw new ConflictException(
          'Authentication failed due to ambiguous identity mappings. Please contact your administrator.',
        );
      }
      if (error instanceof FirebaseProviderUnavailableException) {
        throw new ServiceUnavailableException(
          'Single Sign-On service is temporarily unavailable. Please try logging in with your password.',
        );
      }
      throw error;
    }
  }
}
