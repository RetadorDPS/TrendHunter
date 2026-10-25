/**
 * Verificación de la búsqueda de anuncios reales en Meta Ad Library.
 *
 *   npm run verify:ads-meta
 *
 * Qué hace:
 *   1. Comprueba que sin FACEBOOK_ACCESS_TOKEN la búsqueda falla con honestidad
 *      (motivo "sin-clave"), sin tocar la red.
 *   2. Levanta un servidor HTTP local que imita la forma exacta de la
 *      respuesta de `graph.facebook.com/ads_archive` (éxito, token caducado,
 *      límite de peticiones y resultado vacío). En el sandbox no hay salida a
 *      internet; en producción esto se sustituye por Meta de verdad con la
 *      misma ruta de código.
 *   3. Comprueba que un anuncio real se guarda sin likes/comments/shares/vistas
 *      inventados (quedan en 0, nunca un número fabricado).
 *   4. Comprueba que releer el mismo anuncio actualiza la fila existente en
 *      vez de duplicarla (idempotencia, igual que la ingesta de tiendas).
 *
 * Limpia los datos de prueba que crea al terminar.
 */
import { createServer, type Server } from "node:http";
import prisma from "@/lib/prisma";
import { buscarAnunciosMeta } from "@/lib/providers/metaAdLibrary";
import { ingerirAnunciosMeta } from "@/lib/adsIngesta";

const PUERTO = 4401;
const TERMINO_PRUEBA = "masajeador-verificacion-ads-meta";

let pasos = 0;
let fallos = 0;

function comprobar(titulo: string, condicion: boolean, detalle = ""): void {
  pasos += 1;
  if (condicion) {
    console.log(`  ✅ ${titulo}${detalle ? ` · ${detalle}` : ""}`);
  } else {
    fallos += 1;
    console.log(`  ❌ ${titulo}${detalle ? ` · ${detalle}` : ""}`);
  }
}

type Modo = "exito" | "token-invalido" | "limite" | "vacio";

/** Servidor que imita graph.facebook.com/ads_archive. */
function levantarServidor(modo: Modo): Promise<Server> {
  return new Promise((resolver) => {
    const servidor = createServer((_peticion, respuesta) => {
      if (modo === "token-invalido") {
        respuesta.writeHead(400, { "content-type": "application/json" });
        respuesta.end(JSON.stringify({ error: { message: "Error validating access token", code: 190 } }));
        return;
      }
      if (modo === "limite") {
        respuesta.writeHead(429, { "content-type": "application/json" });
        respuesta.end(JSON.stringify({ error: { message: "Application request limit reached", code: 4 } }));
        return;
      }
      if (modo === "vacio") {
        respuesta.writeHead(200, { "content-type": "application/json" });
        respuesta.end(JSON.stringify({ data: [] }));
        return;
      }
      respuesta.writeHead(200, { "content-type": "application/json" });
      respuesta.end(
        JSON.stringify({
          data: [
            {
              id: "anuncio-prueba-001",
              page_name: "Tienda de Prueba Verificación",
              ad_creative_bodies: ["El masajeador que no puede faltar en tu rutina."],
              ad_creative_link_titles: ["Masajeador portátil -40%"],
              ad_creation_time: "2026-10-01T00:00:00+0000",
              ad_delivery_start_time: "2026-10-01T00:00:00+0000",
              ad_snapshot_url: "https://www.facebook.com/ads/library/?id=anuncio-prueba-001",
              publisher_platforms: ["facebook", "instagram"],
            },
            // Sin page_name: debe descartarse, nunca inventar un anunciante.
            { id: "anuncio-sin-anunciante", ad_creative_bodies: ["..."] },
          ],
        }),
      );
    });
    servidor.listen(PUERTO, () => resolver(servidor));
  });
}

function cerrar(servidor: Server): Promise<void> {
  return new Promise((resolver) => servidor.close(() => resolver()));
}

async function limpiar(): Promise<void> {
  await prisma.ad.deleteMany({ where: { nicheTag: TERMINO_PRUEBA.toLowerCase() } });
}

