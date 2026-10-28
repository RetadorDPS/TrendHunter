/**
 * Siembra tiendas Shopify reales por nicho.
 *
 *   npx tsx scripts/sembrar-tiendas-nicho.mts
 *
 * Lee `scripts/tiendas-nicho.json` (nicho → dominios reales, cada uno
 * verificado a mano contra su `/products.json` antes de entrar en la lista)
 * y llama a `ingerirTienda` por cada dominio, igual que hace la ingesta
 * normal: lee el catálogo público de verdad, sin inventar nada. Si un
 * dominio ya no responde o dejó de ser Shopify, se salta con su motivo; no
 * se crea ninguna tienda vacía.
 *
 * Pausa pequeña entre tiendas para no golpear los catálogos de golpe.
 */

import { readFileSync } from "node:fs";
import { ingerirTienda } from "../src/lib/ingesta";

const RUTA = new URL("./tiendas-nicho.json", import.meta.url);
const PAUSA_MS = 500;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const porNicho: Record<string, string[]> = JSON.parse(readFileSync(RUTA, "utf8"));

  const resumen: Array<{ nicho: string; ok: number; fallo: number; productos: number }> = [];

  for (const [nicho, dominios] of Object.entries(porNicho)) {
    let ok = 0;
    let fallo = 0;
    let productos = 0;

    for (const dominio of dominios) {
      const resultado = await ingerirTienda(dominio, { nicho, pais: "US", paginas: 2 });
      if (resultado.ok) {
        ok += 1;
        productos += resultado.productosLeidos;
        console.log(`[ok] ${nicho} · ${dominio} · ${resultado.productosLeidos} productos`);
      } else {
        fallo += 1;
        console.log(`[fallo] ${nicho} · ${dominio} · ${resultado.motivo ?? resultado.error}`);
      }
      await esperar(PAUSA_MS);
    }

    resumen.push({ nicho, ok, fallo, productos });
  }

  console.log("\n--- RESUMEN DE LA SIEMBRA ---");
  let totalOk = 0;
  let totalProductos = 0;
  for (const fila of resumen) {
    console.log(`${fila.nicho}: ${fila.ok} tiendas guardadas, ${fila.fallo} fallidas, ${fila.productos} productos reales leídos`);
    totalOk += fila.ok;
    totalProductos += fila.productos;
  }
  console.log(`\nTotal: ${totalOk} tiendas reales, ${totalProductos} productos reales leídos.`);
}

main()
  .catch((error) => {
    console.error("Error al sembrar tiendas por nicho:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { default: prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  });
