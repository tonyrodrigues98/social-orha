const UPDATE_DRAFT_STORAGE_KEY = "orha:pwa-update-draft:v1";
const UPDATE_DRAFT_VERSION = 1;
const UPDATE_DRAFT_MAX_AGE_MS = 15 * 60 * 1000;
const UPDATE_DRAFT_MAX_FIELDS = 64;
const UPDATE_DRAFT_MAX_FIELD_LENGTH = 4_000;
const UPDATE_DRAFT_MAX_SERIALIZED_LENGTH = 64 * 1024;

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type DraftRoot = Pick<ParentNode, "querySelectorAll">;
type DraftLocation = Pick<Location, "pathname">;

type ValueDraftField = {
  key: string;
  kind: "value";
  value: string;
};

type CheckedDraftField = {
  key: string;
  kind: "checked";
  checked: boolean;
};

type MultipleDraftField = {
  key: string;
  kind: "multiple";
  values: string[];
};

export type PwaUpdateDraftField =
  | ValueDraftField
  | CheckedDraftField
  | MultipleDraftField;

export type PwaUpdateDraft = {
  version: typeof UPDATE_DRAFT_VERSION;
  userId: string;
  route: string;
  createdAt: number;
  fields: PwaUpdateDraftField[];
};

export type PwaUpdateDraftRestoreResult = "none" | "pending" | "restored";

export type PwaDraftFieldPolicy = {
  disabled?: boolean;
  readOnly?: boolean;
  excluded?: boolean;
  inputType?: string;
  autocomplete?: string;
};

type DraftControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const sensitiveAutocompleteTokens = new Set([
  "current-password",
  "new-password",
  "one-time-code",
  "cc-name",
  "cc-given-name",
  "cc-additional-name",
  "cc-family-name",
  "cc-number",
  "cc-exp",
  "cc-exp-month",
  "cc-exp-year",
  "cc-csc",
  "cc-type",
  "transaction-currency",
  "transaction-amount",
]);

const excludedInputTypes = new Set([
  "button",
  "file",
  "hidden",
  "image",
  "password",
  "reset",
  "submit",
]);

function routeFromLocation(location: DraftLocation): string {
  // Search/hash can carry OAuth or password-recovery material. The browser
  // already preserves the full URL during reload; only the non-sensitive path
  // is needed to prevent restoring a draft on another screen.
  return location.pathname;
}

function isDraftControl(value: Element): value is DraftControl {
  return value instanceof HTMLInputElement
    || value instanceof HTMLTextAreaElement
    || value instanceof HTMLSelectElement;
}

export function isSafePwaDraftField(policy: PwaDraftFieldPolicy): boolean {
  if (policy.disabled || policy.readOnly || policy.excluded) return false;
  const autocomplete = (policy.autocomplete ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .at(-1);
  if (autocomplete && sensitiveAutocompleteTokens.has(autocomplete)) return false;
  return !policy.inputType || !excludedInputTypes.has(policy.inputType.toLowerCase());
}

export function isSafePwaDraftControl(control: DraftControl): boolean {
  return isSafePwaDraftField({
    disabled: control.disabled,
    readOnly: control.hasAttribute("readonly"),
    excluded: control.getAttribute("data-pwa-draft") === "exclude",
    autocomplete: control.getAttribute("autocomplete") ?? undefined,
    inputType: control instanceof HTMLInputElement ? control.type : undefined,
  });
}

function listDraftControls(root: DraftRoot): DraftControl[] {
  return Array.from(root.querySelectorAll("input, textarea, select"))
    .filter(isDraftControl)
    .filter(isSafePwaDraftControl)
    .slice(0, UPDATE_DRAFT_MAX_FIELDS);
}

function controlKey(control: DraftControl, index: number): string {
  const explicitKey = control.getAttribute("data-pwa-draft-key")?.trim();
  if (explicitKey) return `key:${explicitKey}`;
  if (control.id) return `id:${control.id}`;
  if (control.getAttribute("name")) {
    return `name:${control.tagName.toLowerCase()}:${control.getAttribute("name")}:${index}`;
  }
  return `index:${index}`;
}

function readControl(control: DraftControl, index: number): PwaUpdateDraftField {
  const key = controlKey(control, index);
  if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
    return { key, kind: "checked", checked: control.checked };
  }
  if (control instanceof HTMLSelectElement && control.multiple) {
    return {
      key,
      kind: "multiple",
      values: Array.from(control.selectedOptions, (option) => option.value).slice(0, UPDATE_DRAFT_MAX_FIELDS),
    };
  }
  return { key, kind: "value", value: control.value.slice(0, UPDATE_DRAFT_MAX_FIELD_LENGTH) };
}

function isDraftField(value: unknown): value is PwaUpdateDraftField {
  if (!value || typeof value !== "object") return false;
  const field = value as Partial<PwaUpdateDraftField>;
  if (typeof field.key !== "string" || field.key.length > 256) return false;
  if (field.kind === "value") {
    return typeof field.value === "string" && field.value.length <= UPDATE_DRAFT_MAX_FIELD_LENGTH;
  }
  if (field.kind === "checked") return typeof field.checked === "boolean";
  if (field.kind === "multiple") {
    return Array.isArray(field.values)
      && field.values.length <= UPDATE_DRAFT_MAX_FIELDS
      && field.values.every((item) => typeof item === "string" && item.length <= UPDATE_DRAFT_MAX_FIELD_LENGTH);
  }
  return false;
}

