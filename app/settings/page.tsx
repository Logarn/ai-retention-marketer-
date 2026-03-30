"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500">Configure integrations and brand voice defaults.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Brand Voice</CardTitle>
          <CardDescription>
            This text is used to prefill AI generation prompts for email and SMS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input defaultValue="Friendly, helpful, and premium but approachable." />
          <Button>Save Brand Voice</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>Connect delivery providers and ecommerce data sources.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="rounded border p-3">
            <h3 className="text-sm font-medium">Resend (Email)</h3>
            <p className="text-xs text-slate-500 mt-1">Mock mode enabled by default.</p>
            <Button variant="outline" className="mt-3">
              Configure
            </Button>
          </div>
          <div className="rounded border p-3">
            <h3 className="text-sm font-medium">Twilio (SMS)</h3>
            <p className="text-xs text-slate-500 mt-1">Mock mode enabled by default.</p>
            <Button variant="outline" className="mt-3">
              Configure
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
