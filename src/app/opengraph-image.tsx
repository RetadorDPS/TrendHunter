import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Necesario para que `output: "export"` (la exportación estática de
// GitHub Pages) pueda generar esta imagen como archivo fijo en el build.
export const dynamic = "force-static";

/**
 * Imagen de vista previa para cuando se comparte el enlace en redes
 * sociales, WhatsApp o Slack. Se genera en el build (no hay foto ni dato
 * inventado: son los mismos textos y colores de marca que usa la interfaz).
 */
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #0b1020 0%, #1e1b4b 60%, #312e81 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "36px",
          }}
        >
          <div
            style={{
              display: "flex",
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
            }}
          />
          <span style={{ fontSize: "34px", fontWeight: 700, color: "#f1f5f9" }}>TrendHunter Pro</span>
        </div>
        <div style={{ display: "flex", fontSize: "56px", fontWeight: 700, color: "#f8fafc", lineHeight: 1.15, maxWidth: "980px" }}>
          Encuentra productos ganadores antes que tu competencia
        </div>
        <div style={{ display: "flex", fontSize: "28px", color: "#c7d2fe", marginTop: "28px", maxWidth: "900px" }}>
          Tendencias, espía de anuncios, análisis de tiendas Shopify e IA para e-commerce y dropshipping.
        </div>
      </div>
    ),
    { ...size },
  );
}
