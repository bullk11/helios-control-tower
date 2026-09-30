# Helios Control Tower — Prototipo y contexto de integración

Documentación del prototipo que vive en [`control-tower-prototype/`](./control-tower-prototype).

Este documento tiene dos audiencias:

- **Producto y diseño**: qué modela el Control Tower, de dónde sale cada dato y qué decisiones quedaron abiertas.
- **Ingeniería**: el mapa exacto de endpoints, headers, parámetros y payloads de las APIs de Helios que el prototipo consume, y qué falta construir en backend.

---

## 1. Punto de partida

El insumo fue `Helios Control Tower y Encolado (1).zip`, que contiene:

| Archivo | Qué es |
| --- | --- |
| `Helios Control Tower - Mockup.dc.html` | Mockup interactivo con dos pantallas: el prototipo y su documentación. 1.160 líneas, con la lógica de negocio en un `<script type="text/x-dc">`. |
| `support.js` | Runtime del renderizador del mockup. |
| `_ds/connect-design-system-<hash>/` | Connect Design System: tokens (`colors`, `typography`, `spacing`, `fonts`), fuentes `Connect-*.otf`, bundle y manifest. |

Está extraído en `_extracted/` para poder consultarlo.

### Qué propone el mockup

Una cola de trabajo para el equipo que atiende servicios **después del despacho**. El alcance es explícito:

> Arranca después del despacho — no incluye la asignación del servicio.

Piezas del modelo:

- **4 etapas**: Camino al servicio → En ejecución → Cierre y validación → Seguimiento post-servicio.
- **Grupos de trabajo** con capacidad máxima simultánea, agrupables por momento del servicio, cuenta o país.
- **Cola con límite de vista** (5 casos a la vez) priorizando urgentes y antiguos.
- **Auditoría** como cola aparte: cuando un servicio "se cae" al cerrarse o cancelarse.
- **Detalle del caso** con acciones por etapa, 3 conversaciones y check-in reminders.
- **Llamada entrante de Audara** que resuelve el contexto del número antes de que el agente escriba.

---

## 2. Repos involucrados y su estado

Todos se actualizaron a la punta de su rama por defecto antes de construir el prototipo (`git pull --ff-only`, sin sobreescribir nada local).

| Repo | Rama | Rol en Control Tower |
| --- | --- | --- |
| `helios_api` | `master` | **La API principal.** Monolito Express 4 + Mongoose 6 + TypeScript. Aquí viven servicios, trip status, notas, auditoría, monitor, check-in reminders e incoming-calls. |
| `helios_frontend` | `master` | Angular 19. Referencia de auth (Cognito), del HTTP client, del navbar y del Service Q, que es la cola que más se parece a Control Tower. |
| `nextjs_helios_dispatch` | `master` | Next.js 14. Referencia del stack moderno y del cliente de incoming-calls. Sus pantallas son iframes embebidos en el Angular. |
| `connect-types` | `main` | Tipos compartidos (`@connect-assistance/types`). Solo tipos, sin runtime. |
| `serverless-helios-api` | `main` | `core-api`. Acciones secundarias sobre el servicio. Marginal para este alcance. |
| `eos-api`, `eos-web-2.0` | `staging` | El portal de la cuenta. Relevante solo porque el "chat cuenta / EOS" del mockup es la misma colección `notes` de Helios. **No les cambié de rama**: están en `staging`, que es su rama de trabajo. |

> Nota: `helios_api` traía 407 commits de atraso. Después de actualizar volví a verificar contra el código nuevo los contratos que usa el prototipo (auth, incoming-calls, enums, check-in reminder, parámetros de `/api/v2/services`). Todos siguen vigentes; lo único nuevo relevante son parámetros extra en el list API, anotados más abajo.

---

## 3. Cómo se conecta a las APIs

### 3.1 Autenticación — el detalle que más se equivoca

`helios_api` **no usa el esquema `Bearer`**. Su middleware global lee el token crudo:

```ts
// helios_api/src/controllers/auth.controller.ts:313
if (req.headers['authorization']) {
  const auth = await this.authenticate(req.headers['authorization'], req.headers['user-id']);
```

Entonces:

