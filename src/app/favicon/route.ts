import { readFile } from "node:fs/promises";
import path from "node:path";

/** Serves the real Genie logo as the /favicon URL. */
export async function GET() {
  const file = await readFile(path.join(process.cwd(), "public/logo/genie-logo.jpg"));
  return new Response(file, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
