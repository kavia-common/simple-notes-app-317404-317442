import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

// Mock API module so tests are stable and not network-dependent.
jest.mock("./api/notesApi", () => {
  const notes = [
    { id: "1", title: "First", content: "Hello", createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z" },
  ];

  return {
    listNotes: jest.fn(async () => notes),
    createNote: jest.fn(async ({ title, content }) => ({
      id: "2",
      title,
      content,
      createdAt: "2024-01-02T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
    })),
    updateNote: jest.fn(async (id, payload) => ({
      id,
      title: payload.title,
      content: payload.content,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-03T00:00:00.000Z",
    })),
    deleteNote: jest.fn(async () => true),
  };
});

test("renders Notes header", async () => {
  render(<App />);
  expect(screen.getByText("Notes")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("First")).toBeInTheDocument());
});

test("creates a new note when clicking New", async () => {
  render(<App />);

  // Wait initial note list
  await waitFor(() => expect(screen.getByText("First")).toBeInTheDocument());

  // Create a new note
  fireEvent.click(screen.getByRole("button", { name: /create new note/i }));

  // New note should appear in list (title 'Untitled' by app convention)
  await waitFor(() => expect(screen.getByText("Untitled")).toBeInTheDocument());

  // Editor shows Title field
  expect(screen.getByText("Title")).toBeInTheDocument();
});
