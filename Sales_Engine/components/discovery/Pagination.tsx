"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Extra controls rendered after the page buttons. */
  children?: ReactNode;
}

export function Pagination({ page, pageSize, total, onPageChange, children }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-[11px] text-slate-500">
        Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} leads
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-slate-400">
          Page {page} of {pageCount}
        </span>
        <Button
          variant="secondary"
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          disabled={page >= pageCount}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {children}
      </div>
    </div>
  );
}
