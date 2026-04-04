"use client";

import { Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function BrainCompetitorsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Competitors</h1>
        <p className="text-sm text-zinc-400">
          Track competitor positioning, messaging patterns, and campaign angles.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-orange-300" />
            Competitor Intelligence
          </CardTitle>
          <CardDescription>
            This section is ready for competitor crawl and comparison workflows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-300">
            Add competitor domains and benchmark messaging themes, offers, and positioning here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
