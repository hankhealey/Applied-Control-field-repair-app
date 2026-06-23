import { type NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "GROQ_API_KEY not configured" },
      { status: 500 },
    );
  }

  const body = await req.formData();
  const audio = body.get("audio") as File | null;
  if (!audio) {
    return NextResponse.json({ error: "No audio" }, { status: 400 });
  }

  const form = new FormData();
  form.append("file", audio);
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "en");
  form.append("response_format", "json");

  const res = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    },
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[transcribe] Groq error:", err);
    return NextResponse.json({ error: err }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json({ text: (data.text ?? "").trim() });
}
