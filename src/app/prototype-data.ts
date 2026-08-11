import type { CommunityPreview, PersonPreview } from "./types";

export const people: PersonPreview[] = [
  {
    name: "Ana Clara",
    initials: "AC",
    detail: "São Paulo, SP",
    affinity: "Música · Livros",
    tone: "var(--orha-lilac)",
  },
  {
    name: "Lucas N.",
    initials: "LN",
    detail: "Campinas, SP",
    affinity: "Cinema · Viagens",
    tone: "var(--orha-mint)",
  },
  {
    name: "Marina Reis",
    initials: "MR",
    detail: "Niterói, RJ",
    affinity: "Fotografia · Fé",
    tone: "var(--orha-peach)",
  },
  {
    name: "Davi Melo",
    initials: "DM",
    detail: "Curitiba, PR",
    affinity: "Café · Jogos",
    tone: "var(--orha-sky)",
  },
];

export const communities: CommunityPreview[] = [
  {
    name: "Café, fé e conversa",
    members: "1,2 mil membros",
    topic: "Encontros leves para falar da vida",
    accent: "#ee7257",
  },
  {
    name: "Cristãos que amam cinema",
    members: "846 membros",
    topic: "Filmes, séries e boas histórias",
    accent: "#6056d8",
  },
  {
    name: "Música que aproxima",
    members: "2,4 mil membros",
    topic: "Descobertas, playlists e artistas",
    accent: "#2e8b75",
  },
];

export const conversations = [
  {
    name: "Ana Clara",
    initials: "AC",
    message: "Também gostei muito dessa comunidade!",
    time: "18:42",
    unread: 2,
    tone: "var(--orha-lilac)",
  },
  {
    name: "Lucas N.",
    initials: "LN",
    message: "Você já viu o filme que comentei?",
    time: "16:08",
    unread: 0,
    tone: "var(--orha-mint)",
  },
  {
    name: "Café, fé e conversa",
    initials: "CF",
    message: "Marina: encontro confirmado para sábado",
    time: "14:20",
    unread: 5,
    tone: "var(--orha-peach)",
  },
];
