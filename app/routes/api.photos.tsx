import { promises as fs } from "fs";
import path from "path";
import { resolvePhotoPath } from "~/utils/photo-path";
import type { Route } from "./+types/api.photos";

export async function loader({ params }: Route.LoaderArgs) {
  const filePath = params["*"] || "";
  const resolved = await resolvePhotoPath(filePath);

  if (resolved && !resolved.isRoot) {
    const fullPath = resolved.fullPath;

    try {
      const stat = await fs.stat(fullPath);
      if (stat.isFile()) {
        const fileContent = await fs.readFile(fullPath);
        const ext = path.extname(fullPath).toLowerCase();
        const mimeType = getMimeType(ext);

        return new Response(fileContent, {
          headers: {
            "Content-Type": mimeType,
            "Cache-Control": "public, max-age=31536000", // Cache for 1 year
          },
        });
      }
    } catch (error) {
      // Failed to access resolved path
    }
  }

  return new Response("File not found", { status: 404 });
}

function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return mimeTypes[ext] || "application/octet-stream";
}
