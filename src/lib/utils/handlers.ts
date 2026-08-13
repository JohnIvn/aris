export type SuccessResponse<T = unknown> = {
  status: 'success';
  ok: true;
  message: string;
  code: number | null;
  data: T | null;
};
export type ErrorResponse<T = unknown> = {
  status: 'failure';
  ok: false;
  error: string | string[];
  code: number | null;
  data: T | null;
};

export function ErrorHandler<T>(
  error: string | string[],
  code?: number,
  data?: T,
): ErrorResponse {
  const safeData = data || null;

  return {
    status: 'failure',
    ok: false,
    code: code || null,
    error: error,
    data: safeData,
  };
}

export function SuccessHandler<T>(
  message: string,
  code?: number,
  data?: T,
): SuccessResponse {
  const safeData = data || null;

  return {
    status: 'success',
    ok: true,
    code: code || null,
    message: message,
    data: safeData,
  };
}
