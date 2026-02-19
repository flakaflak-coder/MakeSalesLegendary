import { ApiError } from "@/lib/api";

const STATUS_MESSAGES: Record<number, string> = {
  400: "The request was invalid. Please check your input.",
  401: "You are not authorized. Check your admin token.",
  403: "Access is forbidden. Check your permissions.",
  404: "We couldn’t find what you asked for.",
  409: "There is a conflict with the current data.",
  422: "Some required fields are missing or invalid.",
  429: "Too many requests. Please wait a moment and try again.",
  500: "The server hit an error. Please try again shortly.",
  502: "The service is unavailable. Please try again shortly.",
  503: "The service is temporarily unavailable. Please try again shortly.",
};

export function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status in STATUS_MESSAGES) {
      return STATUS_MESSAGES[err.status]!;
    }
    if (err.message) {
      return err.message;
    }
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}
