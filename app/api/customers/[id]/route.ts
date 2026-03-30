import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteCtx = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  context: RouteCtx,
) {
  try {
    const { id } = await context.params;
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        orders: {
          include: {
            items: {
              include: {
                product: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        events: {
          orderBy: { createdAt: "desc" },
          take: 100,
        },
        campaignReceipts: {
          include: {
            campaign: true,
          },
          orderBy: { sentAt: "desc" },
          take: 50,
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json(customer);
  } catch (error) {
    console.error("customers/[id] GET error", error);
    return NextResponse.json({ error: "Failed to fetch customer" }, { status: 500 });
  }
}
