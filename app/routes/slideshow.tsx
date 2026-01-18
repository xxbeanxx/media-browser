import { promises as fs } from "fs";
import path from "path";
import { useEffect, useState } from "react";
import {
  Link,
  redirect,
  useLoaderData,
  useNavigate,
  useSearchParams,
  useSubmit,
  type ActionFunctionArgs,
} from "react-router";
import ImageViewer from "~/components/ImageViewer";
import { resolvePhotoPath } from "~/utils/photo-path";
import type { Route } from "./+types/slideshow";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const filePath = formData.get("filePath") as string;

  if (intent === "delete" && filePath) {
    const resolved = await resolvePhotoPath(filePath);
    if (resolved && !resolved.isRoot) {
      try {
        await fs.unlink(resolved.fullPath);
        return { ok: true };
      } catch (e) {
        console.error("Delete failed", e);
        return { error: "Delete failed" };
      }
    }
  }
  return null;
}

async function getAllImages(dirPath: string): Promise<string[]> {
  const images: string[] = [];

  async function scanDir(currentPath: string, relativePath: string = "") {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relPath = relativePath
        ? path.join(relativePath, entry.name)
        : entry.name;

      if (entry.isDirectory()) {
        await scanDir(fullPath, relPath);
      } else if (
        entry.isFile() &&
        /\.(jpg|jpeg|png|gif|webp)$/i.test(entry.name)
      ) {
        images.push(relPath);
      }
    }
  }

  await scanDir(dirPath);
  return images.sort();
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const dirPath = (params["*"] || "").replace(/\/$/, ""); // Remove trailing slash
  const resolved = await resolvePhotoPath(dirPath);

  let fullDirPath = "";
  let baseDir = "";

  if (resolved && !resolved.isRoot) {
    fullDirPath = resolved.fullPath;
    baseDir = resolved.baseDir;
  } else if (resolved && resolved.isRoot && resolved.photoDirs.length > 0) {
    fullDirPath = resolved.photoDirs[0];
    baseDir = resolved.photoDirs[0];
  }

  if (!fullDirPath) {
    return {
      images: [],
      currentPath: dirPath,
      baseDir: "",
      random: false,
    };
  }

  try {
    const images = await getAllImages(fullDirPath);

    const url = new URL(request.url);
    const random = url.searchParams.get("random") === "true";
    const seedParam = url.searchParams.get("seed");

    // If random requested but no seed provided, generate one and redirect
    if (random && !seedParam) {
      const seed = Math.floor(Math.random() * 0xffffffff);
      url.searchParams.set("seed", String(seed));
      return redirect(url.toString());
    }

    // If seed provided, use a deterministic shuffle so reloading (eg delete)
    // preserves ordering except for the removed file.
    if (random && seedParam) {
      const seed = Number(seedParam) || 0;

      // small seeded PRNG (mulberry32)
      function mulberry32(a: number) {
        return function () {
          let t = (a += 0x6d2b79f5);
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }

      const rand = mulberry32(seed >>> 0);

      for (let i = images.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [images[i], images[j]] = [images[j], images[i]];
      }
    }

    return {
      images,
      currentPath: dirPath,
      baseDir,
      random,
    };
  } catch (error) {
    console.error("Error loading slideshow:", error);
    return {
      images: [],
      currentPath: dirPath,
      baseDir,
      random: false,
    };
  }
}

export default function Slideshow() {
  const { images, currentPath, random } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const [searchParams] = useSearchParams();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [delay, setDelay] = useState(999999999); // Default infinity
  const currentImage = images[currentIndex];

  // Clamp index if images change (e.g. after delete)
  useEffect(() => {
    if (currentIndex >= images.length && images.length > 0) {
      setCurrentIndex(Math.max(0, images.length - 1));
    }
  }, [images.length, currentIndex]);

  const handleDelete = () => {
    const imagePath = currentPath
      ? `${currentPath}/${currentImage}`
      : currentImage;
    const formData = new FormData();
    formData.append("intent", "delete");
    formData.append("filePath", imagePath);

    // Preserve current search params (random + seed) so the loader keeps the
    // same randomized ordering after deletion.
    const params = new URLSearchParams(searchParams);
    const actionUrl = params.toString() ? `?${params.toString()}` : undefined;

    // Deleting maintains the current index, which naturally points to the next item
    // unless we were at the end, which the useEffect above handles.
    submit(formData, { method: "post", action: actionUrl });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
      } else if (event.key === "ArrowRight") {
        setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
      } else if (event.key === "Home") {
        setCurrentIndex(0);
      } else if (event.key === "End") {
        setCurrentIndex(images.length - 1);
      } else if (event.key === "Escape") {
        navigate(`/photos/${currentPath}`, { replace: true });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [images.length, currentPath, navigate]);

  // Auto advance based on current delay
  useEffect(() => {
    // Don't auto-advance if delay is set to infinity
    if (delay === 999999999) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    }, delay);

    return () => clearInterval(timer);
  }, [images.length, delay, currentIndex]);

  if (!currentImage) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="text-white">No images found</div>
        <Link
          to={`/photos/${currentPath}`}
          className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300"
        >
          ✕
        </Link>
      </div>
    );
  }

  return (
    <>
      <ImageViewer
        src={`/api/photos/${
          currentPath ? `${currentPath}/${currentImage}` : currentImage
        }`}
        alt={currentImage}
        onCloseUrl={`/photos/${currentPath}`}
        onPrev={() =>
          setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))
        }
        onNext={() =>
          setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))
        }
        onDelete={handleDelete}
      />

      {/* Delay control buttons */}
      <div className="fixed top-14 right-4 flex gap-1 z-50">
        {[1000, 3000, 5000, 10000, Infinity].map((delayMs) => (
          <button
            key={delayMs}
            onClick={() => setDelay(delayMs === Infinity ? 999999999 : delayMs)}
            className={`px-2 py-1 text-xs rounded ${
              delay === (delayMs === Infinity ? 999999999 : delayMs)
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
            title={
              delayMs === Infinity
                ? "No auto-advance"
                : `Set delay to ${delayMs / 1000}s`
            }
          >
            {delayMs === Infinity ? "∞" : `${delayMs / 1000}s`}
          </button>
        ))}
      </div>

      {/* Image counter */}
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 text-white z-50">
        {currentIndex + 1} / {images.length} (
        {delay === 999999999 ? "∞" : `${delay / 1000}s`})
      </div>
    </>
  );
}
