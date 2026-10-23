import type { MetadataRoute } from "next";
import { urlApp } from "@/lib/app-url";

// Necesario para que `output: "export"` (la exportación estática de
// GitHub Pages) pueda generar este archivo como fijo en el build.
export const dynamic = "force-static";

/**
 * Solo las páginas públicas de marketing/autenticación: el panel entero
 * queda fuera porque exige sesión y no tiene valor indexable.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = urlApp();
  const ahora = new Date();

  const paginas: Array<{ ruta: string; prioridad: number; frecuencia: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]> }> = [
    { ruta: "", prioridad: 1, frecuencia: "weekly" },
    { ruta: "/pricing", prioridad: 0.9, frecuencia: "weekly" },
    { ruta: "/register", prioridad: 0.5, frecuencia: "monthly" },
    { ruta: "/login", prioridad: 0.3, frecuencia: "monthly" },
    { ruta: "/forgot-password", prioridad: 0.1, frecuencia: "yearly" },
  ];

  return paginas.map(({ ruta, prioridad, frecuencia }) => ({
    url: `${base}${ruta}`,
    lastModified: ahora,
    changeFrequency: frecuencia,
    priority: prioridad,
  }));
}
