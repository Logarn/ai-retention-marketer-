"use client";

import Link from "next/link";
import useSWR from "swr";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SEGMENT_LABELS } from "@/lib/constants";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);
  return response.json();
};

type Customer = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  segment: string | null;
  churnRiskScore: number | null;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: string | null;
};

export function CustomersClient() {
  const {
    data: payload,
    error,
    isLoading,
  } = useSWR<{ data: Customer[] }>("/api/customers?page=1&pageSize=200", fetcher);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="text-sm text-slate-500">Filter and inspect customer health and churn risk.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Input placeholder="Search by name or email" disabled />
          <Select disabled>
            <option>All segments</option>
          </Select>
          <div className="text-xs text-slate-500">Interactive filters can be wired to query params.</div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-4 w-4" />
            Failed to load customer list.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Customer Directory</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !payload ? (
            <Skeleton className="h-80" />
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Segment</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Total Spent</TableHead>
                    <TableHead>Churn Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payload.data.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">
                        <Link href={`/customers/${customer.id}`} className="hover:underline">
                          {[customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Unknown"}
                        </Link>
                      </TableCell>
                      <TableCell>{customer.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {SEGMENT_LABELS[customer.segment ?? "unclassified"] ?? "Unclassified"}
                        </Badge>
                      </TableCell>
                      <TableCell>{customer.totalOrders}</TableCell>
                      <TableCell>${customer.totalSpent.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            (customer.churnRiskScore ?? 0) >= 70
                              ? "destructive"
                              : (customer.churnRiskScore ?? 0) >= 50
                                ? "warning"
                                : "success"
                          }
                        >
                          {customer.churnRiskScore ?? 0}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
