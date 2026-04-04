"use client";

import { useState } from "react";
import { Beaker, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type VoiceResponse = {
  voiceTone: {
    formalCasual: number;
    seriousPlayful: number;
    preferredCTAs: string[];
    signaturePhrases: string[];
  };
};

export default function BrainVoiceTestPage() {
  const [prompt, setPrompt] = useState("Write a flash sale subject line for our bestselling serum.");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [applied, setApplied] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function runTest() {
    setIsRunning(true);
    setError(null);
    setResult(null);
    setApplied([]);
    try {
      const response = await fetch("/api/brain/voice-tone");
      const json = (await response.json()) as VoiceResponse;
      if (!response.ok || !json.voiceTone) throw new Error("Unable to load voice profile");

      const cta = json.voiceTone.preferredCTAs[0] ?? "Shop now";
      const phrase = json.voiceTone.signaturePhrases[0] ?? "Feel the difference";
      const casual = json.voiceTone.formalCasual >= 6;
      const playful = json.voiceTone.seriousPlayful >= 6;

      const generated = [
        casual ? "Hey there," : "Hello,",
        playful ? "quick one:" : "a quick update:",
        prompt.replace(/^write\s+/i, ""),
        `CTA: ${cta}.`,
        phrase,
      ].join(" ");

      const rulesApplied = [
        `Formality slider → ${json.voiceTone.formalCasual}/10`,
        `Energy slider → ${json.voiceTone.seriousPlayful}/10`,
        `Preferred CTA → ${cta}`,
        `Signature phrase → ${phrase}`,
      ];

      setResult(generated);
      setApplied(rulesApplied);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Voice test failed");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-100">
          <Beaker className="h-5 w-5 text-indigo-300" />
          Voice Test
        </h1>
        <p className="text-sm text-zinc-400">
          Quickly test how The Brain applies your voice settings before launching campaigns.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Prompt</CardTitle>
          <CardDescription>Enter a marketing prompt and generate an on-brand sample.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          <Button onClick={() => void runTest()} disabled={isRunning || !prompt.trim()}>
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Run Voice Test
          </Button>
          {error ? <p className="text-xs text-red-300">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generated Output</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-200">
            {result ?? "Run a test to view output."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rules Applied</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {applied.length ? (
            applied.map((item, index) => (
              <div key={`${item}-${index}`} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                <Badge variant="secondary">Applied</Badge>
                <p className="mt-1 text-sm text-zinc-200">{item}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-zinc-400">No applied rules yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
