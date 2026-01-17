import crypto from "crypto";
import fsSync, { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import { isAuthenticated } from "~/utils/auth.server";
import { resolvePhotoPath } from "~/utils/photo-path";
import type { Route } from "./+types/api.thumbnails";

// Ensure cache directory exists
const CACHE_DIR = path.join(process.cwd(), ".cache", "thumbnails");
fsSync.mkdirSync(CACHE_DIR, { recursive: true });

export async function loader({ params }: Route.LoaderArgs) {
  // Protect thumbnail access similarly to photos API
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req: any = (globalThis as any).__RR_REQUEST || undefined;
  if (typeof Request !== "undefined" && req && req instanceof Request) {
    const authed = await isAuthenticated(req as Request);
    if (!authed) return new Response("Unauthorized", { status: 401 });
  }
  const filePath = params["*"] || "";
  const resolved = await resolvePhotoPath(filePath);

  if (!resolved || resolved.isRoot) {
    return new Response("Not found", { status: 404 });
  }

  const { fullPath } = resolved;

  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) {
      return new Response("Not a file", { status: 404 });
    }

    // Generate hash based on file path and modification time
    const hash = crypto
      .createHash("md5")
      .update(fullPath)
      .update(String(stat.mtimeMs))
      .digest("hex");

    const cachePath = path.join(CACHE_DIR, `${hash}.webp`);

    try {
      // Check if cached thumbnail exists
      const cachedImage = await fs.readFile(cachePath);
      return new Response(cachedImage, {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=31536000",
        },
      });
    } catch (e) {
      // Cached file doesn't exist, generate it
    }

    // Generate thumbnail
    await sharp(fullPath)
      .rotate() // Auto-rotate based on EXIF
      .resize(400, 400, {
        fit: "cover",
        position: "center",
      })
      .webp({ quality: 80 })
      .toFile(cachePath);

    const newThumbnail = await fs.readFile(cachePath);

    return new Response(newThumbnail, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (error) {
    console.error("Error generating thumbnail:", error);
    return new Response("Error generating thumbnail", { status: 500 });
  }
}
