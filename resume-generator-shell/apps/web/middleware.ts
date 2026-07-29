import { NextResponse, type NextRequest } from "next/server";
import {
  clearSessionCookie,
  getRequestSessionState,
  SESSION_COOKIE_NAME,
} from "./lib/session-edge";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/login";
  const isSignupPage = pathname === "/signup";
  const isPublicAuthPage = isLoginPage || isSignupPage;
  const isAuthApi = pathname.startsWith("/api/auth/");
  const isHealth = pathname === "/api/health";
  const isPublicAsset =
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico");

  if (isAuthApi || isHealth || isPublicAsset) {
    return NextResponse.next();
  }

  const sessionState = await getRequestSessionState(request);

  if (sessionState === "invalid") {
    const target = isPublicAuthPage
      ? NextResponse.next()
      : NextResponse.redirect(
          new URL(
            `/login?next=${encodeURIComponent(pathname)}`,
            request.url,
          ),
        );
    clearSessionCookie(target);
    return target;
  }

  if (sessionState === "missing" && !isPublicAuthPage) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Login required.",
          },
        },
        { status: 401 },
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (sessionState === "valid" && isPublicAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
