import { createCookie } from "react-router";

const SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";

export const authCookie = createCookie("mb_auth", {
  secrets: [SECRET],
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  // No maxAge => session cookie
});

export async function isAuthenticated(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return false;
  try {
    const val = await authCookie.parse(cookieHeader);
    return val === "1";
  } catch {
    return false;
  }
}
