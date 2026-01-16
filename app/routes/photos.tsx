import { promises as fs } from "fs";
import path from "path";
import { useState } from "react";
import { Link, useLoaderData, useParams } from "react-router";
import { resolvePhotoPath } from "~/utils/photo-path";
import type { Route } from "./+types/photos";

export async function loader({ params }: Route.LoaderArgs) {
  const currentPath = (params["*"] || "").replace(/\/$/, ""); // Remove trailing slash
  const resolved = await resolvePhotoPath(currentPath);

  // If resolving returns root or null, we list the root folders
  if (!resolved || resolved.isRoot) {
    const photoDirs = process.env.PHOTO_DIRS?.split(",") || [];
    return {
      items: photoDirs.map((dir) => ({
        name: path.basename(dir),
        type: "dir" as const,
      })),
      currentPath: "",
      baseDir: "",
      isRoot: true,
    };
  }

  const { fullPath, baseDir } = resolved;

  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    const dirs: string[] = [];
    const files: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        dirs.push(entry.name);
      } else if (
        entry.isFile() &&
        /\.(jpg|jpeg|png|gif|webp)$/i.test(entry.name)
      ) {
        files.push(entry.name);
      }
    }

    return {
      items: [
        ...dirs.map((name) => ({ name, type: "dir" as const })),
        ...files.map((name) => ({ name, type: "file" as const })),
      ],
      currentPath,
      baseDir,
    };
  } catch (error) {
    console.error("Error reading directory:", error);
    // Fallback to empty if allowed, or error
    return { items: [], currentPath, baseDir };
  }
}

export default function Photos() {
  const { items, currentPath, baseDir } = useLoaderData<typeof loader>();
  const params = useParams();
  const [showDropdown, setShowDropdown] = useState(false);

  const pathSegments = currentPath.split("/").filter(Boolean);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Breadcrumb */}
        <div className="mb-4">
          <Link to="/" className="text-blue-600 hover:underline">
            Home
          </Link>
          <span className="mx-2">/</span>
          <Link to="/photos" className="text-blue-600 hover:underline">
            Photos
          </Link>
          {pathSegments.map((segment, index) => (
            <span key={index}>
              <span className="mx-2">/</span>
              <Link
                to={`/photos/${pathSegments.slice(0, index + 1).join("/")}`}
                className="text-blue-600 hover:underline"
              >
                {segment}
              </Link>
            </span>
          ))}
        </div>

        {/* Start Slideshow Button */}
        <div className="mb-4 relative inline-flex">
          <Link
            to={`/photos/slideshow/${currentPath}`}
            className="px-4 py-2 bg-green-600 text-white rounded-l hover:bg-green-700 inline-flex items-center"
          >
            Start Slideshow
          </Link>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="px-2 py-2 bg-green-600 text-white rounded-r hover:bg-green-700 border-l border-green-700 flex items-center"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {showDropdown && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg z-10">
              <Link
                to={`/photos/slideshow/${currentPath}?random=true`}
                className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => setShowDropdown(false)}
              >
                Random Order
              </Link>
            </div>
          )}
        </div>

        {/* Grid of items */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((item) => (
            <div
              key={item.name}
              className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow"
            >
              {item.type === "dir" ? (
                <Link
                  to={`/photos/${
                    currentPath ? `${currentPath}/${item.name}` : item.name
                  }`}
                  className="block hover:opacity-90"
                >
                  <div className="w-full h-48 flex items-center justify-center bg-gray-200 dark:bg-gray-700 text-6xl">
                    📁
                  </div>
                  <div className="p-2 text-center text-sm">{item.name}</div>
                </Link>
              ) : (
                <Link
                  to={`/photos/view/${
                    currentPath ? `${currentPath}/${item.name}` : item.name
                  }`}
                  className="block"
                >
                  <img
                    src={`/api/thumbnails/${
                      currentPath ? `${currentPath}/${item.name}` : item.name
                    }`}
                    alt={item.name}
                    className="w-full h-48 object-cover"
                    loading="lazy"
                  />
                  <div className="p-2 text-center text-sm">{item.name}</div>
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
