export type SheetRow = Record<string, string | number>;

const SHEET_ID =
  process.env.NEXT_PUBLIC_BITSOM_SHEET_ID ||
  "1sNESQWi2MQlIXuJ99zshKkFGw3bIoG7IgbYizqaaRIo";

export function getPlacementsSheetUrl(): string {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;
}

export function parseGvizResponse(text: string): SheetRow[] {
  const jsonText = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const data = JSON.parse(jsonText);
  const cols = data.table.cols.map(
    (col: { label?: string }, idx: number) => col.label || `col_${idx}`
  );
  return data.table.rows
    .map((row: { c?: { v?: string | number }[] } | null): SheetRow | null => {
      if (!row || !row.c) return null;
      const obj: SheetRow = {};
      row.c.forEach((cell: { v?: string | number }, idx: number) => {
        obj[cols[idx]] = cell?.v ?? "";
      });
      return obj;
    })
    .filter((row: SheetRow | null): row is SheetRow => Boolean(row));
}

export function getColumnsFromRows(rows: SheetRow[]): string[] {
  if (!rows.length) return [];
  return Object.keys(rows[0]);
}
