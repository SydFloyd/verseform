import type { Translation } from "./ports";

function preferredNasb(translations: readonly Translation[]): Translation | undefined {
  return translations.find((translation) => translation.citationLabel.toUpperCase() === "NASB")
    ?? translations.find((translation) => /\bNASB\b|New American Standard Bible/iu.test(
      `${translation.name} ${translation.vernacularName ?? ""}`,
    ));
}

export function selectInitialTranslation(
  translations: readonly Translation[],
  savedPreference?: string,
): Translation | undefined {
  return translations.find((translation) => translation.id === savedPreference)
    ?? preferredNasb(translations)
    ?? translations.find((translation) => translation.id === "WEB")
    ?? translations[0];
}