| Header | Valor |
| --- | --- |
| `Authorization` | El **ID token de Cognito**, crudo, sin prefijo `Bearer `. |
| `User-Id` | El mongo id del usuario. Opcional; hace falta cuando el token no trae `custom:mongo_id`. |

Hay tres caminos de autenticación en ese middleware: `x-api-key` (validado contra `src/app_access.yml`), el header `authorization`, y una whitelist de rutas públicas. Si nada aplica responde `403 { status: false, msg: 'No valid authentication.' }`.

`serverless-helios-api` (`/core-api/...`) es la excepción: ahí sí va `Bearer`.

El prototipo implementa esto en [`src/lib/auth.ts`](./control-tower-prototype/src/lib/auth.ts) con el mismo patrón que `nextjs_helios_dispatch/src/utils/auth.ts`:

```ts
fetchWithAuth(url, options, rawToken = true)
//                          ^ true  -> Authorization: <token>        (helios_api)
//                            false -> Authorization: Bearer <token> (core-api)
```

**El prototipo no hace login.** Recibe el token igual que los iframes de dispatch:

1. `?token=<idToken>` en la URL, que se persiste en `localStorage['auth_token']` y se limpia del query string.
2. Opcionalmente `?userId=<mongoId>` para el header `User-Id`.

Para obtener un token: abre el Helios Angular autenticado y saca `fetchAuthSession().tokens.idToken` de la sesión de Amplify.

### 3.2 La cola: `GET /api/v2/services`

El endpoint que alimenta la cola. Definido en `helios_api/src/routes/api/services/v2/`.

**Dos trampas importantes:**

1. **`projection` es obligatoria en la práctica.** Su default es `{_id: 1}`, así que sin ella la respuesta trae solo ids. Viaja como string JSON.
2. **Usa Atlas Search (`$search`).** Contra un mongod local sin Atlas no funciona. El fallback portable es `POST /api/v1/services/find`, que acepta un filtro estilo Mongo en el body.

Parámetros que usa el prototipo (todos los de lista van como CSV):

| Parámetro | Valor que manda el prototipo | Por qué |
| --- | --- | --- |
| `statuses` | `Active,Audit` | `Active` cubre las 4 etapas; `Audit` es la cola de auditoría. |
| `tripStatuses` | `accepted,on_route,arrived,towed,finished,cancelled,cancelled_by_driver,pending_audit` | Todo menos `new`: el modelo arranca post-despacho. |
| `branches` | nombre largo, ej. `Colombia` | Filtro de país. |
| `divisions` | `all` o `road`/`home`/`concierge` | **Ojo con el nombre**: el track se filtra con `divisions`, no con `tracks`. |
| `projection` | JSON de `CONTROL_TOWER_PROJECTION` | Si no, solo devuelve `_id`. |
| `sortBy` + `sortDirection` | `date` + `-1` | El validador exige `sortDirection` cuando mandas `sortBy`. |
| `page`, `limit` | `1`, `100` | Paginación. |

Respuesta:

```ts
{ status, services[], totalDocs, limit, totalPages, page, hasPrevPage, hasNextPage, prevPage, nextPage }
```

Otros parámetros disponibles y útiles a futuro: `accountIds` (filtra por `sfIdAccount`), `auditReasons`, `situations`, `drivers`, `providers`, `manageActiveServices` (el filtro "necesita atención" del Active Dashboard), `serviceQFilter`, rangos `createdStartDate`/`createdEndDate`, `scheduleStartDate`/`scheduleEndDate`, `checkInStartDate`/`checkInEndDate`, `exists`, `populate`, `sortOptions`. Recién agregados: `isOptimizedChargeableChain`, `ivrConfirmationStatus`, `surveyHasLowScore`, `surveyReviewed`.

Cliente: [`src/modules/helios/services.api.ts`](./control-tower-prototype/src/modules/helios/services.api.ts).

### 3.3 Llamada entrante: `incoming-calls`

