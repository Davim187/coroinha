export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export function notFound(message = 'Registro não encontrado.') {
  return new ApiError(404, 'NOT_FOUND', message)
}
