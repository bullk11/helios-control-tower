/**
 * Tipos que reflejan el contrato REAL de helios_api.
 *
 * Fuentes (rutas relativas al repo helios_api):
 *   - src/schemas/services.schema.ts      -> SERVICE_STATUS, AuditReasons, campos del servicio
 *   - src/utils/enums.ts                  -> TRIP_STATUS, TRACKS, Branches
 *   - src/schemas/notes.schema.ts         -> NoteChatType, NoteUserTypes, flags
 *   - src/routes/api/services/v2/types.ts -> ServicesResponse
 *   - src/routes/api/incoming-calls/v1/   -> Conversation + SERVICE_LOOKUP_PIPELINE
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** `service.status` — helios_api/src/schemas/services.schema.ts:127 */
export const SERVICE_STATUS = {
  ACTIVE: 'Active',
  HOLD: 'Hold',
  HOLD_INSPECTION: 'HoldInspection',
  FINISHED: 'Finished',
  CANCELLED: 'Cancelled',
  NOT_COVERED: 'Not Covered',
  INFORMATIVE: 'Informative',
  QUEUED: 'Queued',
  NEW: 'New',
  AUDIT: 'Audit',
  VOID: 'Void',
  HOLD_DELETED: 'Hold Deleted',
} as const;
export type ServiceStatus = (typeof SERVICE_STATUS)[keyof typeof SERVICE_STATUS];

/** `service.trip.status` — helios_api/src/utils/enums.ts:157 */
export const TRIP_STATUS = {
  NEW: 'new',
  ACCEPTED: 'accepted',
  ON_ROUTE: 'on_route',
  ARRIVED: 'arrived',
  TOWED: 'towed',
  FINISHED: 'finished',
  CANCELLED: 'cancelled',
  CANCELLED_BY_DRIVER: 'cancelled_by_driver',
  PENDING_AUDIT: 'pending_audit',
} as const;
export type TripStatus = (typeof TRIP_STATUS)[keyof typeof TRIP_STATUS];

/**
 * `service.monitor.status` — helios_api/src/models/enums (MonitorDetailsTypes),
 * calculado por src/controllers/helpers/services/monitor.helper.ts.
 * Estos son los "sistema automático detectó algo" del mockup.
 */
export const MONITOR_STATUS = {
  ON_TIME: 'onTime',
  HAS_NOT_ACCEPTED: 'hasNotAccepted',
  IS_NOT_ON_ROUTE: 'isNotOnRoute',
  HAS_NOT_FINISHED: 'hasNotFinished',
  DELAYED: 'delayed',
  NEW_MESSAGE: 'newMessage',
  MANAGED: 'managed',
  CHECK_IN: 'checkIn',
  PENDING_MANAGEMENT: 'pendingManagement',
} as const;
export type MonitorStatus = (typeof MONITOR_STATUS)[keyof typeof MONITOR_STATUS];

/** `notes.chatType` — helios_api/src/schemas/notes.schema.ts:9 */
export const NOTE_CHAT_TYPE = {
  DRIVER: 'driver',
  CORPORATE_CLIENT: 'corporate_client',
  ALL_CHATS: 'all_chats',
} as const;
export type NoteChatType = (typeof NOTE_CHAT_TYPE)[keyof typeof NOTE_CHAT_TYPE];

/** `notes.user.type` — helios_api/src/schemas/notes.schema.ts:15 */
export const NOTE_USER_TYPE = {
  PROVIDER: 'provider',
  ACCOUNT: 'account',
  USER: 'user',
  DRIVER: 'driver',
} as const;
export type NoteUserType = (typeof NOTE_USER_TYPE)[keyof typeof NOTE_USER_TYPE];

// ---------------------------------------------------------------------------
// Documento de servicio (subconjunto que consume Control Tower)
// ---------------------------------------------------------------------------

export interface HeliosLocation {
  lat?: number;
  lng?: number;
  address?: string;
  branch?: string;
}

export interface HeliosServiceLocations {
  provider?: HeliosLocation;
  situation?: HeliosLocation;
  destination?: HeliosLocation;
}

export interface HeliosTripStamp {
  status: TripStatus;
  time?: string;
  source?: string;
  employeeName?: string;
}

export interface HeliosTrip {
  status?: TripStatus;
  stamps?: HeliosTripStamp[];
  /** ETA en vivo: `eta` en segundos, `distance` en metros. */
  live?: { eta?: number; distance?: number };
  initialEta?: number;
  onRouteEta?: number;
  trueEta?: number;
  endTime?: string;
}

