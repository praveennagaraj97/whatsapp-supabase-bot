export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  tokenType: string;
  expiresAt: string;
  admin: {
    id: string;
    email: string;
    fullName: string;
  };
};

export type Project = {
  id: string;
  name: string;
  slug: string;
  bot_name: string;
  description: string | null;
  system_prompt: string;
  is_enabled: boolean;
  created_at?: string;
};

export type ProjectsResponse = {
  projects: Project[];
};

export type ProjectImportPayload = {
  data: Record<string, Record<string, unknown>[]>;
  replaceExisting?: boolean;
};

export type ProjectImportResponse = {
  projectId: string;
  imported: {
    clinics: number;
    doctors: number;
    medicines: number;
    faqs: number;
  };
  replaceExisting: boolean;
};