Rutas confirmadas en `helios_api/src/routes/api/incoming-calls/v1/incoming-calls.router.ts:39-43`:

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/api/v1/incoming-calls/get-data?callUniqueId=…` | Resuelve el contexto del número. |
| `POST` | `/api/v1/incoming-calls/additional-data` | Vincula la llamada a un servicio. Body `{ uniqueId, serviceId }`. |
| `POST` | `/api/v1/incoming-calls` | Crea la conversación (lo hace Audara, no el frontend). |
| `GET` | `/api/v1/incoming-calls/search` | Busca por `sourceNumber` / `didNumber` / `serviceId`. |
| `POST` | `/api/v1/incoming-calls/:conversationId/readEvent` | Marca qué campos leyó el agente. |

`get-data` devuelve la conversación completa (`uniqueId`, `sourceNumber`, `didNumber`, `branch`, `customerContract` con cliente/vehículo/póliza/cuenta) más dos arrays de servicios hidratados por un pipeline fijo:

```
activeServices[] y holdInspectionServices[] → cada elemento:
{ _id, firstname, lastname, created, serviceNumber, branch, situation,
  situationLabel, status, trip: { status }, account, accountName,
  locations, date, plate, pinSituationAddress }
```

**Dos comportamientos a manejar:**

- Si no encuentra la conversación responde **200 con body vacío**, no 404.
- `holdInspectionServices` a veces trae **ids sueltos (strings)** en lugar de objetos hidratados. Hay que filtrarlos (igual que `isValidActiveService` en `nextjs_helios_dispatch`).

Cliente: [`src/modules/helios/incoming-calls.api.ts`](./control-tower-prototype/src/modules/helios/incoming-calls.api.ts).

### 3.4 Las 3 conversaciones del caso

En el mockup son tres chats. En Helios son **una sola colección `notes`** discriminada por campos (`helios_api/src/schemas/notes.schema.ts`):

| Pestaña del mockup | Cómo se representa |
| --- | --- |
| Chat proveedor | `chatType: 'driver'`, `isObservation: false` |
| Chat cuenta / EOS | `chatType: 'corporate_client'`, `isObservation: false` |
| Observaciones internas | `isObservation: true` |

Endpoints (router legacy montado en `/`, sin prefijo `/api`):

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/dispatch/gNotes/:serviceId` | Leer las notas del servicio. |
| `POST` | `/services/addNote` | Crear nota. |
| `PATCH` | `/services/:serviceId/notes` | Marcar como leídas. |

Flags relevantes: `readFromHelios` (sin leer desde Helios → dispara `monitor.status = newMessage`), `readFromEos` (equivalente para EOS → `monitor.eosStatus`), `d2iNote` (nota del driver hacia la aseguradora), `hideNote`.

Cliente: [`src/modules/helios/notes.api.ts`](./control-tower-prototype/src/modules/helios/notes.api.ts).

### 3.5 Check-in reminders

El router vive en `src/routes/check-in-reminder/` pero se monta dentro del router v1 de servicios, así que el prefijo real es `/api/v1/services`:

| Método | Ruta | Body |
| --- | --- | --- |
| `POST` | `/api/v1/services/checkInReminder` | `{ userId, checkInDate, reason, serviceId }` |
| `GET` | `/api/v1/services/checkInReminder/:serviceId` | — |
| `GET` | `/api/v1/services/checkInReminder/last/:serviceId` | — |
| `POST` | `/api/v1/services/checkInReminder/resolve` | `{ serviceId, reason }` |

Crear un reminder escribe `service.monitor.checkInReminderDate`. Eso es lo que hace que el monitor marque el servicio como `checkIn`, y es la base de la etapa 4.

Cliente: [`src/modules/helios/check-in-reminder.api.ts`](./control-tower-prototype/src/modules/helios/check-in-reminder.api.ts).

---

## 4. La traducción clave: del estado de Helios a las 4 etapas

**No existe un campo "etapa" en Helios.** Esta es la decisión de diseño más importante del prototipo, y está implementada en [`src/modules/control-tower/domain/stages.ts`](./control-tower-prototype/src/modules/control-tower/domain/stages.ts).

Se deriva de tres campos: `service.status`, `service.trip.status` y `service.monitor.checkInReminderDate`.

