/**
 * `GET /api/v2/services` devuelve SOLO `{_id: 1}` si no mandas `projection`.
 * (helios_api/src/routes/api/services/v2/service.controller.ts)
 *
 * Esta es la proyección que necesita Control Tower. Está alineada con la que usa
 * el Service Q real del Helios Angular
 * (helios_frontend/src/modules/dashboard/dashboard-schema/service-q-schema.service.ts)
 * más los campos que el mockup muestra en el detalle del caso.
 */
export const CONTROL_TOWER_PROJECTION = {
  serviceNumber: 1,
  status: 1,
  serviceType: 1,
  situation: 1,
  branch: 1,
  account: 1,
  sfIdAccount: 1,
  firstname: 1,
  lastname: 1,
  phone1: 1,
  plate: 1,
  pinSituationAddress: 1,
  locations: 1,
  providerName: 1,
  'provider.name': 1,
  driverName: 1,
  'driver.name': 1,
  'driver.id': 1,
  trip: 1,
  monitor: 1,
  auditReason: 1,
  isAuditHold: 1,
  'surveys.hasLowScore': 1,
  'surveys.reviewed': 1,
  'flags.emergency': 1,
  'flags.vip': 1,
  warnings: 1,
  created: 1,
  date: 1,
  schedule: 1,
  modified: 1,
} as const;
