import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("photos/view/*", "routes/photo-view.tsx"),
  route("photos/slideshow/*", "routes/slideshow.tsx"),
  route("photos/*", "routes/photos.tsx"),
  route("api/photos/*", "routes/api.photos.tsx"),
  route("api/thumbnails/*", "routes/api.thumbnails.tsx"),
] satisfies RouteConfig;