| Etapa | Condición | Quién la mueve |
| --- | --- | --- |
| **Fuera de alcance** | `trip.status = new` | Dispatch. El despacho y la asignación no son de Control Tower. |
| **1 · Camino al servicio** | `trip.status = accepted` | El proveedor, marcando en ruta desde Helios App. |
| **2 · En ejecución** | `trip.status ∈ {on_route, arrived, towed}` | El proveedor, marcando finalizado. |
| **3 · Cierre y validación** | `trip.status ∈ {finished, cancelled, cancelled_by_driver}` **sin** check-in agendado | El agente, con el cierre administrativo. |
| **4 · Seguimiento post-servicio** | cerrado/cancelado **con** `monitor.checkInReminderDate` seteado | El agente, resolviendo el check-in. |
| **Auditoría** (cola aparte) | `status = 'Audit'` o `trip.status = 'pending_audit'` | Backend, según reglas por track y país. |

El orden importa: **auditoría gana sobre todo lo demás**. Un servicio que cae en auditoría sale de la cola de su grupo y entra a la de auditoría.

### Enums de referencia

```ts
// helios_api/src/utils/enums.ts:157
TRIP_STATUS = new | accepted | on_route | arrived | towed
            | finished | cancelled | cancelled_by_driver | pending_audit

// helios_api/src/utils/enums.ts:62
TRACKS = road | home | concierge | claims        // se guarda en service.serviceType

// helios_api/src/schemas/services.schema.ts:127
SERVICE_STATUS = Active | Hold | HoldInspection | Finished | Cancelled
               | Not Covered | Informative | Queued | New | Audit | Void | Hold Deleted

// Branches: nombres largos
'Puerto Rico' | 'Costa Rica' | 'Panama' | 'Colombia' | 'Mexico'
```

### El "sistema automático" del mockup es el monitor

Lo que el mockup llama "caída automática" ya existe: `helios_api/src/controllers/helpers/services/monitor.helper.ts` calcula `service.monitor.status` con umbrales reales. El prototipo los lee y los muestra en la cola.

| `monitor.status` | Cuándo se marca |
| --- | --- |
| `hasNotAccepted` | 3+ min en `new` |
| `isNotOnRoute` | 6 min si el proveedor tiene ≤1 servicio; 15 min si tiene más |
| `delayed` | el ETA no cambia en 10 min durante `on_route` |
| `hasNotFinished` | Colombia 60 min, no-grúa 45 min, grúa 120 min |
| `newMessage` | hay notas con `readFromHelios: false` |
| `checkIn` | llegó la fecha del reminder |
| `managed` | alguien otorgó minutos de excepción |

Los crons que lo recalculan viven en el **worker** (`src/worker.ts` → `startWorker.ts`), no en la API.

---

## 5. Arquitectura del prototipo

Next.js 14 App Router + TypeScript + Tailwind + React Query. Mismo stack que `nextjs_helios_dispatch` para que el código sea portable a ese repo. Este repo corre en **4200**; el clon `hackathon_connectfour` en **4300**. Helios Angular suele ocupar 4200 también: no los levantes a la vez en el mismo puerto.

Flujo: **UI → hooks → data-source (live|mock) → dominio → cliente Helios → helios_api**.

