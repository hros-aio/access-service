export const DEFAULT_HIGH_IMPACT_THRESHOLD = 100;

export interface ImpactEstimate {
  usersGaining: number;
  usersLosing: number;
  totalAffected: number;
  isHighImpact: boolean;
  threshold: number;
  isEstimated: boolean;
}

export interface CoverageLossWarning {
  capabilityCode: string;
  priorHoldersCount: number;
  projectedHoldersCount: number;
  isCriticalLoss: boolean;
}

export interface ImpactAnalysisResult {
  targetType: 'ROLE' | 'USER_GROUP';
  targetId: string;
  estimate: ImpactEstimate;
  coverageLoss: CoverageLossWarning | null;
  requiresConfirmation: boolean;
}
