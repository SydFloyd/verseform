declare module "pagedjs" {
  export type PagedFlow = {
    total: number;
    pages: Array<{ element: HTMLElement }>;
  };

  export class Previewer {
    polisher: { destroy(): void };
    chunker: { destroy(): void };
    preview(
      content: string | Node,
      stylesheets: Array<string | Record<string, string>>,
      renderTo: HTMLElement,
    ): Promise<PagedFlow>;
  }
}
