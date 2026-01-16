import { Link } from "react-router";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Media Browser" },
    { name: "description", content: "Browse your photos and videos" },
  ];
}

export default function Home() {
  return (
    <main className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="text-center space-y-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
          Media Browser
        </h1>
        <div className="space-y-4">
          <Link
            to="/photos"
            className="block w-64 mx-auto px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Photos
          </Link>
          <button
            disabled
            className="block w-64 mx-auto px-6 py-3 bg-gray-400 text-gray-600 rounded-lg cursor-not-allowed"
          >
            Videos (Coming Soon)
          </button>
        </div>
      </div>
    </main>
  );
}
