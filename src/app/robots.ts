import type { MetadataRoute } from "next";
import { urlApp } from "@/lib/app-url";

// Necesario para que `output: "export"` (la exportación estática de
// GitHub Pages) pueda generar este archivo como fijo en el build.
export const dynamic = "force-static";

/**
 * Las páginas privadas (panel, API, enlaces de invitación/token) no deben
 * indexarse: no aportan nada a un buscador y algunas filtran datos propios
 * de la cuenta (token de invitación, token de informe compartido).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/api", "/equipos/aceptar", "/informe", "/reset-password", "/offline"],
    },
    sitemap: `${urlApp()}/sitemap.xml`,
  };
}
