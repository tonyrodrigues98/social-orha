export type LibraryKind = "registry-kit" | "npm" | "browser-api" | "backend-service";
export type IntegrationStatus = "integrated" | "installed" | "quarantined" | "client-ready" | "external";

export interface LibraryCatalogEntry {
  readonly name: string;
  readonly kind: LibraryKind;
  readonly status: IntegrationStatus;
  readonly packages?: readonly string[];
  readonly sourcePath?: string;
  readonly note: string;
}

export const libraryCatalog: readonly LibraryCatalogEntry[] = [
  { name: "GodUI", kind: "registry-kit", status: "integrated", packages: ["framer-motion"], sourcePath: "src/components/godui/drawer.tsx", note: "Drawer instalado pelo registry oficial; código local." },
  { name: "Untitled UI React", kind: "registry-kit", status: "integrated", packages: ["@untitledui/icons", "react-aria"], sourcePath: "src/components/base", note: "Todos os componentes base gratuitos instalados pela CLI oficial." },
  { name: "chatcn", kind: "registry-kit", status: "integrated", packages: ["date-fns", "lucide-react"], sourcePath: "src/components/ui/chat", note: "Código oficial importado; manifesto adaptado porque o campo css usa schema legado." },
  { name: "shadcn/ui", kind: "registry-kit", status: "integrated", packages: ["shadcn", "class-variance-authority", "clsx", "tailwind-merge", "lucide-react"], sourcePath: "components.json", note: "Infraestrutura de registry configurada para Vite e Tailwind 4." },
  { name: "Radix Primitives", kind: "npm", status: "installed", packages: ["radix-ui"], note: "Pacote agregador oficial instalado." },
  { name: "React Aria", kind: "npm", status: "installed", packages: ["react-aria-components", "react-aria"], note: "Base acessível usada também pelo Untitled UI." },
  { name: "react-modal-sheet", kind: "npm", status: "installed", packages: ["react-modal-sheet"], note: "Alternativa de bottom sheet disponível para POC." },
  { name: "Vaul", kind: "npm", status: "quarantined", packages: ["vaul"], note: "Instalado para estudo; o relatório registra ausência de manutenção." },
  { name: "Embla Carousel", kind: "npm", status: "installed", packages: ["embla-carousel-react"], note: "Engine padrão recomendada para carrosséis." },
  { name: "Swiper", kind: "npm", status: "installed", packages: ["swiper"], note: "Reservado para casos avançados." },
  { name: "Yet Another React Lightbox", kind: "npm", status: "installed", packages: ["yet-another-react-lightbox"], note: "Viewer fullscreen e gallery." },
  { name: "TanStack Virtual", kind: "npm", status: "installed", packages: ["@tanstack/react-virtual"], note: "Virtualização headless de listas extensas." },
  { name: "Motion", kind: "npm", status: "installed", packages: ["motion"], note: "Motion para React/JS; GodUI ainda usa framer-motion diretamente." },
  { name: "use-gesture", kind: "npm", status: "installed", packages: ["@use-gesture/react"], note: "Gestos especiais; requer validação Safari/iOS por feature." },
  { name: "Vidstack", kind: "npm", status: "quarantined", packages: ["@vidstack/react"], note: "Peer types ainda declara React 18; instalado via resolução legada." },
  { name: "Media Chrome", kind: "npm", status: "installed", packages: ["media-chrome"], note: "Web Components de controles de mídia." },
  { name: "wavesurfer.js", kind: "npm", status: "installed", packages: ["wavesurfer.js"], note: "Waveforms de áudio." },
  { name: "react-media-recorder", kind: "npm", status: "quarantined", packages: ["react-media-recorder"], note: "Instalado somente para comparação; adapter nativo é o default." },
  { name: "MediaRecorder nativo", kind: "browser-api", status: "integrated", sourcePath: "src/infrastructure/media/browser-audio-recorder.ts", note: "API encapsulada atrás de uma porta própria." },
  { name: "react-easy-crop", kind: "npm", status: "installed", packages: ["react-easy-crop"], note: "Crop React recomendado." },
  { name: "Cropper.js", kind: "npm", status: "installed", packages: ["cropperjs"], note: "Alternativa low-level de crop." },
  { name: "Tiptap", kind: "npm", status: "installed", packages: ["@tiptap/react", "@tiptap/pm", "@tiptap/starter-kit", "@tiptap/extension-mention"], note: "Editor rich text e mentions." },
  { name: "Lexical", kind: "npm", status: "installed", packages: ["lexical", "@lexical/react"], note: "Editor alternativo altamente customizável." },
  { name: "emoji-picker-react", kind: "npm", status: "installed", packages: ["emoji-picker-react"], note: "Picker principal para POC de emoji/reactions." },
  { name: "Emoji Mart", kind: "npm", status: "quarantined", packages: ["@emoji-mart/data", "@emoji-mart/react"], note: "Adapter declara peer até React 18; não usar como default sem novo POC." },
  { name: "Uppy", kind: "npm", status: "installed", packages: ["@uppy/core", "@uppy/react", "@uppy/xhr-upload"], note: "Core, hooks/headless e transporte XHR instalados." },
  { name: "react-dropzone", kind: "npm", status: "installed", packages: ["react-dropzone"], note: "Drop/select simples." },
  { name: "FilePond", kind: "npm", status: "installed", packages: ["filepond", "react-filepond"], note: "Alternativa visual de upload." },
  { name: "react-map-gl + MapLibre", kind: "npm", status: "installed", packages: ["react-map-gl", "maplibre-gl"], note: "Mapas sem token proprietário obrigatório." },
  { name: "Recharts", kind: "npm", status: "installed", packages: ["recharts", "react-is"], note: "Charts React; react-is está alinhado ao React 19." },
  { name: "React Hook Form", kind: "npm", status: "installed", packages: ["react-hook-form"], note: "Form engine maduro." },
  { name: "TanStack Form", kind: "npm", status: "installed", packages: ["@tanstack/react-form"], note: "Alternativa typed/headless." },
  { name: "React DayPicker", kind: "npm", status: "installed", packages: ["react-day-picker"], note: "Calendário e intervalos de datas." },
  { name: "Orama", kind: "npm", status: "integrated", packages: ["@orama/orama"], sourcePath: "src/infrastructure/search/orama-search-repository.ts", note: "Repository local full-text implementado." },
  { name: "Algolia Autocomplete", kind: "npm", status: "installed", packages: ["@algolia/autocomplete-js"], note: "UI de autocomplete disponível." },
  { name: "Meilisearch + instant-meilisearch", kind: "backend-service", status: "client-ready", packages: ["meilisearch", "@meilisearch/instant-meilisearch"], note: "Clientes instalados; servidor/credenciais permanecem externos." },
  { name: "Typesense InstantSearch Adapter", kind: "backend-service", status: "client-ready", packages: ["typesense", "typesense-instantsearch-adapter"], note: "Cliente e adapter instalados; servidor permanece externo." },
  { name: "Gorse", kind: "backend-service", status: "client-ready", packages: ["gorsejs"], note: "SDK TypeScript instalado; serviço Go permanece externo." },
  { name: "Metarank", kind: "backend-service", status: "external", note: "Serviço JVM/Docker sem SDK web oficial; integrar por REST quando houver backend." },
  { name: "PostHog JS", kind: "npm", status: "client-ready", packages: ["posthog-js"], sourcePath: "src/infrastructure/analytics/analytics-port.ts", note: "SDK disponível atrás de porta; não inicializa sem consentimento/configuração." },
  { name: "Umami", kind: "backend-service", status: "client-ready", packages: ["@umami/node"], note: "Cliente Node instalado; tracker web exige URL e website-id do deployment." },
] as const;

export const installedPackageNames = [...new Set(libraryCatalog.flatMap((entry) => entry.packages ?? []))].sort();