```
hackathon-connectfour/
├── src/lib/
│   ├── config.ts                      modo live/mock, URLs, branches, tracks
│   └── auth.ts                        fetchWithAuth: ID token Cognito crudo + User-Id
│
├── src/modules/helios/                ← CONTRATO CON helios_api (sin lógica de producto)
│   ├── types.ts                       enums y documentos, calcados de helios_api
│   ├── projections.ts                 CONTROL_TOWER_PROJECTION (si no, la API devuelve solo _id)
│   ├── services.api.ts                GET /api/v2/services  (Active + Audit + Low Score)
│   ├── incoming-calls.api.ts          get-data, additional-data, search
│   ├── notes.api.ts                   POST /utils/addNote · 3 chats sobre colección notes
│   ├── check-in-reminder.api.ts       POST /api/v1/services/checkInReminder (+ resolve)
│   ├── trip.api.ts                    avanzar trip.status / finish
│   ├── monitor.api.ts                 PATCH excepción de tiempo → managed
│   └── logs.api.ts                    GET service logs
│
├── src/modules/control-tower/
│   ├── domain/
│   │   ├── stages.ts                  trip.status → 4 etapas (+ auditoría gana)
│   │   ├── groups.ts                  Torre / Backoffice / Auditoría + capacidad
│   │   ├── case.ts                    HeliosService → ControlTowerCase
│   │   ├── queue.ts                   filtro por grupo, orden, “sin tomar”
│   │   ├── actions.ts                 botones por etapa + endpoint real
│   │   ├── audit.ts                   motivos Pending Audit por track
│   │   └── intelligence.ts            score local, avisos, redistribución (sin LLM)
│   ├── data-source.ts                 frontera única mock / live (3 queries en live)
│   ├── ownership.ts                   tomar / soltar caso (localStorage)
│   ├── capacity-store.ts              overrides de capacidad + log de horas (local)
│   ├── hooks.ts                       React Query: cola, notas, mutaciones
│   ├── mock/fixtures.ts               mismos shapes que GET /api/v2/services
│   └── components/
│       ├── CaseDetailModal.tsx        detalle, chats, check-in, alerta proveedor
│       ├── IncomingCallModal.tsx      llamada Audara → Dispatch / vincular PO
│       ├── CapacityDashboard.tsx      utilización por grupo + aplicar moves
│       └── ServiceMap.tsx             mapa del servicio
│
├── src/components/
│   ├── HeliosNavbar.tsx               Control Tower, docs, pausa, live/mock
│   ├── PauseModal.tsx                 pausa de agente
│   └── ui.tsx                         primitivas del Design System
│
└── src/app/
    ├── control-tower/page.tsx         el tablero (cola, KPIs, notificaciones)
    ├── docs/page.tsx                  documentación embebida
    └── api/selftest/route.ts          self-check de la integración
```

Las tres queries live de `data-source.ts` (no mezclar Active con Audit: el `limit` se come los Pending Audit):

| Query | Filtro | Cola |
| --- | --- | --- |
| Active | `statuses=Active` + trip post-despacho (sin `pending_audit`) | Torre de Control |
| Pending Audit | `tripStatuses=pending_audit` | Auditoría |
| Low Score | Finished / Not Covered / Informative + `surveyHasLowScore` | Backoffice |

### Dos modos de datos

Controlado por `NEXT_PUBLIC_DATA_MODE`, con una sola frontera en `data-source.ts`:

- **`mock`** (default): fixtures locales. No requiere credenciales. Sirve para demo.
- **`live`**: pega contra `helios_api` con el token del navegador.

Las fixtures tienen **exactamente la forma** que devuelve `helios_api` con la `CONTROL_TOWER_PROJECTION`. Por eso el mapeo `toControlTowerCase` que corre en mock es el mismo que corre en live: cambiar de modo no cambia una línea de UI. Incluyen a propósito casos borde reales: un servicio en `trip.status = new` (que debe quedar fuera del alcance), dos en auditoría con `auditReason`, uno con `holdInspectionServices` sin hidratar, y varios con `monitor.status` distinto de `onTime`.

### Decisión: no se usó el design system privado

El design system real es `@connect-assistance/connect-ui` (GitHub Packages, requiere `GIT_NPM_TOKEN`). Para que el prototipo se pueda clonar y correr sin ese token, replica los tokens del zip (`_ds/.../tokens/colors.css`) en `tailwind.config.ts` y `globals.css`, y trae solo las primitivas que el mockup usa. Migrar a `connect-ui` es reemplazar `src/components/ui.tsx`.

---

## 6. Cómo correrlo

```bash
cd hackathon/control-tower-prototype
npm install
cp .env.example .env.local
npm run dev            # http://localhost:4300
```

Arranca en modo `mock`, sin credenciales.

### Modo live

En `.env.local`:

```
NEXT_PUBLIC_DATA_MODE=live
NEXT_PUBLIC_HELIOS_API_URL=https://helios-api-stg.apps-connectassistance.com
```

Y abrir con el token:

```
http://localhost:4300/control-tower?token=<idToken de Cognito>&userId=<mongoId>
```

Si falta el token o `helios_api` lo rechaza, la pantalla muestra el error con la instrucción concreta en lugar de quedarse en blanco.

