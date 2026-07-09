/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_OAUTH_CLIENT_ID: string;
  readonly VITE_TASKCHUTE_SPREADSHEET_ID: string;
  readonly VITE_TASKCHUTE_CALENDAR_ID: string;
  readonly VITE_MEETING_CALENDAR_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
