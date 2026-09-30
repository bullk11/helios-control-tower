/**
 * Cliente de revisión de encuestas Low Score.
 *
 * Helios tiene dos caminos:
 *   POST /surveys/review  — revisión completa (plazo 30 días desde responseDate)
 *   PATCH /surveys        — flujo legacy: observations + reviewed=true (sin plazo)
 */

import { config } from '@/lib/config';
import { HeliosHttpError, fetchWithAuth } from '@/lib/auth';

const base = () => config.heliosApiUrl;

export type SurveyReviewMethod = 'review' | 'legacy';

const REVIEW_LIMIT_MESSAGE = 'exceeded the limit for review';

const shouldFallbackToLegacyReview = (error: unknown): boolean =>
  error instanceof HeliosHttpError &&
  error.status === 400 &&
  (error.message?.includes(REVIEW_LIMIT_MESSAGE) ?? false);

/** POST /surveys/review — revisión formal dentro de los 30 días. */
export const markSurveyReviewedViaReview = async (input: {
  serviceId: string;
  agentObservations?: string;
  contactSuccessful?: boolean;
}): Promise<void> => {
  await fetchWithAuth(`${base()}/surveys/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceId: input.serviceId,
      contactSuccessful: input.contactSuccessful ?? true,
      agentObservations: input.agentObservations ?? '',
      comments: '',
    }),
  });
};

/**
 * PATCH /surveys — mismo camino que el componente legacy de Helios cuando solo
 * se guardan observaciones y se marca reviewed=true.
 */
export const markSurveyReviewedViaLegacyPatch = async (input: {
  serviceId: string;
  agentObservations?: string;
}): Promise<void> => {
  await fetchWithAuth(`${base()}/surveys`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceId: input.serviceId,
      answers: {},
      mapQuestions: {},
      observations: input.agentObservations ?? '',
    }),
  });
};

/** Intenta review formal; si Helios rechaza por plazo, usa PATCH legacy. */
export const markSurveyReviewed = async (input: {
  serviceId: string;
  agentObservations?: string;
  contactSuccessful?: boolean;
}): Promise<SurveyReviewMethod> => {
  try {
    await markSurveyReviewedViaReview(input);
    return 'review';
  } catch (error) {
    if (!shouldFallbackToLegacyReview(error)) throw error;
    await markSurveyReviewedViaLegacyPatch(input);
    return 'legacy';
  }
};
