import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData } from "react-router";
import { authCookie } from "~/utils/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // If already authenticated, redirect home
  const cookie = request.headers.get("cookie") || "";
  try {
    const val = await authCookie.parse(cookie);
    if (val === "1") return redirect("/");
  } catch {}
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const password = form.get("password") as string | null;

  const expected = process.env.SITE_PASSWORD || "";
  if (!expected) {
    return { error: "No password configured on server" };
  }

  if (password === expected) {
    const headers = new Headers();
    headers.append("Set-Cookie", await authCookie.serialize("1"));
    return redirect("/", { headers });
  }

  return { error: "Invalid password" };
}

export default function Login() {
  const data = useActionData();

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-sm p-6 bg-white dark:bg-gray-800 rounded shadow">
        <h1 className="text-xl font-semibold mb-4 text-center">
          Enter Password
        </h1>
        {data?.error && <div className="mb-4 text-red-600">{data.error}</div>}
        <Form method="post">
          <input
            name="password"
            type="password"
            placeholder="Password"
            className="w-full p-2 border rounded mb-4"
          />
          <button className="w-full px-4 py-2 bg-blue-600 text-white rounded">
            Login
          </button>
        </Form>
      </div>
    </main>
  );
}
