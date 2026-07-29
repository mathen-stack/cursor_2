import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "resume_tailor_session";

function hasSessionCookie(request: NextRequest): boolean {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return Boolean(token && token.includes("."));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/login";
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

  const loggedIn = hasSessionCookie(request);

  if (!loggedIn && !isLoginPage) {
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

  if (loggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
