export type AppSection =
  | "inicio"
  | "comunidade"
  | "explorar"
  | "conversas"
  | "perfil";

export type PersonPreview = {
  name: string;
  initials: string;
  detail: string;
  affinity: string;
  tone: string;
};

export type CommunityPreview = {
  name: string;
  members: string;
  topic: string;
  accent: string;
};
