import crypto from "crypto";
import { ApiVersion } from "@shopify/shopify-api";
import { prisma } from "@/lib/prisma";

export const DIRECT_SHOPIFY_GRAPHQL_ENDPOINT =
  "https://drrachaelinstitute.myshopify.com/admin/api/2024-01/graphql.json";
export const DIRECT_SHOPIFY_REST_CUSTOMERS_ENDPOINT_TEMPLATE =
  "https://{SHOPIFY_CLIENT_ID}:{SHOPIFY_CLIENT_SECRET}@drrachaelinstitute.myshopify.com/admin/api/2024-01/customers.json";
export const SHOPIFY_CALLBACK_PATH = "/api/auth/shopify/callback";

function getStoreDomain() {
  // Defaults to the primary store used in this project if env is missing.
  const store = process.env.SHOPIFY_STORE_NAME || "drrachaelinstitute";
  if (!store) throw new Error("SHOPIFY_STORE_NAME is not configured.");
  return `${store}.myshopify.com`;
}

export function getShopifyConfigDebug() {
  const storeName = process.env.SHOPIFY_STORE_NAME || "drrachaelinstitute";
  const endpoint = `https://${storeName}.myshopify.com/admin/api/2024-01/graphql.json`;
  return {
    storeName,
    endpoint,
    hasClientId: Boolean(process.env.SHOPIFY_CLIENT_ID),
    hasClientSecret: Boolean(process.env.SHOPIFY_CLIENT_SECRET),
    hasAccessToken: Boolean(process.env.SHOPIFY_ACCESS_TOKEN),
  };
}

function normalizePhone(phone?: string | null) {
  if (!phone) return null;
  return phone.trim() || null;
}

export function getShopifyAuthUrl() {
  return getShopifyAuthUrlWithBase(process.env.NEXTAUTH_URL ?? "");
}

export function getShopifyCallbackUrlWithBase(baseUrl: string) {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  return `${normalizedBase}${SHOPIFY_CALLBACK_PATH}`;
}

