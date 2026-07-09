interface AppEnv {
  googleOAuthClientId: string;
  taskchuteSpreadsheetId: string;
  taskchuteCalendarId: string;
  /** Unset until the user opts into meeting-calendar sync (see syncMeetingsToSheet.ts). */
  meetingCalendarId: string | null;
}

function read(key: keyof ImportMetaEnv): string {
  const value = import.meta.env[key];
  if (typeof value !== 'string' || value.length === 0) {
    if (import.meta.env.DEV) {
      console.warn(`[env] ${key} is not configured`);
      return '';
    }
    throw new Error(`[env] ${key} is required`);
  }
  return value;
}

function readOptional(key: keyof ImportMetaEnv): string | null {
  const value = import.meta.env[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export const env: AppEnv = {
  googleOAuthClientId: read('VITE_GOOGLE_OAUTH_CLIENT_ID'),
  taskchuteSpreadsheetId: read('VITE_TASKCHUTE_SPREADSHEET_ID'),
  taskchuteCalendarId: read('VITE_TASKCHUTE_CALENDAR_ID'),
  meetingCalendarId: readOptional('VITE_MEETING_CALENDAR_ID'),
};
