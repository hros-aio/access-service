import { HttpException, HttpStatus } from '@nestjs/common';

import { ImpactEstimate } from '../interfaces/impact-analysis.interface';

export class HighImpactConfirmationRequiredException extends HttpException {
  constructor(details: ImpactEstimate) {
    super('High-impact confirmation required for this operation', HttpStatus.CONFLICT);
    this.cause = details;
  }
}
