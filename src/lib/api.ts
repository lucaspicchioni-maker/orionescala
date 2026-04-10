const API_BASE = ''

function getToken(): string | null {
  return localStorage.getItem('orion_token')
}

export function setToken(token: string) {
  localStorage.setItem('orion_token', token)
}

export function clearToken() {
  localStorage.removeItem('orion_token')
}

export function hasToken(): boolean {
  return !!getToken()
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    clearToken()
    // Limpa currentUser — sem isso o loop é infinito (home page chama API → 401 → / → home page → ...)
    localStorage.removeItem('orion_current_user')
    window.location.reload()
    throw new Error('Sessao expirada')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }))
    const apiErr = new Error(err.error || `HTTP ${res.status}`) as Error & {
      status?: number
      body?: any
    }
    apiErr.status = res.status
    apiErr.body = err
    throw apiErr
  }

  return res.json()
}

// Type helper para acessar body.blockers/warnings quando vier de 422
export interface ApiError extends Error {
  status?: number
  body?: {
    error?: string
    code?: string
    blockers?: Array<{ rule: string; severity: string; employeeId: string; date: string; message: string }>
    warnings?: Array<{ rule: string; severity: string; employeeId: string; date: string; message: string }>
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}
