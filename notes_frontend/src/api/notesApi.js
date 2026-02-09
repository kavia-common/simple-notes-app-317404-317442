const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Build the base URL for REST requests.
 *
 * Priority:
 *  1) REACT_APP_API_BASE (explicit base for API)
 *  2) REACT_APP_BACKEND_URL (backend origin; we'll append /api)
 *  3) empty string (same-origin)
 */
function getApiBaseUrl() {
  const apiBase = process.env.REACT_APP_API_BASE?.trim();
  if (apiBase) return apiBase.replace(/\/+$/, "");

  const backendUrl = process.env.REACT_APP_BACKEND_URL?.trim();
  if (backendUrl) return `${backendUrl.replace(/\/+$/, "")}/api`;

  return "";
}

/**
 * Basic JSON fetch wrapper with timeout and helpful error messages.
 */
async function jsonRequest(path, options = {}) {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");

    if (!res.ok) {
      let details = "";
      try {
        details = isJson ? JSON.stringify(await res.json()) : await res.text();
      } catch (e) {
        details = "";
      }
      const msg = `Request failed (${res.status} ${res.statusText}) for ${options.method || "GET"} ${url}${details ? `: ${details}` : ""}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }

    // 204 no content
    if (res.status === 204) return null;
    return isJson ? await res.json() : await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * In-memory fallback store (used when backend is unreachable).
 * Kept module-local so it survives within a single SPA session.
 */
let memNotes = [
  {
    id: "welcome",
    title: "Welcome",
    content:
      "This is a lightweight notes app.\n\nCreate, edit, and delete notes.\nIf the backend is unavailable, the app will temporarily store notes in-memory.",
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
];

function memSort(notes) {
  // newest first by updatedAt
  return [...notes].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function nowIso() {
  return new Date().toISOString();
}

async function withFallback(requestFn, fallbackFn) {
  try {
    return await requestFn();
  } catch (e) {
    // If backend errors/network issues occur, fall back to local memory.
    // This ensures the UI remains functional even without a running backend.
    return await fallbackFn(e);
  }
}

// PUBLIC_INTERFACE
export async function listNotes() {
  /** List notes.
   * Expected backend: GET /notes -> { items: Note[] } OR Note[]
   */
  return withFallback(
    async () => {
      const data = await jsonRequest("/notes", { method: "GET" });
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.items)) return data.items;
      return [];
    },
    async () => memSort(memNotes)
  );
}

// PUBLIC_INTERFACE
export async function createNote(payload) {
  /** Create note.
   * Expected backend: POST /notes body {title, content} -> Note
   */
  return withFallback(
    async () => jsonRequest("/notes", { method: "POST", body: JSON.stringify(payload) }),
    async () => {
      const note = {
        id: `mem_${Math.random().toString(16).slice(2)}`,
        title: payload.title || "",
        content: payload.content || "",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      memNotes = memSort([note, ...memNotes]);
      return note;
    }
  );
}

// PUBLIC_INTERFACE
export async function updateNote(id, payload) {
  /** Update note.
   * Expected backend: PUT /notes/:id body {title, content} -> Note
   */
  return withFallback(
    async () => jsonRequest(`/notes/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) }),
    async () => {
      memNotes = memNotes.map((n) =>
        n.id === id
          ? { ...n, title: payload.title ?? n.title, content: payload.content ?? n.content, updatedAt: nowIso() }
          : n
      );
      return memNotes.find((n) => n.id === id) || null;
    }
  );
}

// PUBLIC_INTERFACE
export async function deleteNote(id) {
  /** Delete note.
   * Expected backend: DELETE /notes/:id -> 204
   */
  return withFallback(
    async () => {
      await jsonRequest(`/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
      return true;
    },
    async () => {
      memNotes = memNotes.filter((n) => n.id !== id);
      return true;
    }
  );
}

export const __private__ = {
  getApiBaseUrl,
};