> CORS: `helios_api` responde `access-control-allow-origin: *` y acepta los headers `Authorization` y `User-Id` (`src/app.ts`), así que `localhost:4300` funciona sin configuración extra.

### Self-check de la integración

El prototipo expone un endpoint que corre el pipeline completo del lado del servidor (cargar servicios → derivar etapas → armar la cola de cada grupo) y devuelve los conteos. Sirve para verificar la capa de integración sin abrir el navegador:

```bash
curl http://localhost:4300/api/selftest
```

Salida real en modo mock:

```json
{
  "ok": true,
  "dataMode": "mock",
  "servicesReturned": 12,
  "casesInScope": 11,
  "outOfScope": [
    { "serviceNumber": 48999, "tripStatus": "new",
      "reason": "trip.status = new: el despacho y la asignación siguen en Dispatch." }
  ],
  "byStage": { "etapa 1": 2, "etapa 2": 3, "etapa 3": 2, "etapa 4": 2, "auditoría": 2 },
  "queuesByGroup": [
    { "group": "torre-control", "label": "Torre de Control", "queue": 5, "capacity": 6 },
    { "group": "backoffice",    "label": "Backoffice",       "queue": 4, "capacity": 6 },
    { "group": "auditoria",     "label": "Auditoría",        "queue": 2, "capacity": 6 }
  ]
}
```

Eso confirma la derivación de etapas: Torre de Control (etapas 1-2) ve 5 casos, Backoffice (etapas 3-4) ve 4, Auditoría ve 2, y el servicio en `trip.status = new` queda correctamente fuera del alcance.

En modo `live` este endpoint no puede autenticarse, porque el token vive en el navegador y no en el servidor. Es esperado.

### Variables de entorno

| Variable | Default | Para qué |
| --- | --- | --- |
| `NEXT_PUBLIC_DATA_MODE` | `mock` | `mock` o `live`. |
| `NEXT_PUBLIC_HELIOS_API_URL` | staging | Base de `helios_api`. |
| `NEXT_PUBLIC_CORE_API_URL` | staging | Base de `serverless-helios-api`. Opcional. |
| `NEXT_PUBLIC_HELIOS_WEB_URLS` | `http://localhost:4200` | Orígenes permitidos si se embebe como iframe. |
| `NEXT_PUBLIC_DEFAULT_BRANCH` | `Colombia` | País inicial. |
| `NEXT_PUBLIC_DEFAULT_DIVISION` | `all` | Track inicial. |

---

## 7. Qué está conectado y qué no

El prototipo es honesto sobre esto: cada acción del detalle del caso muestra su endpoint y si está conectada. La pantalla `/docs` tiene la tabla completa.

### Conectado a la API real (funciona en modo live)

- Cargar la cola: `GET /api/v2/services`
- Contexto de llamada entrante: `GET /api/v1/incoming-calls/get-data`
- Vincular llamada a servicio: `POST /api/v1/incoming-calls/additional-data`
- Leer los 3 chats: `GET /dispatch/gNotes/:serviceId`
- Escribir en cualquiera de los 3 chats: `POST /services/addNote`
- Crear check-in reminder: `POST /api/v1/services/checkInReminder`
- Resolver check-in reminder: `POST /api/v1/services/checkInReminder/resolve`

### Solo registrado localmente (falta backend o vive en otra pantalla)

| Acción | Situación |
| --- | --- |
| Tomar / soltar caso | **No existe.** Ver gaps. |
| Avanzar etapa | No se debe escribir desde acá: el avance real lo produce el proveedor (stamps del trip) o el cierre administrativo. El prototipo lo explicita en vez de fingirlo. |
| Informar al cliente (ETA) | `POST /api/v2/services/confirm-message` existe; requiere un payload que el prototipo no arma todavía. |
| +10 min de excepción | La lógica existe (`monitor.helper.delay()`), pero hay que confirmar el endpoint HTTP en `monitor.controller.ts`. |
| Alertar al proveedor | No hay endpoint. Hoy se resuelve por fuera de Helios. |
| Reasignar proveedor | Vive en la pantalla de Dispatch. |
| Validar cierre administrativo | `PATCH /services/finished` existe; es una escritura sensible, no la conecté en un prototipo. |
| Resolver auditoría | No hay endpoint dedicado; hoy se hace desde el dashboard de Audit. |
| Marcar como reincidencia | No hay modelo de reincidencia. |

