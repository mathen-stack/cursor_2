import { NextResponse } from "next/server";
import { signUpStoredAccount } from "../../../../lib/user-account-store";
import {
  readJsonWithLimit,
  requestLimitErrorResponse,
} from "../../../../lib/request-limits";

export const runtime = "nodejs";

type SignupPayload = {
  username?: string;
  password?: string;
};

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = await readJsonWithLimit<SignupPayload>(request);
    const account = await signUpStoredAccount({
      username: payload.username ?? "",
      password: payload.password ?? "",
    });
    return NextResponse.json(
      {
        account: {
          username: account.username,
          status: account.status,
        },
        message:
          "Account created. An administrator must approve it before you can sign in.",
      },
      { status: 201 },
    );
  } catch (error) {
    const limitResponse = requestLimitErrorResponse(error);
    if (limitResponse) return limitResponse;
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: number }).status)
        : 400;
    return NextResponse.json(
      {
        error: {
          code:
            status === 409
              ? "USERNAME_TAKEN"
              : "SIGNUP_FAILED",
          message:
            error instanceof Error ? error.message : "Could not create account.",
        },
      },
      { status: Number.isFinite(status) ? status : 400 },
    );
  }
}
