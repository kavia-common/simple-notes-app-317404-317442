import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { createNote, deleteNote, listNotes, updateNote } from "./api/notesApi";

function normalizeNote(raw) {
  if (!raw) return null;
  return {
    id: String(raw.id),
    title: raw.title ?? "",
    content: raw.content ?? "",
    createdAt: raw.createdAt ?? raw.created_at ?? null,
    updatedAt: raw.updatedAt ?? raw.updated_at ?? null,
  };
}

function notePreview(content) {
  const text = String(content || "").trim().replace(/\s+/g, " ");
  if (!text) return "No content";
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

function safeDateLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const m = window.matchMedia(query);
    const handler = () => setMatches(m.matches);
    handler();
    if (m.addEventListener) m.addEventListener("change", handler);
    else m.addListener(handler);
    return () => {
      if (m.removeEventListener) m.removeEventListener("change", handler);
      else m.removeListener(handler);
    };
  }, [query]);

  return matches;
}

// PUBLIC_INTERFACE
function App() {
  /** Notes app root component: loads notes and drives the CRUD flows. */
  const isMobile = useMediaQuery("(max-width: 880px)");

  const [theme, setTheme] = useState("light");
  const [notes, setNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [showEditorOnMobile, setShowEditorOnMobile] = useState(false);

  const titleInputRef = useRef(null);

  const selected = useMemo(() => {
    const found = notes.find((n) => n.id === selectedId);
    return found ? normalizeNote(found) : null;
  }, [notes, selectedId]);

  // Apply theme at document level for CSS variables
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Load notes on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErrorMsg("");
      try {
        const items = (await listNotes()).map(normalizeNote).filter(Boolean);
        if (cancelled) return;
        setNotes(items);

        // Choose a default selection
        if (items.length > 0) {
          setSelectedId((prev) => prev ?? items[0].id);
        } else {
          setSelectedId(null);
        }
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e?.message || "Failed to load notes.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync editor draft when selection changes (unless current draft is dirty)
  useEffect(() => {
    if (!selected) {
      setDraftTitle("");
      setDraftContent("");
      setIsDirty(false);
      return;
    }
    // If the user has unsaved edits, keep them; avoid clobber.
    // (In this app we keep it simple: selection change is user-driven, so we reset draft on selection change.)
    setDraftTitle(selected.title);
    setDraftContent(selected.content);
    setIsDirty(false);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus title input when opening editor on mobile or selecting a note
  useEffect(() => {
    if (showEditorOnMobile || !isMobile) {
      // Delay to allow panel to render
      window.setTimeout(() => {
        titleInputRef.current?.focus();
      }, 0);
    }
  }, [showEditorOnMobile, isMobile, selectedId]);

  function setError(e) {
    setErrorMsg(e?.message || "Something went wrong.");
  }

  // PUBLIC_INTERFACE
  const toggleTheme = () => {
    /** Toggle between light and dark theme. */
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  async function handleNewNote() {
    setErrorMsg("");
    setSaving(true);
    try {
      const created = normalizeNote(
        await createNote({
          title: "Untitled",
          content: "",
        })
      );

      // Insert top, select it
      setNotes((prev) => [created, ...prev.filter((n) => String(n.id) !== String(created.id))]);
      setSelectedId(created.id);
      if (isMobile) setShowEditorOnMobile(true);
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!selected) return;
    setErrorMsg("");
    setSaving(true);
    try {
      const updated = normalizeNote(
        await updateNote(selected.id, {
          title: draftTitle,
          content: draftContent,
        })
      );

      setNotes((prev) => {
        const next = prev.map((n) => (String(n.id) === String(selected.id) ? updated : n));
        // Keep newest updated at top
        next.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
        return next;
      });
      setIsDirty(false);
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    const ok = window.confirm(`Delete "${selected.title || "Untitled"}"? This cannot be undone.`);
    if (!ok) return;

    setErrorMsg("");
    setDeleting(true);
    try {
      await deleteNote(selected.id);
      setNotes((prev) => prev.filter((n) => String(n.id) !== String(selected.id)));

      // Select another note if available
      setSelectedId((prevSelectedId) => {
        if (String(prevSelectedId) !== String(selected.id)) return prevSelectedId;
        const remaining = notes.filter((n) => String(n.id) !== String(selected.id));
        return remaining[0]?.id ?? null;
      });

      if (isMobile) setShowEditorOnMobile(false);
    } catch (e) {
      setError(e);
    } finally {
      setDeleting(false);
    }
  }

  function handleSelect(id) {
    // On mobile, selecting a note opens editor view
    setSelectedId(id);
    if (isMobile) setShowEditorOnMobile(true);
  }

  const headerMeta = useMemo(() => {
    const base = process.env.REACT_APP_API_BASE || process.env.REACT_APP_BACKEND_URL || "";
    const env = process.env.REACT_APP_NODE_ENV || process.env.NODE_ENV || "development";
    return { base, env };
  }, []);

  const canSave = Boolean(selected) && isDirty && !saving && !loading;

  return (
    <div className="App">
      <header className="appHeader">
        <div className="headerLeft">
          <div className="brand">
            <div className="brandMark" aria-hidden="true">
              N
            </div>
            <div className="brandText">
              <h1 className="appTitle">Notes</h1>
              <p className="appSubtitle">Simple, fast, and focused.</p>
            </div>
          </div>
        </div>

        <div className="headerRight">
          <div className="headerMeta" aria-label="Environment info">
            <span className="pill">Env: {headerMeta.env}</span>
            {headerMeta.base ? <span className="pill">API: {headerMeta.base}</span> : <span className="pill">API: same-origin</span>}
          </div>

          <button className="btn btnSecondary" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
            {theme === "light" ? "Dark" : "Light"}
          </button>
        </div>
      </header>

      <main className="appMain">
        <section className={`pane paneList ${isMobile && showEditorOnMobile ? "hiddenOnMobile" : ""}`} aria-label="Notes list">
          <div className="paneHeader">
            <h2 className="paneTitle">Your notes</h2>
            <button className="btn" onClick={handleNewNote} disabled={saving || loading} aria-label="Create new note">
              New
            </button>
          </div>

          {errorMsg ? (
            <div className="callout calloutError" role="alert">
              {errorMsg}
            </div>
          ) : null}

          {loading ? (
            <div className="emptyState" aria-label="Loading">
              <div className="spinner" aria-hidden="true" />
              <p className="muted">Loading notes…</p>
            </div>
          ) : notes.length === 0 ? (
            <div className="emptyState">
              <p className="emptyTitle">No notes yet</p>
              <p className="muted">Create your first note to get started.</p>
              <button className="btn btnLarge" onClick={handleNewNote} disabled={saving} aria-label="Create your first note">
                Create a note
              </button>
            </div>
          ) : (
            <ul className="noteList" role="list">
              {notes.map((n) => {
                const nn = normalizeNote(n);
                const active = nn.id === selectedId;
                return (
                  <li key={nn.id}>
                    <button
                      className={`noteRow ${active ? "active" : ""}`}
                      onClick={() => handleSelect(nn.id)}
                      aria-current={active ? "true" : "false"}
                    >
                      <div className="noteRowTop">
                        <span className="noteTitle">{nn.title || "Untitled"}</span>
                        <span className="noteDate">{safeDateLabel(nn.updatedAt || nn.createdAt)}</span>
                      </div>
                      <div className="notePreview">{notePreview(nn.content)}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={`pane paneEditor ${isMobile && !showEditorOnMobile ? "hiddenOnMobile" : ""}`} aria-label="Note editor">
          <div className="paneHeader">
            {isMobile ? (
              <button
                className="btn btnSecondary"
                onClick={() => setShowEditorOnMobile(false)}
                aria-label="Back to list"
              >
                Back
              </button>
            ) : (
              <div />
            )}

            <div className="editorActions">
              <button className="btn btnSecondary" onClick={handleDelete} disabled={!selected || deleting || loading} aria-label="Delete note">
                {deleting ? "Deleting…" : "Delete"}
              </button>
              <button className="btn" onClick={handleSave} disabled={!canSave} aria-label="Save note">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>

          {!selected ? (
            <div className="emptyState">
              <p className="emptyTitle">Select a note</p>
              <p className="muted">Choose a note on the left to view and edit it.</p>
              {isMobile ? (
                <button className="btn btnLarge" onClick={() => setShowEditorOnMobile(false)}>
                  Go to list
                </button>
              ) : null}
            </div>
          ) : (
            <div className="editorBody">
              <label className="field">
                <span className="fieldLabel">Title</span>
                <input
                  ref={titleInputRef}
                  className="input"
                  value={draftTitle}
                  onChange={(e) => {
                    setDraftTitle(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="Note title"
                />
              </label>

              <label className="field">
                <span className="fieldLabel">Content</span>
                <textarea
                  className="textarea"
                  value={draftContent}
                  onChange={(e) => {
                    setDraftContent(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="Write something…"
                  rows={12}
                />
              </label>

              <div className="editorFooter">
                <span className="muted">
                  {isDirty ? "Unsaved changes" : "All changes saved"}
                  {selected.updatedAt || selected.createdAt ? (
                    <>
                      {" "}
                      · Last updated: {safeDateLabel(selected.updatedAt || selected.createdAt)}
                    </>
                  ) : null}
                </span>
              </div>
            </div>
          )}
        </section>

        {isMobile ? (
          <button className="fab" onClick={handleNewNote} aria-label="New note">
            +
          </button>
        ) : null}
      </main>
    </div>
  );
}

export default App;
