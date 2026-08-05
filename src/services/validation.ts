export type ValidationStatus = "valid" | "invalid" | "quota" | "error";

export interface ValidationResult {
  status: ValidationStatus;
  message?: string;
}

export const isQuotaError = (error: unknown): boolean => {
  if (!isObjectWithStatus(error)) return false;
  return error.status === 429;
};

export const isAuthError = (error: unknown): boolean => {
  if (!isObjectWithStatus(error)) return false;
  return error.status === 401 || error.status === 403;
};

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const isObjectWithStatus = (error: unknown): error is { status: number } => {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  );
};