export interface HeliosMonitor {
  status?: MonitorStatus;
  eosStatus?: MonitorStatus;
  /** Si está seteado, el servicio tiene un check-in reminder agendado. */
  checkInReminderDate?: string | null;
  etaHistory?: number[];
  log?: Array<{ message?: string; status?: string; timestamp?: string; user?: string }>;
}

/**
 * Servicio de Helios. Todos los campos son opcionales porque
 * `GET /api/v2/services` devuelve exactamente lo que pidas en `projection`.
 */
export interface HeliosService {
  _id: string;
  serviceNumber?: number;
  status?: ServiceStatus;
  /** El track: road | home | concierge | claims. */
  serviceType?: string;
  /** Nombre del tipo de servicio, ej. towBreakdown, flatTire, Plumbing. */
  situation?: string;
  situationLabel?: string;
  branch?: string;
  /** Salesforce account id. */
  account?: string;
  sfIdAccount?: string;
  accountName?: string;
  firstname?: string;
  lastname?: string;
  phone1?: string;
  phone2?: string;
  plate?: string;
  pinSituationAddress?: string;
  locations?: HeliosServiceLocations;
  providerName?: string;
  provider?: { name?: string; _id?: string };
  driverName?: string;
  driver?: { id?: string; name?: string; providerName?: string };
  trip?: HeliosTrip;
  monitor?: HeliosMonitor;
  auditReason?: string;
  /** Hold de auditoría: `PATCH /services/:id/audit-hold`. */
  isAuditHold?: boolean;
  /** Encuesta post-servicio. Low Score Surveys = `hasLowScore && !reviewed`. */
  surveys?: { hasLowScore?: boolean; reviewed?: boolean; responseDate?: string };
  flags?: { emergency?: boolean; vip?: boolean };
  warnings?: string[];
  /** epoch ms */
  created?: number;
  /** ISO date usada por el monitor para calcular antigüedad. */
  date?: string;
  schedule?: string | null;
  modified?: string;
}

/** Envelope de `GET /api/v2/services` — helios_api/src/routes/api/services/v2/types.ts */
export interface HeliosServicesResponse {
  status: boolean;
  services: HeliosService[];
  totalDocs: number;
  limit: number;
  totalPages: number;
  page: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  prevPage: number | null;
  nextPage: number | null;
}

// ---------------------------------------------------------------------------
// Notas / chats
// ---------------------------------------------------------------------------

export interface HeliosNote {
  _id?: string;
  serviceId?: string;
  msg?: string;
  date?: string;
  employeeId?: string;
  user?: { id?: string; type?: NoteUserType };
  /** Observación interna: no la ve el proveedor. */
  isObservation?: boolean;
  /** Nota driver -> aseguradora. */
  d2iNote?: boolean;
  readFromHelios?: boolean;
  readFromEos?: boolean;
  chatType?: NoteChatType;
  audioUrl?: string;
  hideNote?: boolean;
}

// ---------------------------------------------------------------------------
// Check-in reminder
// ---------------------------------------------------------------------------

export interface HeliosCheckInReminder {
  _id?: string;
  serviceId?: string;
  userId?: string;
  checkInDate?: string;
  reason?: string;
  resolved?: boolean;
  resolvedReason?: string;
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Incoming calls (Audara -> Helios)
// ---------------------------------------------------------------------------

/**
 * Servicio tal como lo devuelve el `SERVICE_LOOKUP_PIPELINE` de
 * `GET /api/v1/incoming-calls/get-data`. Es una proyección fija y más chica que
 * `HeliosService`.
 */
export interface IncomingCallService {
  _id: string;
  firstname?: string;
  lastname?: string;
  created?: number;
  serviceNumber?: number;
  branch?: string;
  situation?: string;
  situationLabel?: string;
  status?: ServiceStatus;
  trip?: { status?: TripStatus };
  account?: string;
  accountName?: string;
  locations?: HeliosServiceLocations;
  date?: string;
  plate?: string;
  pinSituationAddress?: string;
}

export interface IncomingCallData {
  _id?: string;
  uniqueId?: string;
  /** Número del cliente que llama. */
  sourceNumber?: string;
  /** Línea marcada. */
  didNumber?: string;
  branch?: string;
  agentNumber?: string;
  accountIdentifier?: string;
  customerContract?: {
    customer?: {
      full_name?: string;
      first_name?: string;
      last_name?: string;
      phone_number1?: string;
      phone_number2?: string;
      id_card?: string;
    };
    vehicle?: { plate?: string; make?: string; model?: string; year?: string };
    account?: { salesforce_id?: string; name?: string };
  };
  activeServices?: Array<IncomingCallService | string>;
  /** Ojo: helios_api a veces devuelve acá strings (ids) sin hidratar. */
  holdInspectionServices?: Array<IncomingCallService | string>;
}
