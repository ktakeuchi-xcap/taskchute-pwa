interface AppEnv {
  googleOAuthClientId: string;
  taskchuteSpreadsheetId: string;
  taskchuteCalendarId: string;
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

export const env: AppEnv = {
  googleOAuthClientId: read('VITE_GOOGLE_OAUTH_CLIENT_ID'),
  taskchuteSpreadsheetId: read('VITE_TASKCHUTE_SPREADSHEET_ID'),
  taskchuteCalendarId: read('VITE_TASKCHUTE_CALENDAR_ID'),
};
