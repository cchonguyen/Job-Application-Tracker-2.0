import { DiagnosticStep, ExtractedJobAttributes } from '../types.ts';

export interface AtsProviderResult {
  extractedData: ExtractedJobAttributes;
  tierUsed: string;
}

export interface AtsProvider {
  readonly name: string;
  canHandle(url: string, atsInfo?: { type: string | null; board?: string; jobId?: string }): boolean;
  extract(
    url: string,
    atsInfo: { type: string | null; board?: string; jobId?: string },
    diagnosticSteps: DiagnosticStep[]
  ): Promise<AtsProviderResult>;
}
