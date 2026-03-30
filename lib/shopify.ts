import crypto from "crypto";
import { ApiVersion } from "@shopify/shopify-api";
import { prisma } from "@/lib/prisma";

function getStoreDomain() {
  const store = process.env.SHOPIFY_STORE_NAME;
  if (!store) throw new Error("SHOPIFY_STORE_NAME is not configured.");
  return `${store}.myshopify.com`;
}

function normalizePhone(phone?: string | null) {
  if (!phone) return null;
  return phone.trim() || null;
}

export function getShopifyAuthUrl() {
  return getShopifyAuthUrlWithBase(process.env.NEXTAUTH_URL ?? "");
}

export function getShopifyAuthUrlWithBase(baseUrl: string, state?: string) {
  const shop = getStoreDomain();
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const scopes = ["read_customers", "read_orders", "read_products"].join(",");
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const redirectUri = `${normalizedBase}/api/auth/shopify`;
  if (!clientId) throw new Error("SHOPIFY_CLIENT_ID is not configured.");
  const nonce = state ?? crypto.randomUUID();
  return `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${encodeURIComponent(
    scopes,
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}`;
}

export async function exchangeShopifyCodeForToken(code: string) {
  const shop = getStoreDomain();
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Shopify credentials missing.");
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to exchange Shopify code: ${text}`);
  }
  const payload = (await response.json()) as { access_token: string };
  return payload.access_token;
}

type ShopifySyncResult = {
  customersUpserted: number;
  ordersUpserted: number;
  productsUpserted: number;
};

async function fetchAllFromShopify(token: string) {
  const shop = getStoreDomain();
  const base = `https://${shop}/admin/api/${ApiVersion.July25}`;
  const [customersResp, ordersResp, productsResp] = await Promise.all([
    fetch(`${base}/customers.json?limit=250`, {
      headers: { "X-Shopify-Access-Token": token },
    }),
    fetch(`${base}/orders.json?status=any&limit=250`, {
      headers: { "X-Shopify-Access-Token": token },
    }),
    fetch(`${base}/products.json?limit=250`, {
      headers: { "X-Shopify-Access-Token": token },
    }),
  ]);

  if (!customersResp.ok || !ordersResp.ok || !productsResp.ok) {
    throw new Error("Failed to pull one or more Shopify resources.");
  }

  const customers = ((await customersResp.json()) as { customers: unknown[] }).customers as Array<{
    id: number;
    email?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    created_at?: string;
  }>;
  const orders = ((await ordersResp.json()) as { orders: unknown[] }).orders as Array<{
    id: number;
    order_number: number;
    email?: string;
    customer?: { id?: number; email?: string };
    total_price?: string;
    financial_status?: string;
    created_at?: string;
    processed_at?: string;
    line_items?: Array<{
      id: number;
      product_id?: number;
      sku?: string;
      quantity?: number;
      price?: string;
      title?: string;
    }>;
  }>;
  const products = ((await productsResp.json()) as { products: unknown[] }).products as Array<{
    id: number;
    title: string;
    product_type?: string;
    image?: { src?: string };
    variants?: Array<{ sku?: string; price?: string }>;
  }>;

  return { customers, orders, products };
}

