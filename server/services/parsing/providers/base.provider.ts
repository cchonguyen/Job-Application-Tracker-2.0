import { DiagnosticStep, ExtractedJobAttributes } from '../types.ts';

export interface AtsProviderOptions {
  checkAiQuota?: () => Promise<boolean>;
}

export interface AtsProviderResult {
  extractedData: ExtractedJobAttributes;
  tierUsed: string;
}

export interface AtsProvider {
  readonly name: string;
  canHandle(url: string, atsInfo?: any): boolean;
  extract(
    url: string,
    atsInfo: any,
    diagnosticSteps: DiagnosticStep[],
    options?: AtsProviderOptions
  ): Promise<AtsProviderResult>;
}


