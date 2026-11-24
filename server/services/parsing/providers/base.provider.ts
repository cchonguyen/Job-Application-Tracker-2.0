import { DiagnosticStep, ExtractedJobAttributes } from '../types.ts';
import { extractWithGemini } from '../ai/geminiExtractor.ts';
import { tryFastPathNormalize } from '../utils/fastPathNormalizer.ts';

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

export interface AtsTailArgs {
  diagnosticSteps: DiagnosticStep[];
  options?: AtsProviderOptions;
  /** Input for the Tier 1.5 fast-path normalizer. */
  fastPathInput: Parameters<typeof tryFastPathNormalize>[0];
  /** Built lazily so the Gemini payload is serialised inside the Gemini try block. */
  buildGeminiInput: () => Parameters<typeof extractWithGemini>[0];
  /** Built lazily. `afterGeminiFailure` is true only on the Gemini catch path. */
  buildFallback: (afterGeminiFailure: boolean) => ExtractedJobAttributes;
  tierNames: { fastPath: string; gemini: string; direct: string };
  /** Defaults to 'Synthesize & Enrich ATS Payload'. */
  geminiStepName?: string;
  /** Whether the Gemini step gets durationMs when the Gemini call fails. */
  recordDurationOnFailure: boolean;
  /** Defaults to 'Gemini call failed (<msg>). Using direct ATS parsed fields.' */
  failureDetails?: (message: string) => string;
}

/**
 * Shared tail of every ATS provider's extract(), run after the payload is fetched:
 * Tier 1.5 fast path, then the AI quota check, then Gemini with a direct-field fallback.
 */
export async function finishAtsExtraction(args: AtsTailArgs): Promise<AtsProviderResult> {
  const { diagnosticSteps, options, tierNames } = args;

  const fastPath = tryFastPathNormalize(args.fastPathInput);
  if (fastPath) {
    diagnosticSteps.push({
      tier: 'Tier 1.5 (Fast-Path Normalizer)',
      name: 'Strict Fast-Path Normalizer',
      status: 'success',
      details: 'Structured ATS data satisfied high-confidence threshold. Extracted deterministically with 0 AI quota consumed.',
    });
    return {
      extractedData: fastPath,
      tierUsed: tierNames.fastPath,
    };
  }

  if (options?.checkAiQuota && !(await options.checkAiQuota())) {
    diagnosticSteps.push({
      tier: 'Tier 3 (AI Quota Check)',
      name: 'Daily AI Extraction Quota Limit',
      status: 'skipped',
      details: 'Daily AI extraction quota reached. Skipping Gemini normalization.',
    });
    return {
      extractedData: args.buildFallback(false),
      tierUsed: tierNames.direct,
    };
  }

  const geminiStart = Date.now();
  diagnosticSteps.push({
    tier: 'Tier 3 (Gemini Normalization)',
    name: args.geminiStepName ?? 'Synthesize & Enrich ATS Payload',
    status: 'pending',
  });

  try {
    const structured = await extractWithGemini(args.buildGeminiInput());

    diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
    diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - geminiStart;
    diagnosticSteps[diagnosticSteps.length - 1].details = `Normalized attributes for ${structured.company} - ${structured.jobTitle}`;

    return {
      extractedData: structured,
      tierUsed: tierNames.gemini,
    };
  } catch (geminiErr: any) {
    diagnosticSteps[diagnosticSteps.length - 1].status = 'failed';
    if (args.recordDurationOnFailure) {
      diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - geminiStart;
    }
    diagnosticSteps[diagnosticSteps.length - 1].details = args.failureDetails
      ? args.failureDetails(geminiErr.message)
      : `Gemini call failed (${geminiErr.message}). Using direct ATS parsed fields.`;

    return {
      extractedData: args.buildFallback(true),
      tierUsed: tierNames.direct,
    };
  }
}
