import packageMetadata from "../../package.json";
import type { Translation } from "./ports";

declare const __VERSEFORM_DEPENDENCY_LICENSES__: string;

export type CreditLinkId = "digital-bible-society" | "world-english-bible";

export const CREDIT_LINK_URLS: Readonly<Record<CreditLinkId, string>> = Object.freeze({
  "digital-bible-society": "https://dbs.org/",
  "world-english-bible": "https://ebible.org/engwebp/copyright.htm",
});

export type CreditsModel = {
  version: string;
  translation: {
    name: string;
    citationLabel: string;
    notice: string;
    source: Translation["source"];
  };
  webProvenance: string;
  softwareNotices: string;
  softwarePackageCount: number;
};

const softwarePackageCount = __VERSEFORM_DEPENDENCY_LICENSES__
  .split(/\r?\n/u)
  .filter((line) => line.startsWith("Cargo\t") || line.startsWith("npm\t"))
  .length;

export function creditsFor(translation: Translation): CreditsModel {
  return {
    version: packageMetadata.version,
    translation: {
      name: translation.name,
      citationLabel: translation.citationLabel,
      notice: translation.attribution,
      source: translation.source,
    },
    webProvenance: "The bundled World English Bible is the 2020 stable public-domain text sourced from eBible.org. ‘World English Bible’ is an eBible.org trademark.",
    softwareNotices: __VERSEFORM_DEPENDENCY_LICENSES__,
    softwarePackageCount,
  };
}
