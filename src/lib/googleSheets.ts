import type { JobRecord } from '../types';
import { getCompactTimeline } from './formatHelpers';

export interface GoogleSheetSummary {
  id: string;
  name: string;
  url: string;
  modifiedTime?: string;
}

export interface SheetMetadata {
  spreadsheetId: string;
  title: string;
  tabTitle: string;
  sheetId: number;
}

const HEADERS = [
  'Company',
  'Job Title',
  'Team',
  'Status',
  'Date Applied',
  'Salary',
  'Location',
  'Industry',
  'Job URL',
  'Required Skills',
  'Status Duration',
  'Notes',
  'Last Updated',
];

/**
 * Fetch list of Google Sheets accessible by the user in Google Drive.
 */
export async function listUserGoogleSheets(accessToken: string): Promise<GoogleSheetSummary[]> {
  const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,webViewLink)&orderBy=modifiedTime desc&pageSize=20`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to list Google Sheets (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    url: f.webViewLink || `https://docs.google.com/spreadsheets/d/${f.id}/edit`,
    modifiedTime: f.modifiedTime,
  }));
}

/**
 * Inspect spreadsheet to get the actual tab name (avoids hardcoding 'Sheet1').
 */
export async function getSpreadsheetMetadata(
  spreadsheetId: string,
  accessToken: string
): Promise<SheetMetadata> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties(sheetId,title,index)`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to fetch spreadsheet metadata (HTTP ${res.status})`);
  }

  const data = await res.json();
  const sheets = data.sheets || [];
  const firstSheet = sheets[0]?.properties;

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || 'Job Applications Tracker',
    tabTitle: firstSheet?.title || 'Sheet1',
    sheetId: firstSheet?.sheetId ?? 0,
  };
}

/**
 * Create a new Google Spreadsheet with structured headers and frozen top row.
 */
export async function createGoogleSpreadsheet(
  title: string,
  accessToken: string
): Promise<SheetMetadata> {
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: title.trim() || 'Job Applications Tracker',
      },
      sheets: [
        {
          properties: {
            title: 'Applications',
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to create spreadsheet (${res.status})`);
  }

  const data = await res.json();
  const firstSheet = data.sheets?.[0]?.properties;

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || title,
    tabTitle: firstSheet?.title || 'Applications',
    sheetId: firstSheet?.sheetId ?? 0,
  };
}

/**
 * Prefixes values starting with formula trigger characters (=, +, -, @, tab, CR)
 * with a leading apostrophe so Google Sheets USER_ENTERED mode treats them as plain text.
 */
export function sanitizeSheetCell(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

/**
 * Converts JobRecord array into a 2D array of rows for Google Sheets.
 */
export function formatJobsForSheets(jobs: JobRecord[]): (string | number)[][] {
  const rows = jobs.map((job) => {
    const timeline = getCompactTimeline(job);
    const skills = (job.positionMetadata?.requiredSkills || []).join(', ');
    const team = job.team || job.positionMetadata?.team || '';

    return [
      sanitizeSheetCell(job.company || ''),
      sanitizeSheetCell(job.jobTitle || ''),
      sanitizeSheetCell(team),
      sanitizeSheetCell(job.status || ''),
      sanitizeSheetCell(job.dateApplied || ''),
      sanitizeSheetCell(job.salary || 'Not listed'),
      sanitizeSheetCell(job.location || ''),
      sanitizeSheetCell(job.industry || ''),
      sanitizeSheetCell(job.url || ''),
      sanitizeSheetCell(skills),
      sanitizeSheetCell(timeline.stateDurationText || ''),
      sanitizeSheetCell(job.notes || ''),
      sanitizeSheetCell(job.createdAt ? new Date(job.createdAt).toISOString().split('T')[0] : ''),
    ];
  });

  return [HEADERS, ...rows];
}

/**
 * Synchronize jobs into the designated Google Sheet.
 */
export async function syncJobsToSpreadsheet(
  spreadsheetId: string,
  jobs: JobRecord[],
  accessToken: string,
  tabNameHint?: string
): Promise<{ success: boolean; rowsSynced: number; sheetUrl: string }> {
  // 1. Fetch metadata to get actual tab title & sheetId
  let meta: SheetMetadata;
  try {
    meta = await getSpreadsheetMetadata(spreadsheetId, accessToken);
  } catch (err: any) {
    throw new Error(`Cannot access spreadsheet: ${err.message}`);
  }

  const tabTitle = tabNameHint || meta.tabTitle;
  const values = formatJobsForSheets(jobs);

  // 2. Put values into tab starting at A1
  const updateRange = `${encodeURIComponent(tabTitle)}!A1:M${values.length}`;
  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${updateRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values,
      }),
    }
  );

  if (!updateRes.ok) {
    const err = await updateRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to update spreadsheet cells (${updateRes.status})`);
  }

  // 3. Clear any leftover rows below our current rows (e.g. if jobs were deleted)
  const clearRange = `${encodeURIComponent(tabTitle)}!A${values.length + 1}:M${Math.max(values.length + 100, 500)}`;
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${clearRange}:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  ).catch(() => {});

  // 4. Batch update formatting: style header row & enable text wrapping
  try {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          // Header formatting (bold, dark slate background, white text)
          {
            repeatCell: {
              range: {
                sheetId: meta.sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: HEADERS.length,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.12, green: 0.16, blue: 0.23 }, // #1e293b
                  textFormat: {
                    bold: true,
                    foregroundColor: { red: 1, green: 1, blue: 1 },
                    fontSize: 10,
                  },
                  horizontalAlignment: 'LEFT',
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
            },
          },
          // Freeze header row
          {
            updateSheetProperties: {
              properties: {
                sheetId: meta.sheetId,
                gridProperties: {
                  frozenRowCount: 1,
                },
              },
              fields: 'gridProperties.frozenRowCount',
            },
          },
        ],
      }),
    });
  } catch (fmtErr) {
    // Non-critical formatting error, table values were already updated
    console.warn('Could not apply Google Sheets formatting:', fmtErr);
  }

  return {
    success: true,
    rowsSynced: jobs.length,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}
