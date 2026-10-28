"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface GuardarProductoRealProps {
  clave: string;
  titulo: string;
  nicho: string;
  imagen: string | null;
  guardado?: boolean;
  className?: string;
}

/** Estrella para guardar/quitar un producto REAL (no el catálogo de ejemplo). */
export function GuardarProductoReal({
  clave,
  titulo,
  nicho,
  imagen,
  guardado: guardadoInicial = false,
  className,
}: GuardarProductoRealProps) {
  const router = useRouter();
  const [guardado, setGuardado] = useState(guardadoInicial);
  const [cargando, setCargando] = useState(false);

  async function alternar(evento: React.MouseEvent) {
    evento.preventDefault();
    evento.stopPropagation();
    setCargando(true);
    try {
      const respuesta = await fetch("/api/saved-real-products", {
        method: guardado ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clave, titulo, nicho, imagen }),
      });
      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => ({}));
        throw new Error(datos.error ?? "No se pudo guardar");
      }
      setGuardado(!guardado);
      toast.success(guardado ? "Eliminado de guardados" : "Guardado");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar");
    } finally {
      setCargando(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      loading={cargando}
      onClick={alternar}
      aria-label={guardado ? "Quitar de guardados" : "Guardar producto real"}
      className={cn(
        "bg-slate-950/70 backdrop-blur hover:bg-slate-900",
        guardado && "text-amber-400",
        className,
      )}
    >
      {!cargando && <Bookmark className={cn("size-4", guardado && "fill-amber-400")} />}
    </Button>
  );
}
