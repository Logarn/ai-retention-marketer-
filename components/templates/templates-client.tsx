"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type Template = {
  id: string;
  name: string;
  channel: string;
  type: string;
  subject?: string | null;
  body: string;
  createdAt: string;
};

export function TemplatesClient() {
  const { data, mutate, isLoading } = useSWR<Template[]>("/api/templates", fetcher);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("email");
  const [type, setType] = useState("win_back");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const onCreate = async () => {
    if (!name.trim() || !body.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          channel,
          type,
          subject: channel === "email" ? subject.trim() || undefined : undefined,
          body: body.trim(),
        }),
      });
      setName("");
      setSubject("");
      setBody("");
      await mutate();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    await mutate();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Save New Template</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" />
          <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="win_back">Win-back</option>
            <option value="post_purchase">Post-purchase</option>
            <option value="replenishment">Replenishment</option>
            <option value="browse_abandonment">Browse abandonment</option>
            <option value="vip">VIP</option>
            <option value="promotional">Promotional</option>
          </Select>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject (email only)"
            disabled={channel !== "email"}
          />
          <textarea
            className="textarea-base md:col-span-2 min-h-[140px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Template body"
          />
          <Button className="md:col-span-2" onClick={onCreate} disabled={saving}>
            {saving ? "Saving..." : "Save template"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Template Library</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-zinc-400">Loading templates...</p>}
          {!isLoading &&
            (data ?? []).map((tpl) => (
              <div key={tpl.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium text-zinc-100">{tpl.name}</h3>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{tpl.channel}</Badge>
                    <Badge variant="secondary">{tpl.type}</Badge>
                    <Button variant="ghost" onClick={() => void onDelete(tpl.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
                {tpl.subject && <p className="mt-1 text-sm text-zinc-300">Subject: {tpl.subject}</p>}
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-400">{tpl.body}</p>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
