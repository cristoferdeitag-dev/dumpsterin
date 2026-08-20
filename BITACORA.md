# 📒 Bitácora — Dumpsterin

> Memoria viva de este proyecto. Web HTM la **LEE** antes de trabajar aquí y la **ACTUALIZA** al terminar.
> Lo más reciente arriba. No borres historial — agrega entradas. Espejo en Obsidian: `memory/bitacoras/dumpsterin.md`.

**Stack:** Expo / React Native (web + mobile) · Supabase
**Deploy:** Hostinger, sin auto-deploy. `npx expo export --platform web --output-dir dist` + rsync manual. Detalle: memoria `ref_dumpsterin_deploy`.
**Estado actual:** App "Uber-like" para dumpsters. Motor de cotización provider-aware (provider_pricing, /api/quotes/create). Plan SaaS por fases (provider cotiza a sus clientes con sus precios).

---

## 2026-08-20 (15:25Z) — cris (Fable 5) — 🐛 Edge Function `stripe-webhook` v11: pagos con TARJETA caían como "fuera de Stripe" — corregido + 6 filas reetiquetadas

- **Síntoma:** Cris pidió verificar el cobro real de RPT properties ($150, Overload fee) desde /provider/cobros de BD. El cobro estaba perfecto en Stripe (succeeded, fee 1%, recibo enviado), pero en `transactions` quedó como `provider_invoice_oob_payment` / `other`. Igual las otras 5 facturas con tarjeta desde v10 (Susan Snyder $599, Erik Feld $399.99, Jonah Abkowitz $920.39, Marti $150, Auric Aspen $599) — $2,818.38 mal desglosados (totales correctos).
- **Causa:** la inferencia de v10 `!invoice.charge && !invoice.payment_intent` — en API **2025-05-28.basil** (la fijada en la cuenta de TP) esos campos NO vienen en el Invoice del evento (se movieron a `payments`) → TODO pago daba `paidOob=true`. Mismo patrón que [[ref_stripe_webhook_api_version_campos_faltantes]].
- **Fix (dictamen Hermes GO, brief `/root/reports/consejo/2026-08-20-ledger-oob-fix/brief.md`):** `paidOob = paid_out_of_band===true || (status==='paid' && Number(amount_paid||0)===0)` — señal independiente de la versión de API (OOB deja amount_paid en 0). Deploy `supabase functions deploy stripe-webhook` → **v11 ACTIVE**. Commit `da79575` en main (el push dispara el GH Action de dumpsterin.com; sin cambio visible).
- **Ledger:** UPDATE de las 6 filas a `provider_invoice_charge`/`card` (filtro por id+categoría+método). Respaldo previo: scratchpad `ledger_oob_backup_2026-08-20.json`.
- **Reconcile de BD** no necesita cambio: solo usa `paid_out_of_band===true` con el SDK de BD (versión donde sí existe el campo).
- ⚠️ El cambio ajeno sin commitear (`resolveProviderId`) sigue en el working tree, restaurado tal cual tras el deploy (v11 NO lo incluye). Pendiente de su autor.
- **Pendiente verificar:** próximo cobro con tarjeta → fila `provider_invoice_charge`/`card`; próximo efectivo → `oob`/`cash` sin duplicado.

## 2026-08-19 (01:34Z) — cris2/Laso (Fable 5) — 🐛 Edge Function `stripe-webhook`: fin del DOBLE CONTEO en pagos efectivo/Zelle — desplegada v10

- **Síntoma (lo detectó Cris probando cobros de BookingDumpsters):** cada factura marcada como pagada en efectivo/Zelle quedaba DOS veces en `transactions` — la fila correcta `provider_invoice_oob_payment` (la escribe `mark-paid` de BD) y otra `provider_invoice_charge` etiquetada "card" (la escribía ESTA función). Los reportes mostraban el dinero al doble y con método equivocado.
- **Causa raíz (lo interesante):** la función YA tenía `const paidOob = invoice.paid_out_of_band === true` desde el 11-jun… pero **nunca se activaba**. Stripe entrega este webhook con la API version fijada de la cuenta de TP (**2025-05-28.basil**), y en ese payload **el campo `paid_out_of_band` NO EXISTE** (verificado sobre el evento real `evt_1U5qeS…`: `paid_out_of_band presente?: False`). Redesplegar no habría arreglado nada — la hipótesis inicial de "despliegue viejo" era falsa.
- **Fix (2 partes, ambas independientes de la versión de API):**
  1. `ledgerHasInvoice(invoiceId)` — dedup por `stripe_object_id` antes de insertar. Si alguien ya registró esa factura (esta función, el cron de reconcile o `mark-paid`), no se inserta otra. Ante fallo de la consulta se inserta igual (mejor duplicado visible que pago perdido).
  2. `paidOob` ahora también se **infiere**: factura `paid` sin `charge` ni `payment_intent` = liquidada fuera de Stripe. Así clasifica bien aunque la marquen desde el dashboard de Stripe.
- **Verificado en producción:** ciclo completo (crear factura → marcar pagada en efectivo) deja **1 sola fila**, categoría `provider_invoice_oob_payment`, método `cash`. Filas de prueba borradas del ledger.
- **Este webhook vive en la cuenta Stripe de TP** (`https://mbirzaocjkhqydtuqmze.supabase.co/functions/v1/stripe-webhook`, 3 eventos) — NO en la de BD. Por eso escribe las filas con formato `Cliente · NÚMERO` que se ven en el ledger de TP.
- **Despliegue:** `supabase functions deploy stripe-webhook --project-ref mbirzaocjkhqydtuqmze` con `SUPABASE_MGMT_TOKEN` de `/root/.env.supabase-admin`. Quedó **v10** (la anterior era v9 del 15-jun).
- ⚠️ **El cambio ajeno sin commitear (`resolveProviderId`) SIGUE sin commitear**, igual que lo dejó Asaí el 28-jun. Lo respaldé, desplegué SIN él (desde HEAD + mi fix) y lo restauré tal cual en el working tree. **Ojo: lo desplegado v10 NO lo incluye.** Sigue pendiente que su autor lo termine/suba.

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
