import type { ReferenceCandidate } from "./reference";

export type LookupRequest = ReferenceCandidate & {
  revision: number;
};

export function isLookupFresh(
  request: LookupRequest,
  currentRevision: number,
  currentSourceText: string,
): boolean {
  return (
    request.revision === currentRevision &&
    request.sourceText === currentSourceText
  );
}
