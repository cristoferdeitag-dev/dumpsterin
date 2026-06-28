# 📒 Bitácora — Dumpsterin

> Memoria viva de este proyecto. Web HTM la **LEE** antes de trabajar aquí y la **ACTUALIZA** al terminar.
> Lo más reciente arriba. No borres historial — agrega entradas. Espejo en Obsidian: `memory/bitacoras/dumpsterin.md`.

**Stack:** Expo / React Native (web + mobile) · Supabase
**Deploy:** Hostinger, sin auto-deploy. `npx expo export --platform web --output-dir dist` + rsync manual. Detalle: memoria `ref_dumpsterin_deploy`.
**Estado actual:** App "Uber-like" para dumpsters. Motor de cotización provider-aware (provider_pricing, /api/quotes/create). Plan SaaS por fases (provider cotiza a sus clientes con sus precios).

---

## 2026-06-28 — asai — Fase 1 consolidación (paso 1: ENTREGA migrada a endpoints granulares)
- **Contexto:** Plan de consolidar el dashboard de provider en Dumpsterin (en vez del portal web de Booking). Doc: `/root/docs/consolidacion-provider-dumpsterin/` (PLAN.md + FASE-0-paridad.md).
- **Qué se hizo:** Migrado el flujo de ENTREGA del marketplace del endpoint legacy `/api/provider/action` a los granulares de BD. Arregla un bug real: el legacy NO notificaba al cliente. Build web exit 0.
- **Cambios:** `src/lib/marketplaceApi.js` (+ `uploadBookingPhoto`, `deliveryOnTheWay`, `completeDelivery`). `app/marketplace.js`: botón "On the way" → `deliveryOnTheWay(booking_number)`; "Delivered" → ahora pide 2 fotos (`pickFiles`), las sube a `/api/booking/{bn}/upload-photo` (category delivery) y llama `completeDelivery` con las URLs. Cadena de estados intacta (paid→dispatched→delivered), el resto (pickup/ticket) sigue legacy hasta su paso.
- **Pendiente Fase 1:** paso 2 pickup (on_the_way+complete, 2 fotos), paso 3 disposal report (3 fotos+pesos+extras), paso 4 schedule_early (feature nueva), luego deprecar `/api/provider/action`.
- **Deploy:** push a `main` → GH Action (expo export + rsync Hostinger). NO incluí el cambio ajeno sin commitear `supabase/functions/stripe-webhook/index.ts`.

## (sin entradas aún) — Bitácora inicializada 2026-06-26 (cris)
- Próxima sesión que toque Dumpsterin: registrar aquí qué se hizo. Contexto histórico en memoria `project_apps`, `project_tp_quote_saas_plan`, `ref_dumpsterin_deploy`.
