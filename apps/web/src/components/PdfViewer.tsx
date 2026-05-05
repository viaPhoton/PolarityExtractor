import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PageImage } from "@polarity/shared";

interface Props {
  pages: PageImage[];
}

/**
 * Lightweight PDF viewer that consumes server-side-rendered PNG data
 * URLs. Avoids react-pdf's runtime PDF.js loader (bundling pdf.worker
 * is annoying) and gives us the same visual output since we already
 * rendered every page on the API.
 */
export function PdfViewer({ pages }: Props) {
  const [page, setPage] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPage(0);
  }, [pages.length]);

  const current = pages[page];

  return (
    <div className="flex h-full flex-col bg-slate-100">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 text-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-slate-700">
            Page {pages.length === 0 ? 0 : page + 1} of {pages.length}
          </span>
          <button
            type="button"
            disabled={page >= pages.length - 1}
            onClick={() =>
              setPage((p) => Math.min(pages.length - 1, p + 1))
            }
            className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto p-4">
        {current ? (
          <img
            src={current.dataUrl}
            alt={`Drawing page ${page + 1}`}
            className="mx-auto h-auto w-full max-w-4xl rounded border border-slate-200 bg-white shadow-sm"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No pages rendered yet.
          </div>
        )}
      </div>
    </div>
  );
}
