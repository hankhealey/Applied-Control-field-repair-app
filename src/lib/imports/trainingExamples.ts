// Training examples stored in localStorage.
// Each example pairs raw PDF text with the correct field values so Groq
// can learn the Applied Control report format via few-shot prompting.

export interface TrainingExample {
  id: string;
  filename: string;
  rawText: string;
  fields: Record<string, string>;
  savedAt: string;
  /** Asset type of the source report; legacy examples lack it (treated as "All"). */
  assetType?: string;
}

const STORAGE_KEY = "pdf-training-examples";

/**
 * Pick up to `max` few-shot examples for an asset type: same-type examples
 * first (most recent), topped up with "All"/legacy-untyped ones.
 */
export function pickExamplesForType(
  all: TrainingExample[],
  assetType: string,
  max = 3,
): TrainingExample[] {
  const typed = all.filter((ex) => ex.assetType === assetType);
  const globals = all.filter((ex) => !ex.assetType || ex.assetType === "All");
  const chosen = typed.slice(-max);
  if (chosen.length < max) chosen.unshift(...globals.slice(-(max - chosen.length)));
  return chosen;
}

export function getTrainingExamples(): TrainingExample[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TrainingExample[]) : [];
  } catch {
    return [];
  }
}

export function saveTrainingExample(
  example: Omit<TrainingExample, "id" | "savedAt">,
): TrainingExample {
  const examples = getTrainingExamples();
  const next: TrainingExample = {
    ...example,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...examples, next]));
  } catch {
    // QuotaExceededError or SecurityError — return the example but don't persist
  }
  return next;
}

export function deleteTrainingExample(id: string): void {
  const examples = getTrainingExamples().filter((e) => e.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(examples));
  } catch {
    // QuotaExceededError or SecurityError — ignore
  }
}

/** Change one example's asset type. Returns the updated list. */
export function updateTrainingExampleType(id: string, assetType: string): TrainingExample[] {
  const examples = getTrainingExamples().map((e) => (e.id === id ? { ...e, assetType } : e));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(examples));
  } catch {
    // ignore persistence failure — state still updates for this session
  }
  return examples;
}

/** Tag every example that has no asset type yet. Returns the updated list. */
export function retagUntypedExamples(assetType: string): TrainingExample[] {
  const examples = getTrainingExamples().map((e) => (e.assetType ? e : { ...e, assetType }));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(examples));
  } catch {
    // ignore persistence failure — state still updates for this session
  }
  return examples;
}