export function getShopifyAuthUrlWithBase(baseUrl: string, state?: string) {
  const shop = getStoreDomain();
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const scopes = ["read_customers", "read_orders", "read_products"].join(",");
  const redirectUri = getShopifyCallbackUrlWithBase(baseUrl);
  if (!clientId) throw new Error("SHOPIFY_CLIENT_ID is not configured.");
  const nonce = state ?? crypto.randomUUID();
  return `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${encodeURIComponent(
    scopes,
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}&shop=${encodeURIComponent(shop)}`;
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

type ShopifyRestPayload = {
  customers: Array<{
    id: number;
    email?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    created_at?: string;
  }>;
  orders: Array<{
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
  products: Array<{
    id: number;
    title: string;
    product_type?: string;
    image?: { src?: string };
    variants?: Array<{ sku?: string; price?: string }>;
  }>;
};

function parseShopifyNumericId(rawId?: string | null): number {
  if (!rawId) return 0;
  const parsed = rawId.match(/\/(\d+)$/)?.[1] ?? rawId;
  const asNumber = Number(parsed);
  return Number.isFinite(asNumber) ? asNumber : 0;
}

async function fetchAllFromShopifyRest(token: string): Promise<ShopifyRestPayload> {
  const shop = getStoreDomain();
  const base = `https://${shop}/admin/api/${ApiVersion.July25}`;
  console.log("[shopify] Starting REST sync fetch", { shop, base });
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
    const [customersText, ordersText, productsText] = await Promise.all([
      customersResp.text(),
      ordersResp.text(),
      productsResp.text(),
    ]);
    throw new Error(
      `REST fetch failed (customers=${customersResp.status}, orders=${ordersResp.status}, products=${productsResp.status}). ` +
        `Details: customers=${customersText.slice(0, 220)} orders=${ordersText.slice(0, 220)} products=${productsText.slice(0, 220)}`,
    );
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

async function fetchAllFromShopifyDirectCredentials(): Promise<ShopifyRestPayload> {
  const store = process.env.SHOPIFY_STORE_NAME || "drrachaelinstitute";
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Direct Shopify credentials missing (SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET).");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const base = `https://${store}.myshopify.com/admin/api/2024-01`;
  console.log("[shopify] Starting direct credentials REST fetch", {
    store,
    endpointTemplate: DIRECT_SHOPIFY_REST_CUSTOMERS_ENDPOINT_TEMPLATE,
  });

  const [customersResp, ordersResp, productsResp] = await Promise.all([
    fetch(`${base}/customers.json?limit=250`, {
      headers: { Authorization: `Basic ${basicAuth}` },
    }),
    fetch(`${base}/orders.json?status=any&limit=250`, {
      headers: { Authorization: `Basic ${basicAuth}` },
    }),
    fetch(`${base}/products.json?limit=250`, {
      headers: { Authorization: `Basic ${basicAuth}` },
    }),
  ]);

  if (!customersResp.ok || !ordersResp.ok || !productsResp.ok) {
    const [customersText, ordersText, productsText] = await Promise.all([
      customersResp.text(),
      ordersResp.text(),
      productsResp.text(),
    ]);
    const statusSummary = `customers=${customersResp.status}, orders=${ordersResp.status}, products=${productsResp.status}`;
    if (
      customersResp.status === 401 ||
      ordersResp.status === 401 ||
      productsResp.status === 401
    ) {
      throw new Error(
        `Direct credential authentication rejected by Shopify (${statusSummary}). ` +
          "Use Connect Shopify (OAuth) or configure SHOPIFY_ACCESS_TOKEN.",
      );
    }
    throw new Error(
      `Direct credentials REST fetch failed (${statusSummary}). ` +
        `Details: customers=${customersText.slice(0, 220)} orders=${ordersText.slice(0, 220)} products=${productsText.slice(0, 220)}`,
    );
  }

  const customers = ((await customersResp.json()) as { customers: unknown[] }).customers as ShopifyRestPayload["customers"];
  const orders = ((await ordersResp.json()) as { orders: unknown[] }).orders as ShopifyRestPayload["orders"];
  const products = ((await productsResp.json()) as { products: unknown[] }).products as ShopifyRestPayload["products"];

  return { customers, orders, products };
}

async function fetchAllFromShopifyGraphql(token: string): Promise<ShopifyRestPayload> {
  const shop = getStoreDomain();
  const endpoint = `https://${shop}/admin/api/2024-01/graphql.json`;
  const query = `
    query DirectSyncData {
      customers(first: 250) {
        edges {
          node {
            id
            email
            firstName
            lastName
            phone
            createdAt
          }
        }
      }
      orders(first: 250, query: "status:any") {
        edges {
          node {
            id
            name
            email
            displayFinancialStatus
            createdAt
            processedAt
            customer {
              id
              email
            }
            totalPriceSet {
              shopMoney {
                amount
              }
            }
            lineItems(first: 100) {
              edges {
                node {
                  id
                  title
                  quantity
                  sku
                  originalUnitPriceSet {
                    shopMoney {
                      amount
                    }
                  }
                  variant {
                    product {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      }
      products(first: 250) {
        edges {
          node {
            id
            title
            productType
            featuredImage {
              url
            }
            variants(first: 20) {
              edges {
                node {
                  sku
                  price
                }
              }
            }
          }
        }
      }
    }
  `;

  console.log("[shopify] Starting GraphQL fallback fetch", { shop, endpoint });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query }),
  });

  const payload = (await response.json()) as {
    errors?: Array<{ message?: string }>;
    data?: {
      customers?: { edges?: Array<{ node?: Record<string, unknown> }> };
      orders?: { edges?: Array<{ node?: Record<string, unknown> }> };
      products?: { edges?: Array<{ node?: Record<string, unknown> }> };
    };
  };

  if (!response.ok || payload.errors?.length) {
    throw new Error(
      `GraphQL fetch failed (${response.status}): ${JSON.stringify(payload.errors || payload).slice(0, 380)}`,
    );
  }

  const customers = (payload.data?.customers?.edges ?? []).map((edge) => {
    const node = edge.node as {
      id?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      createdAt?: string;
    };
    return {
      id: parseShopifyNumericId(node.id),
      email: node.email,
      first_name: node.firstName,
      last_name: node.lastName,
      phone: node.phone,
      created_at: node.createdAt,
    };
  });

  const products = (payload.data?.products?.edges ?? []).map((edge) => {
    const node = edge.node as {
      id?: string;
      title?: string;
      productType?: string;
      featuredImage?: { url?: string };
      variants?: { edges?: Array<{ node?: { sku?: string; price?: string } }> };
    };
    return {
      id: parseShopifyNumericId(node.id),
      title: node.title || "Untitled Product",
      product_type: node.productType,
      image: { src: node.featuredImage?.url },
      variants: (node.variants?.edges ?? []).map((variantEdge) => ({
        sku: variantEdge.node?.sku,
        price: variantEdge.node?.price,
      })),
    };
  });

  const orders = (payload.data?.orders?.edges ?? []).map((edge, index) => {
    const node = edge.node as {
      id?: string;
      name?: string;
      email?: string;
      displayFinancialStatus?: string;
      createdAt?: string;
      processedAt?: string;
      customer?: { id?: string; email?: string };
      totalPriceSet?: { shopMoney?: { amount?: string } };
      lineItems?: {
        edges?: Array<{
          node?: {
            id?: string;
            title?: string;
            quantity?: number;
            sku?: string;
            originalUnitPriceSet?: { shopMoney?: { amount?: string } };
            variant?: { product?: { id?: string } };
          };
        }>;
      };
    };

    const orderNumberFromName = Number(node.name?.replace(/[^0-9]/g, "") || 0);
    return {
      id: parseShopifyNumericId(node.id),
      order_number:
        Number.isFinite(orderNumberFromName) && orderNumberFromName > 0
          ? orderNumberFromName
          : index + 1,
      email: node.email,
      customer: {
        id: parseShopifyNumericId(node.customer?.id),
        email: node.customer?.email,
      },
      total_price: node.totalPriceSet?.shopMoney?.amount,
      financial_status: node.displayFinancialStatus,
      created_at: node.createdAt,
      processed_at: node.processedAt,
      line_items: (node.lineItems?.edges ?? []).map((lineEdge) => ({
        id: parseShopifyNumericId(lineEdge.node?.id),
        product_id: parseShopifyNumericId(lineEdge.node?.variant?.product?.id) || undefined,
        sku: lineEdge.node?.sku,
        quantity: lineEdge.node?.quantity,
        price: lineEdge.node?.originalUnitPriceSet?.shopMoney?.amount,
        title: lineEdge.node?.title,
      })),
    };
  });

  return { customers, orders, products };
}

async function persistShopifyData(data: ShopifyRestPayload): Promise<ShopifySyncResult> {
  const { customers, orders, products } = data;
  console.log("[shopify] Data fetched", {
    customers: customers.length,
    orders: orders.length,
    products: products.length,
  });

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

export async function syncShopifyData(token: string): Promise<ShopifySyncResult> {
  if (!token) throw new Error("Shopify access token is missing. Connect Shopify first.");

  const data = await (async () => {
    try {
      return await fetchAllFromShopifyRest(token);
    } catch (restError) {
      console.warn("[shopify] REST sync fetch failed, trying GraphQL fallback", restError);
      return await fetchAllFromShopifyGraphql(token);
    }
  })();

  return persistShopifyData(data);
}

export async function syncShopifyDataDirectCredentials(): Promise<ShopifySyncResult> {
  const data = await fetchAllFromShopifyDirectCredentials();
  return persistShopifyData(data);
}
