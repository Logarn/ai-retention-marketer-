"use client";

import { use } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FLOW_TEMPLATES } from "@/lib/constants";

export default function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit Campaign Flow</h1>
        <p className="text-sm text-slate-500 mt-1">
          Campaign ID: <span className="font-mono">{id}</span>
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Flow Builder (Template Editor)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">
            Drag-and-drop flow editing can be layered on top of this data model. For now, select from pre-built
            templates and update node content via AI composer.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {FLOW_TEMPLATES.map((template) => (
              <div key={template.name} className="rounded border p-3">
                <p className="text-sm font-medium">{template.name}</p>
                <p className="text-xs text-slate-500">
                  {template.nodes.length} nodes · {template.edges.length} edges
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