try {
  console.log("=== 1 · Sin clave configurada ===");
  delete process.env.FACEBOOK_ACCESS_TOKEN;
  const sinClave = await buscarAnunciosMeta(TERMINO_PRUEBA);
  comprobar("Sin FACEBOOK_ACCESS_TOKEN falla con motivo 'sin-clave'", !sinClave.ok && sinClave.motivo === "sin-clave");
  comprobar("No inventa anuncios sin clave", sinClave.anuncios.length === 0);

  process.env.FACEBOOK_ACCESS_TOKEN = "token-de-prueba";
  process.env.META_AD_LIBRARY_URL = `http://localhost:${PUERTO}/ads_archive`;

  console.log("\n=== 2 · Token caducado (error 190 real de Meta) ===");
  let servidor = await levantarServidor("token-invalido");
  const tokenMalo = await buscarAnunciosMeta(TERMINO_PRUEBA);
  comprobar("Token caducado se reconoce como 'token-invalido'", !tokenMalo.ok && tokenMalo.motivo === "token-invalido");
  await cerrar(servidor);

  console.log("\n=== 3 · Límite de peticiones de Meta ===");
  servidor = await levantarServidor("limite");
  const limitado = await buscarAnunciosMeta(TERMINO_PRUEBA);
  comprobar("El límite de Meta se reconoce como 'limite', no como error genérico", !limitado.ok && limitado.motivo === "limite");
  await cerrar(servidor);

  console.log("\n=== 4 · Sin resultados (término sin anuncios activos) ===");
  servidor = await levantarServidor("vacio");
  const vacio = await buscarAnunciosMeta(TERMINO_PRUEBA);
  comprobar("Cero resultados es un éxito honesto (ok=true, 0 anuncios), no un fallo", vacio.ok && vacio.total === 0);
  await cerrar(servidor);

  console.log("\n=== 5 · Búsqueda real con anuncios ===");
  servidor = await levantarServidor("exito");
  const real = await buscarAnunciosMeta(TERMINO_PRUEBA, { pais: "ES" });
  comprobar("Responde ok con los anuncios del servidor", real.ok && real.total === 1, `${real.total} anuncio(s)`);
  comprobar("Descarta el anuncio sin nombre de anunciante (nunca inventa uno)", real.anuncios.every((a) => a.anunciante));
  comprobar("Trae el anunciante real", real.anuncios[0]?.anunciante === "Tienda de Prueba Verificación");
  comprobar(
    "Calcula los días activo a partir de la fecha real de inicio (no un número fijo)",
    (real.anuncios[0]?.diasActivo ?? 0) > 0,
  );

  console.log("\n=== 6 · Se guarda sin inventar engagement ===");
  await limpiar();
  const ingestado = await ingerirAnunciosMeta(TERMINO_PRUEBA, { pais: "ES" });
  comprobar("La ingesta guarda el anuncio real", ingestado.ok && ingestado.nuevos === 1, `${ingestado.nuevos} nuevo(s)`);

  const filaGuardada = await prisma.ad.findFirst({ where: { nicheTag: TERMINO_PRUEBA.toLowerCase() } });
  comprobar("El anuncio queda marcado como origen real (no 'seed')", filaGuardada?.origen === "meta-ad-library");
  comprobar(
    "Likes/comments/shares/vistas se quedan en 0 (Meta no los da): nunca un número inventado",
    filaGuardada?.likes === 0 && filaGuardada?.comments === 0 && filaGuardada?.shares === 0 && filaGuardada?.views === 0,
  );
  comprobar("Guarda el enlace real a la Biblioteca de Anuncios de Meta", Boolean(filaGuardada?.adLibraryUrl?.includes("facebook.com/ads/library")));

  console.log("\n=== 7 · Releer el mismo anuncio no lo duplica ===");
  const reingestado = await ingerirAnunciosMeta(TERMINO_PRUEBA, { pais: "ES" });
  comprobar("La segunda lectura actualiza, no duplica", reingestado.ok && reingestado.nuevos === 0 && reingestado.actualizados === 1);
  const total = await prisma.ad.count({ where: { nicheTag: TERMINO_PRUEBA.toLowerCase() } });
  comprobar("Sigue habiendo una sola fila para ese anuncio", total === 1, `${total} fila(s)`);

  await cerrar(servidor);
} catch (error) {
  fallos += 1;
  console.log(`  ❌ La verificación terminó sin excepciones · ${(error as Error).message}`);
} finally {
  await limpiar();
  delete process.env.META_AD_LIBRARY_URL;
}

console.log(`\n=== RESUMEN: ${pasos - fallos}/${pasos} comprobaciones correctas ===`);
if (fallos > 0) process.exit(1);
