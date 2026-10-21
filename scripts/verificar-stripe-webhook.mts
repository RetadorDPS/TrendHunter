/**
 * Verificación del webhook de Stripe: firma, eventos y, sobre todo,
 * IDEMPOTENCIA (repetir el mismo evento no duplica nada).
 *
 *   npm run verify:stripe-webhook
 *
 * No necesita una cuenta de Stripe real ni red: construye los eventos a mano
 * y los firma con el mismo esquema que usa Stripe (`t=…,v1=…`), exactamente
 * como lo verifica `constructWebhookEvent` en `src/lib/stripe.ts`. Así se
 * prueba el código de verdad (no un simulacro) sin depender de una clave que
 * hoy no existe en este entorno.
 *
 * Deja un usuario de prueba (webhook-prueba@trendhunter.pro) que se borra al
 * terminar, igual que el resto de `scripts/verificar-*`.
 */
import { createHmac, randomUUID } from "node:crypto";

// Claves de prueba ANTES de importar nada que las lea: así el endpoint se
// comporta como si Stripe estuviera configurado, sin tocar .env.local (eso
// rompería los scripts que dependen del modo demostración).
process.env.STRIPE_SECRET_KEY = "sk_test_verificacion_interna";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_verificacion_interna";

import prisma from "../src/lib/prisma.ts";
import { POST } from "../src/app/api/stripe/webhook/route.ts";

const resultados: Array<{ nombre: string; ok: boolean }> = [];
function registrar(nombre: string, ok: boolean, detalle = "") {
  resultados.push({ nombre, ok });
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

/** Firma un cuerpo con el mismo esquema que Stripe envía en `Stripe-Signature`. */
function firmar(cuerpo: string, secreto: string): string {
  const t = Math.floor(Date.now() / 1000);
  const firma = createHmac("sha256", secreto).update(`${t}.${cuerpo}`).digest("hex");
  return `t=${t},v1=${firma}`;
}

async function enviar(evento: Record<string, unknown>, firma: string | null) {
  const cuerpo = JSON.stringify(evento);
  const cabeceras = new Headers({ "content-type": "application/json" });
  if (firma) cabeceras.set("stripe-signature", firma);
  const respuesta = await POST(new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: cabeceras,
    body: cuerpo,
  }));
  const datos = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>;
  return { estado: respuesta.status, datos };
}

let usuarioId: string | null = null;
const idsDeEventosCreados: string[] = [];

try {
  const usuario = await prisma.user.create({
    data: {
      email: `webhook-prueba-${Date.now()}@trendhunter.pro`,
      name: "Prueba Webhook",
      planType: "FREE",
    },
  });
  usuarioId = usuario.id;

  // --------------------------------------------------- 1 · firma inválida
  const malaFirma = await enviar(
    { id: "evt_mala_firma", type: "checkout.session.completed", data: { object: {} } },
    "t=1,v1=firmaquenoescuadra",
  );
  registrar("Firma no válida → 400", malaFirma.estado === 400, `${malaFirma.estado}`);

  const sinFirma = await enviar({ id: "evt_sin_firma", type: "checkout.session.completed", data: { object: {} } }, null);
  registrar("Sin cabecera de firma → 400", sinFirma.estado === 400, `${sinFirma.estado}`);

  // --------------------------------------------------- 2 · checkout.session.completed
  const eventId = `evt_checkout_${randomUUID()}`;
  const cuerpoCheckout = {
    id: eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        customer: "cus_test_verificacion",
        subscription: "sub_test_verificacion",
        metadata: { userId: usuarioId, plan: "PRO" },
      },
    },
  };
  idsDeEventosCreados.push(eventId);
  const cuerpoCheckoutTexto = JSON.stringify(cuerpoCheckout);
  const primeraRespuesta = await enviar(cuerpoCheckout, firmar(cuerpoCheckoutTexto, process.env.STRIPE_WEBHOOK_SECRET!));
  registrar(
    "checkout.session.completed activa el plan",
    primeraRespuesta.estado === 200 && primeraRespuesta.datos.ok === true,
    `${primeraRespuesta.estado}`,
  );

  const usuarioTrasPago = await prisma.user.findUniqueOrThrow({ where: { id: usuarioId } });
  registrar(
    "El plan del usuario cambia a PRO",
    usuarioTrasPago.planType === "PRO" && usuarioTrasPago.stripeCustomerId === "cus_test_verificacion",
    `plan=${usuarioTrasPago.planType}`,
  );

  const avisosTrasPrimerEnvio = await prisma.alertNotification.count({ where: { userId: usuarioId } });

  // --------------------------------------------------- 3 · idempotencia real
  const segundaRespuesta = await enviar(cuerpoCheckout, firmar(cuerpoCheckoutTexto, process.env.STRIPE_WEBHOOK_SECRET!));
  registrar(
    "Repetir el MISMO evento no lo vuelve a procesar",
    segundaRespuesta.estado === 200 && segundaRespuesta.datos.duplicado === true,
    `${segundaRespuesta.estado} · duplicado=${segundaRespuesta.datos.duplicado}`,
  );

  const avisosTrasRepetir = await prisma.alertNotification.count({ where: { userId: usuarioId } });
  registrar(
    "No se duplica el aviso de «plan activado»",
    avisosTrasRepetir === avisosTrasPrimerEnvio,
    `${avisosTrasPrimerEnvio} → ${avisosTrasRepetir}`,
  );

  const filasEvento = await prisma.stripeEvent.count({ where: { eventId } });
  registrar("Solo queda una fila de StripeEvent para ese id", filasEvento === 1, `${filasEvento}`);

  // --------------------------------------------------- 4 · cancelación real
  const cuerpoCancelacion = {
    id: `evt_cancel_${randomUUID()}`,
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_test_verificacion",
        customer: "cus_test_verificacion",
        status: "canceled",
      },
    },
  };
  idsDeEventosCreados.push(cuerpoCancelacion.id);
  const respuestaCancelacion = await enviar(
    cuerpoCancelacion,
    firmar(JSON.stringify(cuerpoCancelacion), process.env.STRIPE_WEBHOOK_SECRET!),
  );
  registrar(
    "customer.subscription.deleted vuelve a FREE",
    respuestaCancelacion.estado === 200,
    `${respuestaCancelacion.estado}`,
  );
  const usuarioTrasCancelar = await prisma.user.findUniqueOrThrow({ where: { id: usuarioId } });
  registrar("El plan vuelve a FREE", usuarioTrasCancelar.planType === "FREE", `plan=${usuarioTrasCancelar.planType}`);
} catch (error) {
  registrar("La verificación terminó sin excepciones", false, (error as Error).message);
} finally {
  if (usuarioId) {
    await prisma.alertNotification.deleteMany({ where: { userId: usuarioId } });
    await prisma.subscription.deleteMany({ where: { userId: usuarioId } });
    await prisma.stripeEvent
      .deleteMany({ where: { eventId: { in: idsDeEventosCreados } } })
      .catch(() => {});
    await prisma.user.delete({ where: { id: usuarioId } }).catch(() => {});
  }
  await prisma.$disconnect();
}

const fallos = resultados.filter((fila) => !fila.ok).length;
console.log(`\n=== RESUMEN: ${resultados.length - fallos}/${resultados.length} comprobaciones correctas ===`);
if (fallos > 0) process.exit(1);
