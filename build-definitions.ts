import { readFileSync } from "node:fs";

export const verseformDefines = {
  __VERSEFORM_DEPENDENCY_LICENSES__: JSON.stringify(
    readFileSync(new URL("./DEPENDENCY-LICENSES.txt", import.meta.url), "utf8"),
  ),
};
