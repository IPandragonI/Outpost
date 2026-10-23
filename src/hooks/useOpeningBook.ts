"use client";

import { useEffect, useState } from "react";
import { OPENING_BOOK_URL, type OpeningBookFile } from "@/features/openings/book-format";
import { OpeningBook } from "@/features/openings/opening-book";
import type { MessageKey } from "@/lib/i18n/translate";

type BookState =
  | { status: "loading"; book: null; error: null }
  | { status: "ready"; book: OpeningBook; error: null }
  | { status: "error"; book: null; error: MessageKey };

let shared: Promise<OpeningBook> | null = null;

/**
 * Loads the opening book (about 140 KB compressed) the first time it is needed. The
 * service worker keeps it, so it is available offline after that first load.
 */
export function loadOpeningBook(): Promise<OpeningBook> {
  shared ??= fetch(OPENING_BOOK_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<OpeningBookFile>;
    })
    .then((data) => new OpeningBook(data))
    .catch((error: unknown) => {
      shared = null;
      throw error;
    });
  return shared;
}

export function useOpeningBook(): BookState {
  const [state, setState] = useState<BookState>({ status: "loading", book: null, error: null });
  useEffect(() => {
    let active = true;
    loadOpeningBook().then(
      (book) => active && setState({ status: "ready", book, error: null }),
      () =>
        active &&
        setState({
          status: "error",
          book: null,
          error: navigator.onLine ? "book.failed" : "book.notDownloaded",
        }),
    );
    return () => {
      active = false;
    };
  }, []);
  return state;
}
