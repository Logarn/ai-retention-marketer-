"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ClipboardList,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RuleItem = {
  rule: string;
  explanation?: string;
  source?: string;
  priority: 1 | 2 | 3;
};

type RuleCategory = {
  key: string;
  label: string;
  description: string;
  items: RuleItem[];
};

type RulesResponse = {
  rules: {
    id: string;
    categories: {
      dos: RuleCategory[];
      donts: RuleCategory[];
      caution: RuleCategory[];
    };
    updatedAt: string;
  };
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
};

const blankRule = (): RuleItem => ({
  rule: "",
  explanation: "",
  source: "manual",
  priority: 2,
});

function cloneCategories(input: RuleCategory[]) {
  return input.map((category) => ({
    ...category,
    items: category.items.map((item) => ({ ...item })),
  }));
}

function normalizeForSave(categories: RuleCategory[]) {
  return categories.map((category) => ({
    key: category.key,
    label: category.label,
    description: category.description,
    items: category.items
      .map((item) => ({
        rule: item.rule.trim(),
        explanation: (item.explanation ?? "").trim() || undefined,
        source: (item.source ?? "").trim() || "manual",
        priority: item.priority,
      }))
      .filter((item) => item.rule.length > 0),
  }));
}

function priorityLabel(priority: 1 | 2 | 3) {
  if (priority === 1) return "Critical";
  if (priority === 2) return "Important";
  return "Preferred";
}

