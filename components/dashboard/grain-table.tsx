"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtKt, fmtPct } from "@/lib/utils/format";

interface GrainRow {
  grain: string;
  slug: string;
  display_order: number;
  cy_deliveries_kt: number;
  cw_deliveries_kt: number;
  prev_deliveries_kt: number;
  wow_pct_change: number;
}

type SortKey = "grain" | "cy_deliveries_kt" | "cw_deliveries_kt" | "wow_pct_change";

export function GrainTable({ data }: { data: GrainRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("cy_deliveries_kt");
  const [sortAsc, setSortAsc] = useState(false);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    if (typeof av === "string" && typeof bv === "string") {
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return sortAsc ? Number(av) - Number(bv) : Number(bv) - Number(av);
  });

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortAsc ? " \u25B2" : " \u25BC") : "";

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              className="cursor-pointer select-none"
              onClick={() => handleSort("grain")}
            >
              Grain{arrow("grain")}
            </TableHead>
            <TableHead
              className="text-right cursor-pointer select-none"
              onClick={() => handleSort("cy_deliveries_kt")}
            >
              CY Deliveries{arrow("cy_deliveries_kt")}
            </TableHead>
            <TableHead
              className="text-right cursor-pointer select-none"
              onClick={() => handleSort("cw_deliveries_kt")}
            >
              This Week{arrow("cw_deliveries_kt")}
            </TableHead>
            <TableHead
              className="text-right cursor-pointer select-none"
              onClick={() => handleSort("wow_pct_change")}
            >
              WoW{arrow("wow_pct_change")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                No grain data available yet. Run the backfill script to load CGC data.
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((row) => (
              <TableRow
                key={row.slug}
                className="cursor-pointer hover:bg-accent/50"
              >
                <TableCell>
                  <Link
                    href={`/grain/${row.slug}`}
                    className="font-medium hover:text-canola transition-colors"
                  >
                    {row.grain}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtKt(row.cy_deliveries_kt, 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtKt(row.cw_deliveries_kt)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${
                    row.wow_pct_change >= 0 ? "text-prairie" : "text-error"
                  }`}
                >
                  {fmtPct(row.wow_pct_change)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
