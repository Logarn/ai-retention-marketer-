import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId, orderNumber, totalAmount, status = "delivered", items = [] } = body;
    if (!customerId || !orderNumber || typeof totalAmount !== "number") {
      return NextResponse.json({ error: "customerId, orderNumber, totalAmount required" }, { status: 400 });
    }

    const order = await prisma.order.create({
      data: {
        customerId,
        orderNumber,
        totalAmount,
        status,
        deliveredAt: status === "delivered" ? new Date() : null,
        items: {
          create: items.map((item: { productId: string; quantity: number; price: number }) => ({
            productId: item.productId,
            quantity: item.quantity ?? 1,
            price: item.price ?? 0,
          })),
        },
      },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to process order webhook", details: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
