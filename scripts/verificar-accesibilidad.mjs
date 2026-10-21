/**
 * Auditoría de accesibilidad con axe-core (motor real, no una lista de reglas
 * escrita a mano): recorre las pantallas públicas y del panel, inyecta axe y
 * exige que no haya violaciones WCAG2A/AA de impacto "serious" o "critical".
 *
 *   npm run verify:accesibilidad        (requiere `npm run start`)
 *
 * Las de impacto "moderate"/"minor" se cuentan pero no hacen fallar la
 * verificación: muchas son matices de diseño, no barreras reales de acceso.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EJECUTABLE = process.env.CHROMIUM_PATH ?? path.join(process.cwd(), ".chromium", "chromium");
const LIBRERIAS = [path.join(process.cwd(), ".chromium", "libs"), path.join(process.cwd(), ".chromium", "libs", "lib")].join(":");
const AXE_JS = readFileSync(path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js"), "utf8");

const PAGINAS_PUBLICAS = ["/", "/login", "/register", "/forgot-password", "/pricing"];
const PAGINAS_PANEL = [
  "/dashboard",
  "/dashboard/winning-products",
  "/dashboard/ads-spy",
  "/dashboard/fuentes",
  "/dashboard/shop-analyzer",
  "/dashboard/store-tracker",
  "/dashboard/product-tracker",
  "/dashboard/suppliers",
  "/dashboard/ai-studio",
  "/dashboard/settings",
  "/dashboard/settings/billing",
  "/dashboard/settings/notifications",
  "/dashboard/equipos",
];

const resultados = [];
function registrar(nombre, ok, detalle = "") {
  resultados.push({ nombre, ok });
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const navegador = await chromium.launch({
  executablePath: EJECUTABLE,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  env: { ...process.env, LD_LIBRARY_PATH: `${LIBRERIAS}:${process.env.LD_LIBRARY_PATH ?? ""}` },
});

let violacionesGraves = 0;
let violacionesMenores = 0;

async function auditar(pagina, ruta) {
  await pagina.goto(`${BASE}${ruta}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await pagina.waitForTimeout(1_200);
  await pagina.evaluate(AXE_JS);
  const informe = await pagina.evaluate(() =>
    window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } }),
  );

  const graves = informe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const menores = informe.violations.filter((v) => v.impact === "moderate" || v.impact === "minor");
  violacionesGraves += graves.length;
  violacionesMenores += menores.length;

  const detalleGraves = graves
    .map((v) => `${v.id} (${v.impact}, ${v.nodes.length} elemento${v.nodes.length === 1 ? "" : "s"}): ${v.help}`)
    .join(" · ");

  registrar(
    `${ruta} sin violaciones graves`,
    graves.length === 0,
    graves.length > 0 ? detalleGraves : `${menores.length} menores (no bloquean)`,
  );
}

try {
  // ------------------------------------------------------- páginas públicas
  const publicas = await navegador.newContext({ locale: "es-ES", colorScheme: "dark", viewport: { width: 1440, height: 1000 } });
  const paginaPublica = await publicas.newPage();
  for (const ruta of PAGINAS_PUBLICAS) {
    await auditar(paginaPublica, ruta);
  }

  // ------------------------------------------------------------ panel (demo)
  const sesion = await navegador.newContext({ locale: "es-ES", colorScheme: "dark", viewport: { width: 1440, height: 1000 } });
  const paginaSesion = await sesion.newPage();
  await paginaSesion.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await paginaSesion.waitForTimeout(1_500);
  await paginaSesion.fill("#email", "admin@trendhunter.pro");
  await paginaSesion.fill("#password", "admin1234");
  await paginaSesion.click('button[type="submit"]');
  await paginaSesion.waitForTimeout(3_000);

  for (const ruta of PAGINAS_PANEL) {
    await auditar(paginaSesion, ruta);
  }

  console.log(`\nTotal: ${violacionesGraves} violaciones graves · ${violacionesMenores} menores (informativas).`);
} catch (error) {
  registrar("La verificación terminó sin excepciones", false, error.message);
} finally {
  await navegador.close();
}

const fallos = resultados.filter((fila) => !fila.ok).length;
console.log(`\n=== RESUMEN: ${resultados.length - fallos}/${resultados.length} páginas sin violaciones graves ===`);
if (fallos > 0) process.exit(1);