export default function BrainRulesPage() {
  const { data, error, isLoading, mutate } = useSWR<RulesResponse>("/api/brain/rules", fetcher);

  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [dos, setDos] = useState<RuleCategory[]>([]);
  const [donts, setDonts] = useState<RuleCategory[]>([]);
  const [caution, setCaution] = useState<RuleCategory[]>([]);
  const [initialized, setInitialized] = useState(false);

  useMemo(() => {
    if (!data || initialized) return;
    setDos(cloneCategories(data.rules.categories.dos));
    setDonts(cloneCategories(data.rules.categories.donts));
    setCaution(cloneCategories(data.rules.categories.caution));
    setInitialized(true);
  }, [data, initialized]);

  function updateCategoryRule(
    setState: React.Dispatch<React.SetStateAction<RuleCategory[]>>,
    categoryIndex: number,
    itemIndex: number,
    patch: Partial<RuleItem>,
  ) {
    setState((previous) =>
      previous.map((category, cIdx) => {
        if (cIdx !== categoryIndex) return category;
        return {
          ...category,
          items: category.items.map((item, iIdx) =>
            iIdx === itemIndex ? { ...item, ...patch } : item,
          ),
        };
      }),
    );
  }

  function addRule(
    setState: React.Dispatch<React.SetStateAction<RuleCategory[]>>,
    categoryIndex: number,
  ) {
    setState((previous) =>
      previous.map((category, cIdx) =>
        cIdx === categoryIndex
          ? { ...category, items: [...category.items, blankRule()] }
          : category,
      ),
    );
  }

  function deleteRule(
    setState: React.Dispatch<React.SetStateAction<RuleCategory[]>>,
    categoryIndex: number,
    itemIndex: number,
  ) {
    setState((previous) =>
      previous.map((category, cIdx) => {
        if (cIdx !== categoryIndex) return category;
        return {
          ...category,
          items: category.items.filter((_, idx) => idx !== itemIndex),
        };
      }),
    );
  }

  function moveRule(
    setState: React.Dispatch<React.SetStateAction<RuleCategory[]>>,
    categoryIndex: number,
    itemIndex: number,
    direction: "up" | "down",
  ) {
    setState((previous) =>
      previous.map((category, cIdx) => {
        if (cIdx !== categoryIndex) return category;
        const nextItems = [...category.items];
        const targetIndex = direction === "up" ? itemIndex - 1 : itemIndex + 1;
        if (targetIndex < 0 || targetIndex >= nextItems.length) return category;
        const [item] = nextItems.splice(itemIndex, 1);
        nextItems.splice(targetIndex, 0, item);
        return { ...category, items: nextItems };
      }),
    );
  }

  async function saveRules() {
    setIsSaving(true);
    setNotice(null);
    setSaveError(null);
    try {
      const response = await fetch("/api/brain/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dos: normalizeForSave(dos),
          donts: normalizeForSave(donts),
          caution: normalizeForSave(caution),
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(json.error || "Failed to save rules");
      setNotice("Rules saved successfully.");
      await mutate();
    } catch (persistError) {
      setSaveError(persistError instanceof Error ? persistError.message : "Failed to save rules");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Do&apos;s & Don&apos;ts Bible</h1>
        <p className="text-sm text-zinc-400">
          Define hard boundaries and best-practice rules Sauti must always follow.
        </p>
      </div>

      {error && (
        <Card className="border-red-300/30 bg-red-300/10">
          <CardContent className="flex items-center gap-2 pt-6 text-red-100">
            <AlertTriangle className="h-4 w-4" />
            Failed to load rules.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-indigo-300" />
            Rule Editor
          </CardTitle>
          <CardDescription>
            Add categorized rules, set priority, and reorder execution priority.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void saveRules()} disabled={isSaving || isLoading}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Rules
          </Button>
          {notice ? <p className="text-xs text-emerald-300">{notice}</p> : null}
          {saveError ? <p className="text-xs text-red-300">{saveError}</p> : null}
        </CardContent>
      </Card>

      {isLoading ? <p className="text-sm text-zinc-400">Loading rule categories...</p> : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-emerald-200">The Do&apos;s (Always)</h2>
        {dos.map((category, categoryIndex) => (
          <RuleCategoryCard
            key={`dos-${category.key}`}
            category={category}
            accentClassName="border-emerald-300/20 bg-emerald-300/5"
            onAdd={() => addRule(setDos, categoryIndex)}
            onUpdate={(itemIndex, patch) => updateCategoryRule(setDos, categoryIndex, itemIndex, patch)}
            onDelete={(itemIndex) => deleteRule(setDos, categoryIndex, itemIndex)}
            onMove={(itemIndex, direction) => moveRule(setDos, categoryIndex, itemIndex, direction)}
          />
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-red-200">The Don&apos;ts (Never)</h2>
        {donts.map((category, categoryIndex) => (
          <RuleCategoryCard
            key={`donts-${category.key}`}
            category={category}
            accentClassName="border-red-300/20 bg-red-300/5"
            onAdd={() => addRule(setDonts, categoryIndex)}
            onUpdate={(itemIndex, patch) =>
              updateCategoryRule(setDonts, categoryIndex, itemIndex, patch)
            }
            onDelete={(itemIndex) => deleteRule(setDonts, categoryIndex, itemIndex)}
            onMove={(itemIndex, direction) =>
              moveRule(setDonts, categoryIndex, itemIndex, direction)
            }
          />
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-amber-200">Caution Zone (Context-Dependent)</h2>
        {caution.map((category, categoryIndex) => (
          <RuleCategoryCard
            key={`caution-${category.key}`}
            category={category}
            accentClassName="border-amber-300/20 bg-amber-300/5"
            onAdd={() => addRule(setCaution, categoryIndex)}
            onUpdate={(itemIndex, patch) =>
              updateCategoryRule(setCaution, categoryIndex, itemIndex, patch)
            }
            onDelete={(itemIndex) => deleteRule(setCaution, categoryIndex, itemIndex)}
            onMove={(itemIndex, direction) =>
              moveRule(setCaution, categoryIndex, itemIndex, direction)
            }
          />
        ))}
      </section>
    </div>
  );
}

function RuleCategoryCard({
  category,
  accentClassName,
  onAdd,
  onUpdate,
  onDelete,
  onMove,
}: {
  category: RuleCategory;
  accentClassName: string;
  onAdd: () => void;
  onUpdate: (itemIndex: number, patch: Partial<RuleItem>) => void;
  onDelete: (itemIndex: number) => void;
  onMove: (itemIndex: number, direction: "up" | "down") => void;
}) {
  return (
    <Card className={accentClassName}>
      <CardHeader>
        <CardTitle className="text-base text-zinc-100">{category.label}</CardTitle>
        <CardDescription>{category.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {category.items.map((item, itemIndex) => (
          <div
            key={`${category.key}-${itemIndex}`}
            className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3"
          >
            <div className="grid gap-2 md:grid-cols-[1.6fr_1fr_140px_auto]">
              <Input
                value={item.rule}
                onChange={(event) => onUpdate(itemIndex, { rule: event.target.value })}
                placeholder="Rule text"
              />
              <Input
                value={item.explanation ?? ""}
                onChange={(event) => onUpdate(itemIndex, { explanation: event.target.value })}
                placeholder="Explanation"
              />
              <select
                className="h-10 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm text-zinc-100"
                value={item.priority}
                onChange={(event) =>
                  onUpdate(itemIndex, {
                    priority: Number(event.target.value) as 1 | 2 | 3,
                  })
                }
              >
                <option value={1}>Critical (1)</option>
                <option value={2}>Important (2)</option>
                <option value={3}>Preferred (3)</option>
              </select>
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="outline"
                  className="h-9 w-9 px-0"
                  onClick={() => onMove(itemIndex, "up")}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-9 w-9 px-0"
                  onClick={() => onMove(itemIndex, "down")}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button variant="outline" className="h-10 w-10 px-0" onClick={() => onDelete(itemIndex)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-zinc-400">Priority: {priorityLabel(item.priority)}</p>
          </div>
        ))}
        <Button variant="outline" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Add rule
        </Button>
      </CardContent>
    </Card>
  );
}
