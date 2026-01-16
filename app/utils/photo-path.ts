import { promises as fs } from "fs";
import path from "path";

type ResolveResult =
  | {
      isRoot: true;
      photoDirs: string[];
      fullPath?: undefined;
      baseDir?: undefined;
      relativePath?: undefined;
    }
  | {
      isRoot: false;
      fullPath: string;
      baseDir: string;
      relativePath: string;
      photoDirs?: undefined;
    };

export async function resolvePhotoPath(
  urlPath: string
): Promise<ResolveResult | null> {
  const photoDirs = process.env.PHOTO_DIRS?.split(",") || [];
  if (photoDirs.length === 0) return null;

  // Remove leading/trailing slashes
  const cleanUrl = urlPath.replace(/^\/+|\/+$/g, "");

  if (!cleanUrl) {
    // Root requested. Return null to indicate "List Roots" behavior needed, or handle differently?
    // Actually, for file resolution, empty path is invalid for a file.
    // For folder browsing, empty path is Root Listing.
    return { isRoot: true, photoDirs };
  }

  const parts = cleanUrl.split("/");
  const firstSegment = parts[0];

  // Check if the first segment matches a root folder name
  const matchedDir = photoDirs.find(
    (dir) => path.basename(dir) === firstSegment
  );

  if (matchedDir) {
    // Exact alias match
    const relativePath = parts.slice(1).join("/");
    return {
      fullPath: path.join(matchedDir, relativePath),
      baseDir: matchedDir,
      relativePath: relativePath,
      isRoot: false,
    };
  }

  // Fallback for legacy behavior (assume first dir)
  // Or should we search all dirs? api.photos loops.
  // Given users want to "Start browsing", let's prioritize the explicit structure.
  // But if we have existing links or bookmarks, fallback to dir[0] is safer?
  // Let's try to find the file in all dirs like api.photos does as a fallback.

  for (const dir of photoDirs) {
    const tryPath = path.join(dir, cleanUrl);
    try {
      await fs.access(tryPath);
      return {
        fullPath: tryPath,
        baseDir: dir,
        relativePath: cleanUrl,
        isRoot: false,
      };
    } catch {}
  }

  // Default to first dir if essentially everything failed (legacy assumption)
  return {
    fullPath: path.join(photoDirs[0], cleanUrl),
    baseDir: photoDirs[0],
    relativePath: cleanUrl,
    isRoot: false,
  };
}