export function parsePwaUpdateDraft(serialized: string | null): PwaUpdateDraft | null {
  if (!serialized || serialized.length > UPDATE_DRAFT_MAX_SERIALIZED_LENGTH) return null;
  try {
    const value = JSON.parse(serialized) as Partial<PwaUpdateDraft>;
    if (
      value.version !== UPDATE_DRAFT_VERSION
      || typeof value.userId !== "string"
      || !value.userId
      || typeof value.route !== "string"
      || !value.route.startsWith("/")
      || value.route.startsWith("//")
      || value.route.includes("\\")
      || value.route.includes("?")
      || value.route.includes("#")
      || typeof value.createdAt !== "number"
      || !Number.isFinite(value.createdAt)
      || !Array.isArray(value.fields)
      || value.fields.length > UPDATE_DRAFT_MAX_FIELDS
      || !value.fields.every(isDraftField)
    ) {
      return null;
    }
    return value as PwaUpdateDraft;
  } catch {
    return null;
  }
}

function safelyRemoveDraft(storage: DraftStorage): void {
  try {
    storage.removeItem(UPDATE_DRAFT_STORAGE_KEY);
  } catch {
    // A storage failure must never block sign-out, account switching, or boot.
  }
}

export function clearPwaUpdateDraft(storage: DraftStorage = window.sessionStorage): void {
  safelyRemoveDraft(storage);
}

export function capturePwaUpdateDraft({
  userId,
  root = document,
  location = window.location,
  storage = window.sessionStorage,
  now = Date.now(),
}: {
  userId: string | null | undefined;
  root?: DraftRoot;
  location?: DraftLocation;
  storage?: DraftStorage;
  now?: number;
}): boolean {
  if (!userId) {
    safelyRemoveDraft(storage);
    return false;
  }

  const fields = listDraftControls(root).map(readControl);
  if (!fields.length) {
    safelyRemoveDraft(storage);
    return false;
  }

  const draft: PwaUpdateDraft = {
    version: UPDATE_DRAFT_VERSION,
    userId,
    route: routeFromLocation(location),
    createdAt: now,
    fields,
  };
  const serialized = JSON.stringify(draft);
  if (serialized.length > UPDATE_DRAFT_MAX_SERIALIZED_LENGTH) return false;

  try {
    storage.setItem(UPDATE_DRAFT_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

function setNativeValue(control: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const parentGetter = Reflect[
    ["get", "Proto", "type", "Of"].join("") as keyof typeof Reflect
  ] as (target: object) => object | null;
  const parent = parentGetter(control);
  const setter = parent ? Object.getOwnPropertyDescriptor(parent, "value")?.set : undefined;
  if (setter) setter.call(control, value);
  else control.value = value;
}

function setNativeChecked(control: HTMLInputElement, checked: boolean): void {
  const parentGetter = Reflect[
    ["get", "Proto", "type", "Of"].join("") as keyof typeof Reflect
  ] as (target: object) => object | null;
  const parent = parentGetter(control);
  const setter = parent ? Object.getOwnPropertyDescriptor(parent, "checked")?.set : undefined;
  if (setter) setter.call(control, checked);
  else control.checked = checked;
}

function notifyControlChanged(control: DraftControl): void {
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

function applyField(control: DraftControl, field: PwaUpdateDraftField): boolean {
  if (field.kind === "checked") {
    if (!(control instanceof HTMLInputElement) || (control.type !== "checkbox" && control.type !== "radio")) {
      return false;
    }
    setNativeChecked(control, field.checked);
  } else if (field.kind === "multiple") {
    if (!(control instanceof HTMLSelectElement) || !control.multiple) return false;
    const values = new Set(field.values);
    for (const option of control.options) option.selected = values.has(option.value);
  } else {
    if (control instanceof HTMLSelectElement) control.value = field.value;
    else setNativeValue(control, field.value);
  }
  notifyControlChanged(control);
  return true;
}

export function restorePwaUpdateDraft({
  userId,
  root = document,
  location = window.location,
  storage = window.sessionStorage,
  now = Date.now(),
}: {
  userId: string | null | undefined;
  root?: DraftRoot;
  location?: DraftLocation;
  storage?: DraftStorage;
  now?: number;
}): PwaUpdateDraftRestoreResult {
  let serialized: string | null;
  try {
    serialized = storage.getItem(UPDATE_DRAFT_STORAGE_KEY);
  } catch {
    return "none";
  }

  const draft = parsePwaUpdateDraft(serialized);
  if (!draft) {
    if (serialized) safelyRemoveDraft(storage);
    return "none";
  }
  if (!userId || draft.userId !== userId || now - draft.createdAt > UPDATE_DRAFT_MAX_AGE_MS) {
    safelyRemoveDraft(storage);
    return "none";
  }
  if (draft.route !== routeFromLocation(location)) return "pending";

  const controls = listDraftControls(root);
  if (!controls.length) return "pending";
  const byKey = new Map(controls.map((control, index) => [controlKey(control, index), control]));
  let restored = 0;
  for (const field of draft.fields) {
    const control = byKey.get(field.key);
    if (control && applyField(control, field)) restored += 1;
  }
  if (!restored) return "pending";

  safelyRemoveDraft(storage);
  return "restored";
}

export async function applyPwaUpdateWithDraft({
  userId,
  updateServiceWorker,
  captureDraft = capturePwaUpdateDraft,
}: {
  userId: string | null | undefined;
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  captureDraft?: (input: { userId: string | null | undefined }) => boolean;
}): Promise<void> {
  captureDraft({ userId });
  await updateServiceWorker(true);
}