export async function syncShopifyData(token: string): Promise<ShopifySyncResult> {
  if (!token) throw new Error("Shopify access token is missing. Connect Shopify first.");

  const { customers, orders, products } = await fetchAllFromShopify(token);

  let customersUpserted = 0;
  let productsUpserted = 0;
  let ordersUpserted = 0;

  const productByShopifyId = new Map<string, string>();

  for (const sp of products) {
    const sku =
      sp.variants?.find((v) => v.sku && v.sku.trim())?.sku?.trim() ||
      `SHOPIFY-${sp.id}`;
    const price = Number(sp.variants?.[0]?.price || 0);
    const upserted = await prisma.product.upsert({
      where: { sku },
      update: {
        name: sp.title,
        category: sp.product_type || null,
        imageUrl: sp.image?.src || null,
        price: Number.isFinite(price) ? price : 0,
      },
      create: {
        sku,
        name: sp.title,
        category: sp.product_type || null,
        imageUrl: sp.image?.src || null,
        price: Number.isFinite(price) ? price : 0,
      },
    });
    productsUpserted += 1;
    productByShopifyId.set(String(sp.id), upserted.id);
  }

  for (const sc of customers) {
    const email = (sc.email || "").trim().toLowerCase();
    if (!email) continue;
    await prisma.customer.upsert({
      where: { email },
      update: {
        firstName: sc.first_name || null,
        lastName: sc.last_name || null,
        phone: normalizePhone(sc.phone),
      },
      create: {
        email,
        firstName: sc.first_name || null,
        lastName: sc.last_name || null,
        phone: normalizePhone(sc.phone),
        createdAt: sc.created_at ? new Date(sc.created_at) : undefined,
      },
    });
    customersUpserted += 1;
  }

  for (const so of orders) {
    const customerEmail = (so.email || so.customer?.email || "").trim().toLowerCase();
    if (!customerEmail) continue;
    const customer = await prisma.customer.findUnique({ where: { email: customerEmail } });
    if (!customer) continue;

    const orderNumber = `SHOPIFY-${so.order_number || so.id}`;
    const amount = Number(so.total_price || 0);
    const existing = await prisma.order.findFirst({
      where: { orderNumber, customerId: customer.id },
      select: { id: true },
    });

    if (existing) {
      await prisma.order.update({
        where: { id: existing.id },
        data: {
          totalAmount: Number.isFinite(amount) ? amount : 0,
          status: so.financial_status || "paid",
          createdAt: so.created_at ? new Date(so.created_at) : undefined,
          deliveredAt: so.processed_at ? new Date(so.processed_at) : null,
        },
      });

      await prisma.orderItem.deleteMany({ where: { orderId: existing.id } });
      for (const line of so.line_items || []) {
        const productId =
          (line.product_id ? productByShopifyId.get(String(line.product_id)) : undefined) ||
          (await prisma.product
            .upsert({
              where: { sku: line.sku?.trim() || `SHOPIFY-LINE-${line.id}` },
              update: {
                name: line.title || `Shopify Product ${line.id}`,
                price: Number(line.price || 0) || 0,
              },
              create: {
                sku: line.sku?.trim() || `SHOPIFY-LINE-${line.id}`,
                name: line.title || `Shopify Product ${line.id}`,
                price: Number(line.price || 0) || 0,
              },
            })
            .then((p) => p.id));

        if (!productId) continue;
        await prisma.orderItem.create({
          data: {
            orderId: existing.id,
            productId,
            quantity: Number(line.quantity || 1),
            price: Number(line.price || 0) || 0,
          },
        });
      }
    } else {
      const created = await prisma.order.create({
        data: {
          customerId: customer.id,
          orderNumber,
          totalAmount: Number.isFinite(amount) ? amount : 0,
          status: so.financial_status || "paid",
          createdAt: so.created_at ? new Date(so.created_at) : undefined,
          deliveredAt: so.processed_at ? new Date(so.processed_at) : null,
        },
      });

      for (const line of so.line_items || []) {
        const productId =
          (line.product_id ? productByShopifyId.get(String(line.product_id)) : undefined) ||
          (await prisma.product
            .upsert({
              where: { sku: line.sku?.trim() || `SHOPIFY-LINE-${line.id}` },
              update: {
                name: line.title || `Shopify Product ${line.id}`,
                price: Number(line.price || 0) || 0,
              },
              create: {
                sku: line.sku?.trim() || `SHOPIFY-LINE-${line.id}`,
                name: line.title || `Shopify Product ${line.id}`,
                price: Number(line.price || 0) || 0,
              },
            })
            .then((p) => p.id));
        if (!productId) continue;
        await prisma.orderItem.create({
          data: {
            orderId: created.id,
            productId,
            quantity: Number(line.quantity || 1),
            price: Number(line.price || 0) || 0,
          },
        });
      }
    }

    ordersUpserted += 1;
  }

  // Recompute cached customer aggregates after order sync.
  const allCustomers = await prisma.customer.findMany({
    select: { id: true, orders: { select: { totalAmount: true, createdAt: true }, orderBy: { createdAt: "asc" } } },
  });
  for (const customer of allCustomers) {
    const totalOrders = customer.orders.length;
    const totalSpent = customer.orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const avgOrderValue = totalOrders ? totalSpent / totalOrders : 0;
    const firstOrderDate = customer.orders[0]?.createdAt ?? null;
    const lastOrderDate = customer.orders[totalOrders - 1]?.createdAt ?? null;
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        totalOrders,
        totalSpent: Number(totalSpent.toFixed(2)),
        avgOrderValue: Number(avgOrderValue.toFixed(2)),
        firstOrderDate,
        lastOrderDate,
      },
    });
  }

  return { customersUpserted, ordersUpserted, productsUpserted };
}
