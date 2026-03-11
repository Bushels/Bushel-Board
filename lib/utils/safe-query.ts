import { isDynamicServerError } from "next/dist/client/components/hooks-server-context";
import { isStaticGenBailoutError } from "next/dist/client/components/static-generation-bailout";

export interface SafeQuerySuccess<T> {
  data: T;
  error: null;
}

export interface SafeQueryFailure {
  data: null;
  error: string;
}

export type SafeQueryResult<T> = SafeQuerySuccess<T> | SafeQueryFailure;

export function rethrowFrameworkError(error: unknown) {
  if (isDynamicServerError(error) || isStaticGenBailoutError(error)) {
    throw error;
  }
}

export async function safeQuery<T>(
  label: string,
  query: () => Promise<T>
): Promise<SafeQueryResult<T>> {
  try {
    return {
      data: await query(),
      error: null,
    };
  } catch (error) {
    rethrowFrameworkError(error);
    console.error(`${label} failed:`, error);
    return {
      data: null,
      error: `${label} is temporarily unavailable.`,
    };
  }
}
