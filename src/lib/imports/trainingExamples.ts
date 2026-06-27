// Training examples stored in localStorage.
// Each example pairs raw PDF text with the correct field values so Groq
// can learn the Applied Control report format via few-shot prompting.

export interface TrainingExample {
  id: string;
  filename: string;
  rawText: string;
  fields: Record<string, string>;
  savedAt: string;
}

const STORAGE_KEY = "pdf-training-examples";

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
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...examples, next]));
  return next;
}

export function deleteTrainingExample(id: string): void {
  const examples = getTrainingExamples().filter((e) => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(examples));
}
