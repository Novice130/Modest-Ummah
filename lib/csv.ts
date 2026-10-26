/**
 * Minimal RFC 4180 CSV parser/serializer. No dependency — the builder's CSV
 * import/export needs quoting (commas in addresses, tags, descriptions) and
 * this is the only place that does it. Used by both the template download
 * and the dry-run import.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    if (row.some((f) => f !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n') {
      pushRow();
    } else if (ch === '\r') {
      // Skip; \n follows.
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) pushRow();

  return rows;
}

/**
 * Serialize rows as RFC 4180 CSV.
 *
 * `escapeFormulas` neutralises spreadsheet formula injection (a customer
 * named `=HYPERLINK(...)` executing in Excel) by prefixing cells that start
 * with = + - @ or a tab/CR with an apostrophe. Off by default because the
 * product CSV round-trips through parseCsv and the prefix would corrupt it;
 * turn it on for exports meant to be opened in a spreadsheet.
 */
export function stringifyCsv(
  rows: Array<Array<string | number | boolean | null | undefined>>,
  options: { escapeFormulas?: boolean; lineEnding?: '\n' | '\r\n' } = {}
): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          let value = cell == null ? '' : String(cell);
          if (options.escapeFormulas && typeof cell === 'string' && /^[=+\-@\t\r]/.test(value)) {
            value = `'${value}`;
          }
          if (/[",\n\r]/.test(value)) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(',')
    )
    .join(options.lineEnding || '\n');
}

export function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split('|')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function joinList(values: string[] | null | undefined): string {
  return (values || []).join('|');
}
