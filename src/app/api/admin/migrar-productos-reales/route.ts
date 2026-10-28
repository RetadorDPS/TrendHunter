import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

/**
 * Migración aditiva única: crea `SavedRealProduct` y añade las columnas de
 * producto real a `AiGeneration`. Todo con `IF NOT EXISTS` — repetirla no
 * hace nada la segunda vez. Solo admin, y usa la conexión que ya tiene la
 * propia app (nunca se expone ni se imprime la cadena de conexión).
 */
const SENTENCIAS = [
  `CREATE TABLE IF NOT EXISTS "SavedRealProduct" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "clave" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "nicho" TEXT NOT NULL,
  "imagen" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SavedRealProduct_userId_clave_key" ON "SavedRealProduct"("userId", "clave")`,
  `CREATE INDEX IF NOT EXISTS "SavedRealProduct_userId_idx" ON "SavedRealProduct"("userId")`,
  `DO $$ BEGIN
  ALTER TABLE "SavedRealProduct" ADD CONSTRAINT "SavedRealProduct_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`,
  `ALTER TABLE "AiGeneration" ADD COLUMN IF NOT EXISTS "productoRealClave" TEXT`,
  `ALTER TABLE "AiGeneration" ADD COLUMN IF NOT EXISTS "productoRealTitulo" TEXT`,
];

export async function POST() {
  const { respuesta } = await requireAdmin();
  if (respuesta) return respuesta;

  const ejecutadas: string[] = [];
  for (const sql of SENTENCIAS) {
    await prisma.$executeRawUnsafe(sql);
    ejecutadas.push(sql.split("\n")[0].slice(0, 80));
  }

  return NextResponse.json({ ok: true, ejecutadas: ejecutadas.length });
}
