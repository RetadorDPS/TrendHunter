"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Megaphone, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Resumen que devuelve POST /api/ads-spy/buscar. */
interface ResultadoBusqueda {
  ok: boolean;
  termino: string;
  pais: string;
  anunciosLeidos: number;
  nuevos: number;
  actualizados: number;
  error: string | null;
  motivo: string | null;
}

/** Motivos de fallo explicados en lenguaje humano. */
const MOTIVOS: Record<string, string> = {
  "sin-clave":
    "Falta conectar la clave gratuita de Meta Ad Library (FACEBOOK_ACCESS_TOKEN). Sin ella no se pueden buscar anuncios reales.",
  "token-invalido": "La clave de Meta caducó o fue revocada. Hay que generar una nueva.",
  parametros: "Falta el término de búsqueda.",
  limite: "Meta ha limitado las peticiones por ahora. Prueba de nuevo en unos minutos.",
  red: "No se ha podido conectar con Meta (red caída o tardó demasiado).",
  formato: "La respuesta de Meta llegó en un formato inesperado.",
};

const PAISES = [
  { codigo: "ES", etiqueta: "España" },
  { codigo: "US", etiqueta: "Estados Unidos" },
  { codigo: "MX", etiqueta: "México" },
  { codigo: "CO", etiqueta: "Colombia" },
  { codigo: "AR", etiqueta: "Argentina" },
];

/**
 * Buscador de anuncios reales en Meta Ad Library: escribes un producto o
 * marca y se leen los anuncios que de verdad están activos ahora mismo en
 * ese país, sin necesitar saber el nombre de ninguna tienda.
 */
export function BuscarAnunciosReales() {
  const router = useRouter();
  const [termino, setTermino] = useState("");
  const [pais, setPais] = useState("ES");
  const [ocupado, setOcupado] = useState(false);
  const [, iniciarTransicion] = useTransition();
  const [ultima, setUltima] = useState<ResultadoBusqueda | null>(null);

  async function buscar() {
    if (!termino.trim()) {
      toast.error("Escribe qué producto o marca quieres buscar. Ejemplo: masajeador, mochila, suplemento");
      return;
    }
    setOcupado(true);
    try {
      const respuesta = await fetch("/api/ads-spy/buscar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ termino: termino.trim(), pais }),
      });
      const datos = (await respuesta.json()) as ResultadoBusqueda & { error?: string };

      if (!respuesta.ok) {
        setUltima({ ...datos, ok: false });
        toast.error(datos.error ?? "No se pudo buscar anuncios.");
        return;
      }

      setUltima(datos);
      toast.success(`${datos.anunciosLeidos} anuncios reales leídos · ${datos.nuevos} nuevos`);
      iniciarTransicion(() => router.refresh());
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  const fallo = ultima && !ultima.ok;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="size-4 text-indigo-400" />
          Buscar anuncios reales
        </CardTitle>
        <CardDescription>
          Escribe un producto, marca o nicho. Se buscan los anuncios que de verdad están activos ahora
          mismo en Meta Ad Library (Facebook/Instagram) — sin necesitar saber el nombre de ninguna
          tienda de antemano.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="termino-anuncio">Producto, marca o nicho</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="termino-anuncio"
              placeholder="Ej. masajeador, mochila térmica, collar antipulgas"
              value={termino}
              onChange={(evento) => setTermino(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key === "Enter") void buscar();
              }}
              autoComplete="off"
              className="flex-1"
            />
            <select
              value={pais}
              onChange={(evento) => setPais(evento.target.value)}
              aria-label="País de alcance del anuncio"
              className="h-9 rounded-md border border-input bg-surface px-3 text-sm"
            >
              {PAISES.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.etiqueta}
                </option>
              ))}
            </select>
            <Button onClick={() => void buscar()} disabled={ocupado} className="shrink-0 gap-2">
              {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Buscar
            </Button>
          </div>
        </div>

        {ultima && (
          <div
            className={
              fallo
                ? "rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
                : "rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm"
            }
          >
            {fallo ? (
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                <span>
                  <strong>No se pudo buscar.</strong> {MOTIVOS[ultima.motivo ?? ""] ?? ultima.error ?? "Motivo desconocido."}
                </span>
              </p>
            ) : (
              <p className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                <span>
                  <strong>{ultima.anunciosLeidos} anuncios reales</strong> encontrados para «{ultima.termino}» en{" "}
                  {PAISES.find((p) => p.codigo === ultima.pais)?.etiqueta ?? ultima.pais} ({ultima.nuevos} nuevos,{" "}
                  {ultima.actualizados} actualizados).
                </span>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
