/**
 * Verifica que el historial de entregas de un webhook (WebhookEntrega) se
 * guarda de verdad y no crece sin límite.
 *
 *   npm run verify:webhooks-historial
 *
 * Llama a `enviarUno` (la misma función que usa el cron de alertas y el
 * botón «Probar») directamente, muchas más veces de las 10/hora que deja la
 * ruta HTTP: así se prueba la retención de 50 sin esperar una hora ni tocar
 * el límite de otra verificación.
 */
import prisma from "../src/lib/prisma.ts";
import { enviarUno } from "../src/lib/webhooks.ts";

const resultados: Array<{ nombre: string; ok: boolean }> = [];
function registrar(nombre: string, ok: boolean, detalle = "") {
  resultados.push({ nombre, ok });
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const TOTAL_ENVIOS = 55;
const RETENCION = 50;

let usuarioId: string | null = null;
let webhookId: string | null = null;

try {
  const usuario = await prisma.user.create({
    data: { email: `webhook-historial-${Date.now()}@trendhunter.pro`, name: "Prueba Historial", planType: "BUSINESS" },
  });
  usuarioId = usuario.id;

  const webhook = await prisma.webhook.create({
    data: {
      userId: usuario.id,
      nombre: "Historial de prueba",
      url: "https://dominio-que-no-existe.invalid/hook",
      provider: "GENERIC",
      eventos: JSON.stringify(["prueba"]),
    },
  });
  webhookId = webhook.id;

  for (let i = 0; i < TOTAL_ENVIOS; i++) {
    await enviarUno(webhook, {
      titulo: `Entrega de prueba ${i + 1}`,
      mensaje: "Verificación de retención del historial.",
      tipo: "prueba",
    });
  }

  const total = await prisma.webhookEntrega.count({ where: { webhookId } });
  registrar(
    `${TOTAL_ENVIOS} envíos se recortan a ${RETENCION} entregas guardadas`,
    total === RETENCION,
    `${total} filas`,
  );

  const masAntigua = await prisma.webhookEntrega.findFirst({
    where: { webhookId },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  const masReciente = await prisma.webhookEntrega.findFirst({
    where: { webhookId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  registrar(
    "Se queda con las últimas, no con las primeras",
    Boolean(masAntigua && masReciente && masAntigua.createdAt <= masReciente.createdAt),
  );

  const webhookActualizado = await prisma.webhook.findUniqueOrThrow({ where: { id: webhookId } });
  registrar(
    "Los contadores del webhook siguen sumando todos los envíos (no se recortan)",
    webhookActualizado.fallos + webhookActualizado.envios === TOTAL_ENVIOS,
    `envios=${webhookActualizado.envios} fallos=${webhookActualizado.fallos}`,
  );
} catch (error) {
  registrar("La verificación terminó sin excepciones", false, (error as Error).message);
} finally {
  if (webhookId) await prisma.webhook.delete({ where: { id: webhookId } }).catch(() => {});
  if (usuarioId) await prisma.user.delete({ where: { id: usuarioId } }).catch(() => {});
  await prisma.$disconnect();
}

const fallos = resultados.filter((fila) => !fila.ok).length;
console.log(`\n=== RESUMEN: ${resultados.length - fallos}/${resultados.length} comprobaciones correctas ===`);
if (fallos > 0) process.exit(1);
