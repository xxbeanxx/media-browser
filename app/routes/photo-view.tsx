import { promises as fs } from "fs";
import path from "path";
import { useEffect } from "react";
import {
  redirect,
  useLoaderData,
  useNavigate,
  useSubmit,
  type ActionFunctionArgs,
} from "react-router";
import ImageViewer from "~/components/ImageViewer";
import { resolvePhotoPath } from "~/utils/photo-path";
import type { Route } from "./+types/photo-view";

export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const nextUrl = formData.get("nextUrl") as string;

  if (intent === "delete") {
    const filePath = params["*"] || "";
    const resolved = await resolvePhotoPath(filePath);

    if (resolved && !resolved.isRoot) {
      try {
        await fs.unlink(resolved.fullPath);

        if (nextUrl) {
          return redirect(nextUrl);
        }
        return { ok: true };
      } catch (e) {
        console.error("Delete failed", e);
        return { error: "Delete failed" };
      }
    }
  }
  return null;
}

export async function loader({ params }: Route.LoaderArgs) {
  const filePath = params["*"] || "";
  const resolved = await resolvePhotoPath(filePath);

  if (!resolved || resolved.isRoot) {
    return {
      images: [],
      currentIndex: -1,
      currentPath: filePath,
      baseDir: "",
    };
  }

  const { fullPath, baseDir } = resolved;
  const dirPath = path.dirname(fullPath);
  const fileName = path.basename(fullPath);

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const images = entries
      .filter(
        (entry) =>
          entry.isFile() && /\.(jpg|jpeg|png|gif|webp)$/i.test(entry.name)
      )
      .map((entry) => entry.name)
      .sort();

    const currentIndex = images.indexOf(fileName);

    return {
      images,
      currentIndex,
      currentPath: filePath, // Keep the URL path (Alias/Path)
      baseDir,
    };
  } catch (error) {
    console.error("Error loading photo view:", error);
    return {
      images: [],
      currentIndex: -1,
      currentPath: filePath,
      baseDir,
    };
  }
}

export default function PhotoView() {
  const { images, currentIndex, currentPath } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();

  const currentImage = images[currentIndex];

  const prevIndex = currentIndex > 0 ? currentIndex - 1 : images.length - 1;
  const prevImage = images[prevIndex];
  const dirPath = currentPath.substring(0, currentPath.lastIndexOf("/")) || "";
  const prevPath = dirPath ? `${dirPath}/${prevImage}` : prevImage;
  const prevUrl = `/photos/view/${prevPath}`;

  const nextIndex = currentIndex < images.length - 1 ? currentIndex + 1 : 0;
  const nextImage = images[nextIndex];
  const nextPath = dirPath ? `${dirPath}/${nextImage}` : nextImage;
  const nextUrl = `/photos/view/${nextPath}`;

  const closeUrl = `/photos/${
    currentPath.substring(0, currentPath.lastIndexOf("/")) || ""
  }`;

  const handlePrev = () => {
    navigate(prevUrl, { replace: true });
  };

  const handleNext = () => {
    navigate(nextUrl, { replace: true });
  };

  const handleDelete = () => {
    const formData = new FormData();
    formData.append("intent", "delete");
    // Pass the calculated nextUrl so the action can redirect
    if (images.length > 1) {
      formData.append("nextUrl", nextUrl);
    } else {
      // Only 1 image, deleting it means going back to list
      formData.append("nextUrl", closeUrl);
    }
    submit(formData, { method: "post" });
  };

  // Handle Home/End/Escape keys here as strict navigation
  // Zoom keys are handled in component
  // Arrow keys are handled in component calling onPrev/onNext
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Home") {
        const firstImage = images[0];
        const firstPath = dirPath ? `${dirPath}/${firstImage}` : firstImage;
        navigate(`/photos/view/${firstPath}`, { replace: true });
      } else if (event.key === "End") {
        const lastImage = images[images.length - 1];
        const lastPath = dirPath ? `${dirPath}/${lastImage}` : lastImage;
        navigate(`/photos/view/${lastPath}`, { replace: true });
      } else if (event.key === "Escape") {
        navigate(closeUrl, { replace: true });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [images, dirPath, navigate, closeUrl]);

  if (!currentImage) {
    return <div>Image not found</div>;
  }

  return (
    <ImageViewer
      src={`/api/photos/${currentPath}`}
      alt={currentImage}
      onCloseUrl={closeUrl}
      prevUrl={prevUrl}
      nextUrl={nextUrl}
      onPrev={handlePrev}
      onNext={handleNext}
      onDelete={handleDelete}
    />
  );
}
