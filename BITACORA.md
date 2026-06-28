# 📒 Bitácora — Dumpsterin

> Memoria viva de este proyecto. Web HTM la **LEE** antes de trabajar aquí y la **ACTUALIZA** al terminar.
> Lo más reciente arriba. No borres historial — agrega entradas. Espejo en Obsidian: `memory/bitacoras/dumpsterin.md`.

**Stack:** Expo / React Native (web + mobile) · Supabase
**Deploy:** Hostinger, sin auto-deploy. `npx expo export --platform web --output-dir dist` + rsync manual. Detalle: memoria `ref_dumpsterin_deploy`.
**Estado actual:** App "Uber-like" para dumpsters. Motor de cotización provider-aware (provider_pricing, /api/quotes/create). Plan SaaS por fases (provider cotiza a sus clientes con sus precios).

---

## 2026-06-28 — asai — Fase 1 paso 2+3: RECOLECCIÓN + DISPOSAL migrados a granulares
- **Qué se hizo:** Migrado pickup (on_the_way + complete con 2 fotos) y el reporte de disposal al modelo granular de BD. Proceso confirmado por Cris: el PROVIDER solo sube evidencia (fotos transfer-station + scale ticket + net tons); NO cobra. BookingDumpsters revisa en /admin/disposal-review y ejecuta el cobro de sobrepeso al cliente. Build web exit 0.
- **Cambios:** `marketplaceApi.js`: +`pickupOnTheWay`, `completePickup`, `submitDisposal`; `fetchMarketplaceOrders` ahora usa `.or(status.in(...),disposal_status.eq.in_transit_to_transfer_station)` + trae pickup_status/disposal_status (para que el booking siga visible tras pickup-complete y se pueda subir el disposal). `app/marketplace.js`: "Start pickup"→pickupOnTheWay; "Picked up + photos"→completePickup (2 fotos category pickup); nuevo bloque cuando disposal_status=in_transit → "Disposal report" (2 fotos transfer-station + 1 scale-ticket + net tons→lbs) vía submitDisposal. Quitado el cobro automático legacy (transfer_ticket_uploaded). `providerAction` ya no se usa (import removido).
- **Estado consolidación:** ENTREGA + RECOLECCIÓN + DISPOSAL ya en granulares. Falta: schedule_early pickup (feature nueva #4), deprecar `/api/provider/action` del lado BD, onboarding Stripe en la app (Fase 2). Doc: `/root/docs/consolidacion-provider-dumpsterin/`.

## 2026-06-28 — asai — Fase 1 consolidación (paso 1: ENTREGA migrada a endpoints granulares)
- **Contexto:** Plan de consolidar el dashboard de provider en Dumpsterin (en vez del portal web de Booking). Doc: `/root/docs/consolidacion-provider-dumpsterin/` (PLAN.md + FASE-0-paridad.md).
- **Qué se hizo:** Migrado el flujo de ENTREGA del marketplace del endpoint legacy `/api/provider/action` a los granulares de BD. Arregla un bug real: el legacy NO notificaba al cliente. Build web exit 0.
- **Cambios:** `src/lib/marketplaceApi.js` (+ `uploadBookingPhoto`, `deliveryOnTheWay`, `completeDelivery`). `app/marketplace.js`: botón "On the way" → `deliveryOnTheWay(booking_number)`; "Delivered" → ahora pide 2 fotos (`pickFiles`), las sube a `/api/booking/{bn}/upload-photo` (category delivery) y llama `completeDelivery` con las URLs. Cadena de estados intacta (paid→dispatched→delivered), el resto (pickup/ticket) sigue legacy hasta su paso.
- **Pendiente Fase 1:** paso 2 pickup (on_the_way+complete, 2 fotos), paso 3 disposal report (3 fotos+pesos+extras), paso 4 schedule_early (feature nueva), luego deprecar `/api/provider/action`.
- **Deploy:** push a `main` → GH Action (expo export + rsync Hostinger). NO incluí el cambio ajeno sin commitear `supabase/functions/stripe-webhook/index.ts`.

## (sin entradas aún) — Bitácora inicializada 2026-06-26 (cris)
- Próxima sesión que toque Dumpsterin: registrar aquí qué se hizo. Contexto histórico en memoria `project_apps`, `project_tp_quote_saas_plan`, `ref_dumpsterin_deploy`.