---

## 8. Gaps: lo que hay que construir en backend

Esto es lo más importante para la conversación con ingeniería.

### 8.1 Propiedad del caso — el gap grande

**No existe en Helios ningún concepto de equipo, capacidad, ni propiedad de un servicio por parte de un agente.** Ni en `helios_api` ni en `helios_frontend`. Solo hay roles (`custom:role` de Cognito) y permisos CASL (`rolesV2`).

Lo más cercano que existe hoy:

- `POST /dashboard/updateEditOrDuplicateStatus` — soft-lock del Service Q para que dos agentes no editen el mismo servicio.
- `GET /dashboard/liveViewData` y `POST|DELETE /dashboard/liveViewData/:agentId/:serviceNumber` — presencia: quién está mirando qué.

Todo el "tomar caso / soltar caso / capacidad" del mockup es **nuevo**. En el prototipo vive en `localStorage` ([`ownership.ts`](./control-tower-prototype/src/modules/control-tower/ownership.ts)) para que la demo funcione, pero necesita backend real:

- Una colección de asignaciones (`serviceId`, `groupId`, `agentId`, `claimedAt`).
- Endpoints de claim / release con control de concurrencia (dos agentes no pueden tomar el mismo caso).
- Liberación automática por timeout, para que un caso no quede bloqueado si el agente cierra el navegador.
- Realtime, para que la cola de todos se actualice al instante. Ya hay socket.io en `helios_api` con el namespace `/dashboard` y el evento `service_component_updated`; se podría extender.

### 8.2 Definición de los grupos

Los grupos del prototipo están hardcodeados con los del mockup. Falta decidir dónde se configuran: cuentas, países, tracks, etapas y capacidad por grupo. Podría ser una extensión del modelo de roles v2 o una colección aparte.

### 8.3 La etapa como concepto de primera clase

Hoy la etapa se deriva en el cliente. Eso funciona, pero significa que la regla vive duplicada en cada consumidor. Vale evaluar exponerla desde la API (un campo calculado o un endpoint dedicado), sobre todo si el Control Tower va a coexistir con el Service Q.

### 8.4 Filtrar la cola por etapa en el servidor

Ahora el prototipo pide `statuses=Active,Audit` + `tripStatuses=<todos menos new>` y arma las etapas en memoria. Con volumen real eso no escala. Como `GET /api/v2/services` ya acepta `tripStatuses` y `checkInStartDate`/`checkInEndDate`, se puede filtrar por etapa del lado del servidor casi sin cambios:

| Etapa | Filtro servidor |
| --- | --- |
| 1 | `tripStatuses=accepted` |
| 2 | `tripStatuses=on_route,arrived,towed` |
| 3 | `tripStatuses=finished,cancelled,cancelled_by_driver` + `statuses=Active` |
| 4 | igual que 3 + `exists=monitor.checkInReminderDate` |
| Auditoría | `statuses=Audit` |

### 8.5 Realtime en vez de polling

El prototipo hace polling cada 20s (el Service Q real usa 45s). Para una torre de control eso es lento. `helios_api` ya tiene socket.io con tres namespaces (`/dashboard`, `/incoming_call`, `/map`); conviene usarlos. Aviso: el handshake de esos sockets **no está autenticado** — la identidad se afirma con un `emit('add_user', id)`. Si el Control Tower va a depender de ellos, eso hay que endurecerlo.

### 8.6 Atlas Search como dependencia

`GET /api/v2/services` usa `$search`, así que no funciona contra un mongod local. Para desarrollo local hay que usar `POST /api/v1/services/find`. Conviene tenerlo presente antes de montar el onboarding del equipo.

---

## 9. Notas de seguridad

Cosas que encontré y vale marcar, independientes del prototipo:

