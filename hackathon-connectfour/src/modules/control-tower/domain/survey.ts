/**
 * Cola Low Score Surveys (Backoffice).
 *
 * En Helios el trabajo no es check-in ni cierre: el agente revisa la encuesta
 * post-servicio (`surveys.hasLowScore && !surveys.reviewed`) en el detalle,
 * contacta al cliente si hace falta y guarda la revisión con
 * `POST /surveys/review` (helios_api/src/routes/surveys/surveys.router.ts).
 */

import type { CaseAction } from './actions';

export const LOW_SCORE_ACTIONS: CaseAction[] = [
  {
    id: 'contact-customer-survey',
    label: 'Contactar al cliente',
    endpoint: 'POST /services/addNote (chatType: corporate_client)',
    implemented: true,
    note: 'En Helios el review de Low Score incluye contactSuccessful; acá queda el contacto en el chat de cuenta.',
  },
  {
    id: 'mark-survey-reviewed',
    label: 'Marcar encuesta como revisada',
    endpoint: 'POST /surveys/review',
    implemented: true,
    note: 'Dentro de 30 días usa review formal; fuera de plazo cae al PATCH legacy de Helios.',
  },
];
