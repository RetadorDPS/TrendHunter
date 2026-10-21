"use client";

import { useState } from "react";
import { Check, Copy, Link2, Loader2, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface BotonCompartirInformeProps {
  origen: "producto" | "tienda";
  id: string;
  /** Plan efectivo de la sesión: solo Agency comparte informes. */
  plan: string;
}

/**
 * Botón «Compartir»: crea (o revoca) el enlace público de solo lectura de
 * este producto o tienda. Solo Agency (incluye el modo cliente); con otro
 * plan, explica el motivo en vez de fallar en silencio.
 */
export function BotonCompartirInforme({ origen, id, plan }: BotonCompartirInformeProps) {
  const [ocupado, setOcupado] = useState(false);
  const [enlace, setEnlace] = useState<{ url: string; expiraEn: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const ruta = origen === "producto" ? `/api/productos/${id}/informe/compartir` : `/api/tiendas/${id}/informe/compartir`;

  async function compartir() {
    if (plan !== "AGENCY") {
      toast.error("Compartir informes está en el plan Agency (incluye el modo cliente).");
      return;
    }
    setOcupado(true);
    try {
      const respuesta = await fetch(ruta, { method: "POST" });
      const datos = (await respuesta.json()) as { error?: string; url?: string; expiraEn?: string };
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo crear el enlace.");
      setEnlace({ url: datos.url!, expiraEn: datos.expiraEn! });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function revocar() {
    setOcupado(true);
    try {
      const respuesta = await fetch(ruta, { method: "DELETE" });
      if (!respuesta.ok) throw new Error("No se pudo revocar el enlace.");
      setEnlace(null);
      toast.success("Enlace revocado. Ya no se puede abrir.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function copiar() {
    if (!enlace) return;
    await navigator.clipboard.writeText(enlace.url);
    setCopiado(true);
    toast.success("Enlace copiado");
    setTimeout(() => setCopiado(false), 2_000);
  }

  if (enlace) {
    return (
      <div className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1.5 text-xs">
        <Link2 className="size-3.5 shrink-0 text-emerald-300" />
        <code className="max-w-[220px] truncate">{enlace.url}</code>
        <span className="shrink-0 text-muted-foreground">
          hasta {new Date(enlace.expiraEn).toLocaleDateString("es-ES")}
        </span>
        <Button size="icon-sm" variant="ghost" onClick={() => void copiar()} aria-label="Copiar enlace" className="size-6">
          {copiado ? <Check className="text-emerald-400" /> : <Copy />}
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={() => void revocar()} disabled={ocupado} aria-label="Revocar enlace" title="Revocar" className="size-6">
          {ocupado ? <Loader2 className="animate-spin" /> : <X />}
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={() => void compartir()} disabled={ocupado} className="gap-2">
      {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
      Compartir
    </Button>
  );
}
