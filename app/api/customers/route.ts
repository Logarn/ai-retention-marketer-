import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page") ?? "1");
    const pageSize = Math.min(100, Number(searchParams.get("pageSize") ?? "25"));
    const segment = searchParams.get("segment");
    const q = searchParams.get("q");

    const where = {
      ...(segment ? { segment } : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" as const } },
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy: { totalSpent: "desc" },
        skip: (Math.max(1, page) - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      data: customers,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to list customers", detail: String(error) },
      { status: 500 },
    );
  }
}
