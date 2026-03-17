export type ParsedSheetUrl = {
  sheetId: string;
  gid?: string;
};

export type SheetTable = {
  key: string;
  name: string;
  gid: string;
  rows: Record<string, unknown>[];
  columns: string[];
};

function safeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function parseGoogleSheetsUrl(url: string): ParsedSheetUrl | null {
  const match = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return null;

  const gidMatch = url.match(/[?#&]gid=([0-9]+)/);

  return {
    sheetId: match[1],
    gid: gidMatch?.[1],
  };
}

function parseGvizJson(raw: string): unknown {
  const prefix = "google.visualization.Query.setResponse(";
  const start = raw.indexOf(prefix);
  if (start === -1) {
    throw new Error("Invalid Google Visualization response");
  }

  const jsonStart = start + prefix.length;
  const jsonEnd = raw.lastIndexOf(");");
  if (jsonEnd === -1) {
    throw new Error("Malformed Google Visualization payload");
  }

  const jsonText = raw.slice(jsonStart, jsonEnd);
  return JSON.parse(jsonText);
}

async function fetchTableRows(
  sheetId: string,
  gid: string,
): Promise<{ rows: Record<string, unknown>[]; columns: string[] }> {
  const url =
    `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?gid=${gid}&headers=1&tqx=out:json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to read worksheet data. Ensure the sheet is public.");
  }

  const raw = await response.text();
  const payload = parseGvizJson(raw) as {
    table?: {
      cols?: { label?: string; id?: string }[];
      rows?: { c?: { v?: unknown }[] }[];
    };
  };

  const cols = payload.table?.cols || [];
  const rows = payload.table?.rows || [];

  const columns = cols.map((col, index) => {
    const label = (col.label || "").trim();
    const fallback = (col.id || `column_${index + 1}`).trim();
    return label || fallback;
  });

  const mappedRows: Record<string, unknown>[] = rows
    .map((row) => {
      const cells = row.c || [];
      const mapped: Record<string, unknown> = {};

      for (let i = 0; i < columns.length; i += 1) {
        mapped[columns[i]] = cells[i]?.v ?? null;
      }

      return mapped;
    })
    .filter((row) => Object.values(row).some((value) => value !== null && value !== ""));

  return { rows: mappedRows, columns };
}

async function fetchWorksheetList(
  sheetId: string,
): Promise<{ gid: string; name: string }[]> {
  const url =
    `https://spreadsheets.google.com/feeds/worksheets/${sheetId}/public/basic?alt=json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      "Unable to read worksheet list. Publish the sheet to web and set visibility to public.",
    );
  }

  const data = (await response.json()) as {
    feed?: {
      entry?: Array<{
        title?: { $t?: string };
        link?: Array<{ rel?: string; href?: string }>;
      }>;
    };
  };

  const entries = data.feed?.entry || [];

  return entries
    .map((entry) => {
      const title = entry.title?.$t || "Sheet";
      const editLink = entry.link?.find((link) => link.rel?.includes("alternate"));
      const gidMatch = editLink?.href?.match(/[?#&]gid=([0-9]+)/);
      const gid = gidMatch?.[1];

      if (!gid) return null;

      return {
        gid,
        name: title,
      };
    })
    .filter((entry): entry is { gid: string; name: string } => Boolean(entry));
}

export async function fetchGoogleSheetsTables(sheetUrl: string): Promise<SheetTable[]> {
  const parsed = parseGoogleSheetsUrl(sheetUrl);
  if (!parsed) {
    throw new Error("Invalid Google Sheets URL format");
  }

  const worksheetList = await fetchWorksheetList(parsed.sheetId);
  if (worksheetList.length === 0) {
    throw new Error("No worksheets found in the provided Google Sheet");
  }

  const selectedWorksheets = parsed.gid
    ? worksheetList.filter((sheet) => sheet.gid === parsed.gid)
    : worksheetList;

  if (selectedWorksheets.length === 0) {
    throw new Error("The selected tab (gid) was not found in this sheet");
  }

  const tables = await Promise.all(
    selectedWorksheets.map(async (sheet) => {
      const table = await fetchTableRows(parsed.sheetId, sheet.gid);
      const defaultKey = safeKey(sheet.name) || `table_${sheet.gid}`;

      return {
        key: defaultKey,
        name: sheet.name,
        gid: sheet.gid,
        rows: table.rows,
        columns: table.columns,
      } satisfies SheetTable;
    }),
  );

  return tables.filter((table) => table.rows.length > 0);
}