- **`helios_frontend` tiene claves reales commiteadas** en `src/environments/base.quality.ts` y `base.prod.ts` (tokens de servicios, keys de Stripe, ids de Cognito). El prototipo **no** copia ninguna: su `.env.example` solo trae URLs públicas y hay que poner los valores a mano.
- El token de Helios se guarda en `localStorage`, igual que hace `nextjs_helios_dispatch`. Es consistente con lo que ya existe, pero es un vector de XSS: cualquier script en la página puede leerlo. Si el Control Tower va a producción, vale evaluar cookies `httpOnly`.
- El `.gitignore` del prototipo excluye `.env.local`. El token nunca debe quedar en un archivo comiteado.
- El prototipo no manda datos a ningún tercero: solo habla con la URL de `helios_api` que se configure.

---

## 10. Resumen de decisiones

| Decisión | Por qué |
| --- | --- |
| Next.js 14 App Router, no Angular | Mismo stack que `nextjs_helios_dispatch`, así el código es portable a ese repo y puede embeberse como iframe en el Angular igual que las demás pantallas nuevas. |
| Puerto 4300 | 4200 es el Angular, 4201 es dispatch. |
| Modo mock por defecto | Un prototipo de hackathon tiene que abrirse y funcionar sin credenciales. |
| Fixtures con la forma exacta de la API | Para que el mapeo sea el mismo en mock y en live, y el prototipo pruebe de verdad la capa de integración. |
| Etapas derivadas en el cliente | Es la única forma con la API actual. Queda aislado en un archivo para poder moverlo al backend después. |
| No escribir transiciones de etapa | El avance real lo produce el proveedor o el cierre administrativo. Fingirlo daría una impresión falsa de lo que ya se puede construir. |
| Propiedad del caso en `localStorage` | No existe backend. Se aísla en un módulo con la propuesta de API documentada. |
| Tokens del DS replicados en Tailwind | `@connect-assistance/connect-ui` es privado y requiere `GIT_NPM_TOKEN`. |
| Cada acción declara su endpoint y si está conectada | Convierte el prototipo en el insumo de la conversación con ingeniería, no solo en una demo. |

---

## 11. Referencias de código

### helios_api

| Qué | Dónde |
| --- | --- |
| Middleware de auth | `src/controllers/auth.controller.ts:268-330` |
| Bootstrap, CORS, prefijo `/api` | `src/app.ts:76-213` |
| Documento de servicio, `SERVICE_STATUS`, `AuditReasons` | `src/schemas/services.schema.ts` |
| `TRIP_STATUS`, `TRACKS` | `src/utils/enums.ts:62`, `:157` |
| List API de servicios | `src/routes/api/services/v2/{services.router,validators,service.controller}.ts` |
| Incoming calls | `src/routes/api/incoming-calls/v1/` |
| Notas y chats | `src/schemas/notes.schema.ts`, `src/routes/services/services.router.ts` |
| Check-in reminders | `src/routes/check-in-reminder/check-in-reminder.router.ts` |
| Monitor y umbrales | `src/controllers/helpers/services/monitor.helper.ts` |
| Reglas de auditoría | `src/controllers/audit/{road,home,concierge,claims}-audit.helper.ts` |
| Config y env | `src/config.js` (convict + Vault; local usa `env/env.local.json`) |

### helios_frontend

| Qué | Dónde |
| --- | --- |
| HTTP client (`Authorization` crudo + `User-Id`) | `src/modules/core/services/api/base.service.ts` |
| Auth con Cognito / Amplify | `src/amplify/auth.ts`, `src/modules/core/services/auth/index.ts` |
| Navbar (barra negra, pill de país) | `src/app/modules/theme/modules/nav-menu/` |
| Service Q, la cola más parecida | `src/modules/dashboard/dashboard-schema/service-q-schema.service.ts` |
| Estado global de branch / division | `src/modules/core/services/state/global-state/index.ts` |
| Toast de llamada entrante | `src/modules/shared/incoming-call-toast/` |

### nextjs_helios_dispatch

| Qué | Dónde |
| --- | --- |
| Patrón de `fetchWithAuth` | `src/utils/auth.ts` |
| Cliente de incoming-calls | `src/modules/incoming-calls/api.ts` |
| Handshake postMessage con el Angular | `src/hooks/useIframeCommunication.ts` |
| Convención de módulos | `src/modules/<feature>/{api,hooks,types,helpers}.ts` |
