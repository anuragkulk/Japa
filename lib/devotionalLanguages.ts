export type DevotionalLanguage = "en" | "hi" | "kn" | "ta";

// Display metadata only. The stored code is what the backend persists; labels
// are for the UI. Native script is shown first so the selection is unambiguous.
export const DEVOTIONAL_LANGUAGES: {
  code: DevotionalLanguage;
  native: string;
  english: string;
  bcp47: string;
}[] = [
  { code: "en", native: "English", english: "English", bcp47: "en" },
  { code: "hi", native: "हिंदी", english: "Hindi", bcp47: "hi" },
  { code: "kn", native: "ಕನ್ನಡ", english: "Kannada", bcp47: "kn" },
  { code: "ta", native: "தமிழ்", english: "Tamil", bcp47: "ta" },
];

const BY_CODE = new Map(DEVOTIONAL_LANGUAGES.map((l) => [l.code, l]));

export function languageInfo(code: string) {
  return BY_CODE.get(code as DevotionalLanguage);
}

// "हिंदी · Hindi" for cards; falls back to the raw code if unknown.
export function languageLabel(code: string): string {
  const info = BY_CODE.get(code as DevotionalLanguage);
  if (!info) return code;
  return info.native === info.english ? info.native : `${info.native} · ${info.english}`;
}
