/** Languages offered for AI draft translations of archive records. */
export const TRANSLATION_TARGETS = {
  en: "English",
  ru: "Russian",
  uz: "Uzbek (Latin script)",
  kk: "Kazakh",
  ky: "Kyrgyz",
  tg: "Tajik",
  tk: "Turkmen",
  zh: "Chinese (Simplified)",
  ar: "Arabic",
  es: "Spanish",
  fr: "French",
} as const;

export type TranslationTarget = keyof typeof TRANSLATION_TARGETS;
