import PublicGoogleSheetsParser from "public-google-sheets-parser";

export type SheetTable = {
  key: string;
  name: string;
  source: string;
  rows: Record<string, unknown>[];
  columns: string[];
  backendKey: string;
};

export type SheetLoadConfig = {
  tableName: string;
  sourceTab?: string;
  backendKey: string;
};

function safeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function extractSpreadsheetId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const urlMatch = raw.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  if (/^[a-zA-Z0-9-_]{20,}$/.test(raw)) {
    return raw;
  }

  return null;
}

function getColumns(rows: Record<string, unknown>[]): string[] {
  const unique = new Set<string>();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      unique.add(key);
    }
  }

  return [...unique];
}

function getParserOption(sourceTab?: string):
  | { sheetId: string; useFormat: true }
  | { sheetName: string; useFormat: true }
  | undefined {
  const tab = (sourceTab || "").trim();
  if (!tab) return undefined;

  if (/^[0-9]+$/.test(tab)) {
    return { sheetId: tab, useFormat: true };
  }

  return { sheetName: tab, useFormat: true };
}

export async function fetchGoogleSheetsTables(
  sheetInput: string,
  configs: SheetLoadConfig[],
): Promise<SheetTable[]> {
  const spreadsheetId = extractSpreadsheetId(sheetInput);
  if (!spreadsheetId) {
    throw new Error("Provide a valid Google Sheet URL or spreadsheet ID");
  }

  if (!configs.length) {
    throw new Error("Add at least one table configuration to load data");
  }

  const parser = new PublicGoogleSheetsParser(spreadsheetId);

  const tables = await Promise.all(
    configs.map(async (config, index) => {
      const option = getParserOption(config.sourceTab);
      const rowsRaw = (await parser.parse(
        spreadsheetId,
        option,
      )) as Record<string, unknown>[];

      const rows = rowsRaw.filter((row) => Object.keys(row).length > 0);
      const columns = getColumns(rows);

      const name = config.tableName.trim() || `Table ${index + 1}`;
      const backendKey = safeKey(config.backendKey) || `table_${index + 1}`;

      return {
        key: safeKey(`${backendKey}_${name}`) || `table_${index + 1}`,
        name,
        source: config.sourceTab?.trim() || "default",
        rows,
        columns,
        backendKey,
      } satisfies SheetTable;
    }),
  );

  return tables.filter((table) => table.rows.length > 0);
}
