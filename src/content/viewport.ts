type ActiveArticleListener = (id: string | null) => void;

export class ArticleViewportObserver {
  private readonly ratios = new Map<string, number>();
  private observer: IntersectionObserver | null = null;

  constructor(private readonly onActiveChange: ActiveArticleListener) {}

  observe(elements: Map<string, HTMLElement>) {
    if (!this.observer) {
      this.observer = new IntersectionObserver(this.handleEntries, {
        threshold: [0.15, 0.35, 0.55, 0.75],
        rootMargin: "-15% 0px -15% 0px"
      });
    }

    this.observer.disconnect();
    this.ratios.clear();

    for (const [id, element] of elements) {
      element.dataset.gptickerId = id;
      this.observer.observe(element);
    }

    if (elements.size === 0) {
      this.onActiveChange(null);
    }
  }

  disconnect() {
    this.observer?.disconnect();
    this.ratios.clear();
  }

  private handleEntries: IntersectionObserverCallback = (entries) => {
    for (const entry of entries) {
      const id = (entry.target as HTMLElement).dataset.gptickerId;

      if (!id) {
        continue;
      }

      if (entry.isIntersecting) {
        this.ratios.set(id, entry.intersectionRatio);
      } else {
        this.ratios.delete(id);
      }
    }

    const activeId =
      [...this.ratios.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
      null;

    this.onActiveChange(activeId);
  };
}
