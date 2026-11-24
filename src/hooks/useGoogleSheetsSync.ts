import { useState, useEffect, useRef, useCallback } from 'react';
import type { User } from 'firebase/auth';
import type { JobRecord } from '../types';
import {
  initAuth,
  googleSignIn,
  logout as authLogout,
  getAccessToken,
  type GoogleAuthUser,
} from '../lib/googleAuth';
import {
  syncJobsToSpreadsheet,
  createGoogleSpreadsheet,
  listUserGoogleSheets,
  getSpreadsheetMetadata,
  type GoogleSheetSummary,
} from '../lib/googleSheets';

const STORAGE_KEY_SHEET = 'job_tracker_connected_sheet';
const STORAGE_KEY_AUTO_SYNC = 'job_tracker_auto_sync';

/** Forgets this browser's linked sheet, e.g. when the tracker account signs out. */
export function clearSheetsConnection(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_SHEET);
    localStorage.removeItem(STORAGE_KEY_AUTO_SYNC);
  } catch {
    // Storage unavailable; nothing was persisted.
  }
}

export interface ConnectedSheet {
  id: string;
  name: string;
  url: string;
  tabTitle?: string;
}

export function useGoogleSheetsSync(jobs: JobRecord[]) {
  const [user, setUser] = useState<User | GoogleAuthUser | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [connectedSheet, setConnectedSheet] = useState<ConnectedSheet | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SHEET);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [autoSync, setAutoSync] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_AUTO_SYNC);
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [availableSheets, setAvailableSheets] = useState<GoogleSheetSummary[]>([]);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);

  // Debounce ref for auto-sync
  const autoSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMountRef = useRef(true);

  // Initialize auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setHasToken(Boolean(token));
      },
      () => {
        // Not authenticated or in-memory token expired
        setHasToken(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Save connected sheet and autoSync preference
  useEffect(() => {
    try {
      if (connectedSheet) {
        localStorage.setItem(STORAGE_KEY_SHEET, JSON.stringify(connectedSheet));
      } else {
        localStorage.removeItem(STORAGE_KEY_SHEET);
      }
    } catch {}
  }, [connectedSheet]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_AUTO_SYNC, JSON.stringify(autoSync));
    } catch {}
  }, [autoSync]);

  const handleLogin = async (): Promise<boolean> => {
    setIsLoggingIn(true);
    setLastError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setHasToken(true);
        return true;
      }
      return false;
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setLastError('Sign-in window was closed before finishing authentication.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setLastError('This site is not an authorized domain for Google sign-in yet. Add it in Google Cloud, then reload.');
      } else {
        setLastError(err.message || 'Google Sign-in failed');
      }
      return false;
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await authLogout();
    setUser(null);
    setHasToken(false);
  };

  const fetchSheetsList = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    setIsLoadingSheets(true);
    try {
      const sheets = await listUserGoogleSheets(token);
      setAvailableSheets(sheets);
    } catch (err: any) {
      console.warn('Failed to list Google Sheets:', err);
    } finally {
      setIsLoadingSheets(false);
    }
  }, []);

  const createAndConnect = async (customTitle?: string): Promise<ConnectedSheet> => {
    let token = await getAccessToken();
    if (!token) {
      const success = await handleLogin();
      if (!success) throw new Error('Sign in required to create Google Sheet');
      token = await getAccessToken();
    }
    if (!token) throw new Error('Authentication token unavailable');

    setSyncStatus('syncing');
    setLastError(null);
    try {
      const title = customTitle?.trim() || 'Job Applications Tracker';
      const meta = await createGoogleSpreadsheet(title, token);
      const newSheet: ConnectedSheet = {
        id: meta.spreadsheetId,
        name: meta.title,
        url: `https://docs.google.com/spreadsheets/d/${meta.spreadsheetId}/edit`,
        tabTitle: meta.tabTitle,
      };

      // Perform initial sync of current jobs
      await syncJobsToSpreadsheet(newSheet.id, jobs, token, newSheet.tabTitle);

      setConnectedSheet(newSheet);
      setSyncStatus('synced');
      setLastSyncedAt(new Date());
      return newSheet;
    } catch (err: any) {
      setSyncStatus('error');
      setLastError(err.message || 'Failed to create spreadsheet');
      throw err;
    }
  };

  const connectExisting = async (sheetId: string, sheetName?: string): Promise<ConnectedSheet> => {
    let token = await getAccessToken();
    if (!token) {
      const success = await handleLogin();
      if (!success) throw new Error('Sign in required to connect Google Sheet');
      token = await getAccessToken();
    }
    if (!token) throw new Error('Authentication token unavailable');

    setSyncStatus('syncing');
    setLastError(null);
    try {
      const meta = await getSpreadsheetMetadata(sheetId, token);
      const sheet: ConnectedSheet = {
        id: meta.spreadsheetId,
        name: sheetName || meta.title,
        url: `https://docs.google.com/spreadsheets/d/${meta.spreadsheetId}/edit`,
        tabTitle: meta.tabTitle,
      };

      // Sync jobs to the connected sheet
      await syncJobsToSpreadsheet(sheet.id, jobs, token, sheet.tabTitle);

      setConnectedSheet(sheet);
      setSyncStatus('synced');
      setLastSyncedAt(new Date());
      return sheet;
    } catch (err: any) {
      setSyncStatus('error');
      setLastError(err.message || 'Failed to connect spreadsheet');
      throw err;
    }
  };

  const syncNow = useCallback(
    async (jobsToSync: JobRecord[] = jobs): Promise<boolean> => {
      if (!connectedSheet) return false;
      let token = await getAccessToken();
      if (!token) {
        setSyncStatus('error');
        setLastError('Google authorization required. Please sign in.');
        return false;
      }

      setSyncStatus('syncing');
      setLastError(null);
      try {
        await syncJobsToSpreadsheet(
          connectedSheet.id,
          jobsToSync,
          token,
          connectedSheet.tabTitle
        );
        setSyncStatus('synced');
        setLastSyncedAt(new Date());
        return true;
      } catch (err: any) {
        setSyncStatus('error');
        setLastError(err.message || 'Synchronization failed');
        return false;
      }
    },
    [connectedSheet, jobs]
  );

  const disconnectSheet = () => {
    setConnectedSheet(null);
    setSyncStatus('idle');
    setLastError(null);
  };

  // Auto-sync effect: triggers whenever `jobs` changes when autoSync is enabled and sheet is connected
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    if (!connectedSheet || !autoSync || !hasToken) {
      return;
    }

    if (autoSyncTimeoutRef.current) {
      clearTimeout(autoSyncTimeoutRef.current);
    }

    autoSyncTimeoutRef.current = setTimeout(() => {
      syncNow(jobs);
    }, 1500);

    return () => {
      if (autoSyncTimeoutRef.current) {
        clearTimeout(autoSyncTimeoutRef.current);
      }
    };
  }, [jobs, connectedSheet, autoSync, hasToken, syncNow]);

  return {
    user,
    hasToken,
    isLoggingIn,
    connectedSheet,
    autoSync,
    setAutoSync,
    syncStatus,
    lastSyncedAt,
    lastError,
    availableSheets,
    isLoadingSheets,
    handleLogin,
    handleLogout,
    fetchSheetsList,
    createAndConnect,
    connectExisting,
    syncNow,
    disconnectSheet,
  };
}
