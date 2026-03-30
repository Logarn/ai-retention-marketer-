import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  customerId: z.string().optional(),
  email: z.string().email().optional(),
  eventType: z.string(),
  properties: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  try {
    const payload = bodySchema.parse(await request.json());
    let customerId = payload.customerId;

    if (!customerId && payload.email) {
      const customer = await prisma.customer.findUnique({ where: { email: payload.email } });
      customerId = customer?.id;
    }

    if (!customerId) {
      return NextResponse.json({ error: "customerId or known email is required" }, { status: 400 });
    }

    const properties = (payload.properties ?? {}) as Prisma.InputJsonValue;
    const created = await prisma.customerEvent.create({
      data: {
        customerId,
        eventType: payload.eventType,
        properties,
        createdAt: payload.createdAt ? new Date(payload.createdAt) : undefined,
      },
    });

    return NextResponse.json({ event: created }, { status: 201 });
  } catch (error) {
    console.error("/api/webhooks/events POST error", error);
    return NextResponse.json({ error: "Invalid event payload" }, { status: 400 });
  }
}
