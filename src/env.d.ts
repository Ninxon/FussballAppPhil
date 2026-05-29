declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly EXPO_PUBLIC_SUPABASE_URL: string;
      readonly EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
      readonly EXPO_PUBLIC_SITE_URL?: string;
    }
  }
}

export {};
