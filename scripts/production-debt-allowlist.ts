export type ProductionDebtCategory =
  | "prototype"
  | "mock"
  | "seed"
  | "todo"
  | "localStorage"
  | "createObjectURL";

export type ProductionDebtAllowance = {
  category: ProductionDebtCategory;
  path: string;
  maxOccurrences: number;
  reason: string;
};

/**
 * Baseline of known debt, not a declaration that the code is production-ready.
 * Every occurrence is accounted for exactly. Both increases and reductions
 * require a reviewed allowlist update, so removed debt cannot silently return.
 */
export const productionDebtAllowlist: readonly ProductionDebtAllowance[] = [
  {
    category: "prototype",
    path: "src/app/components/people-carousel.tsx",
    maxOccurrences: 1,
    reason: "The repository-backed empty state still uses a legacy prototype CSS class.",
  },
  {
    category: "prototype",
    path: "src/app/components/app-drawer.tsx",
    maxOccurrences: 49,
    reason: "The shared app drawer retains the legacy prototype CSS class namespace.",
  },
  {
    category: "prototype",
    path: "src/app/pages/community-page.tsx",
    maxOccurrences: 6,
    reason: "Repository-backed community loading, error, and empty states retain legacy CSS hooks.",
  },
  {
    category: "prototype",
    path: "src/app/pages/conversations-page.tsx",
    maxOccurrences: 5,
    reason: "Repository-backed conversation states retain legacy empty/button CSS hooks.",
  },
  {
    category: "prototype",
    path: "src/app/pages/private-chat-page.tsx",
    maxOccurrences: 3,
    reason: "Private-chat retry and error states retain legacy CSS hooks.",
  },
  {
    category: "prototype",
    path: "src/app/pages/profile-page.tsx",
    maxOccurrences: 4,
    reason: "Repository-backed profile file inputs and empty states retain legacy CSS hooks.",
  },
  {
    category: "prototype",
    path: "src/app/profile/profile-settings-drawer.tsx",
    maxOccurrences: 1,
    reason: "Profile settings still reuse the legacy hidden-file CSS hook.",
  },
  {
    category: "prototype",
    path: "src/lib/utils/is-react-component.ts",
    maxOccurrences: 3,
    reason: "False positive: JavaScript's Function.prototype API.",
  },
  {
    category: "prototype",
    path: "src/styles/index.css",
    maxOccurrences: 99,
    reason: "Legacy class names tied to the existing prototype surfaces.",
  },
  {
    category: "createObjectURL",
    path: "src/infrastructure/media/browser-audio-recorder.ts",
    maxOccurrences: 1,
    reason: "Browser recording preview URL is tracked and revoked by the media adapter.",
  },
  {
    category: "createObjectURL",
    path: "src/app/profile/profile-image-crop-drawer.tsx",
    maxOccurrences: 1,
    reason: "Crop preview URL is revoked by the component cleanup effect.",
  },
  {
    category: "createObjectURL",
    path: "src/infrastructure/media/profile-image-processor.ts",
    maxOccurrences: 1,
    reason: "Image decode fallback revokes its temporary URL in a finally block.",
  },
  {
    category: "createObjectURL",
    path: "src/infrastructure/media/profile-image-validation.ts",
    maxOccurrences: 2,
    reason: "Dimension validation checks support and revokes the temporary URL on load/error.",
  },
] as const;
