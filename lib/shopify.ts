import crypto from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/** Shopify Admin REST API version (keep in sync with test-shopify route). */
export const SHOPIFY_API_VERSION = "2025-01";
export const SHOPIFY_CALLBACK_PATH = "/api/auth/shopify/callback";

export type ShopifySyncMode = "full" | "incremental";

export type ShopifySyncSummary = {
  mode: ShopifySyncMode;
  customersFetched: number;
  ordersFetched: number;
  productsFetched: number;
  customersUpserted: number;
  ordersUpserted: number;
  productsUpserted: number;
  ordersSinceAt: Date | null;
  productsSinceAt: Date | null;
  customersSinceAt: Date | null;
  warnings: string[];
};

type ShopifyCustomerPayload = {
  id?: number;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  created_at?: string;
  updated_at?: string;
};

type ShopifyOrderPayload = {
  id?: number;
  name?: string;
  order_number?: number;
  email?: string;
  customer?: { id?: number; email?: string };
  total_price?: string;
  financial_status?: string;
  created_at?: string;
  processed_at?: string;
  updated_at?: string;
  line_items?: Array<{
    id?: number;
    product_id?: number;
    sku?: string;
    quantity?: number;
    price?: string;
    title?: string;
  }>;
};

type ShopifyProductPayload = {
  id?: number;
  title?: string;
  product_type?: string;
  image?: { src?: string };
  variants?: Array<{ sku?: string; price?: string }>;
  updated_at?: string;
};

class ShopifyApiError extends Error {
  status: number;
  bodySnippet: string;

  constructor(message: string, status: number, bodySnippet: string) {
    super(message);
    this.status = status;
    this.bodySnippet = bodySnippet;
  }
}

function getStoreName() {
  const storeName = process.env.SHOPIFY_STORE_NAME?.trim();
  if (!storeName) throw new Error("SHOPIFY_STORE_NAME is not configured.");
  return storeName.replace(/\.myshopify\.com$/i, "");
}

function getStoreDomain() {
  return `${getStoreName()}.myshopify.com`;
}

function getShopifyApiBase() {
  return `https://${getStoreDomain()}/admin/api/${SHOPIFY_API_VERSION}`;
}

function parseIsoDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIsoParam(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function getNextLink(linkHeader: string | null) {
  if (!linkHeader) return null;
  const parts = linkHeader.split(",");
  for (const part of parts) {
    if (!/rel="next"/.test(part)) continue;
    const match = part.match(/<([^>]+)>/);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function fetchShopifyPage<T>(
  url: string,
  token: string,
  collectionKey: string,
): Promise<{ items: T[]; nextUrl: string | null }> {
  const tokenPrefix = token.length >= 8 ? token.substring(0, 8) : token;
  console.log(
    "[shopify] HTTP GET",
    url,
    "| X-Shopify-Access-Token prefix:",
    tokenPrefix,
    "| API version:",
    SHOPIFY_API_VERSION,
  );

  const response = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": token,
    },
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    console.error(
      "[shopify] request failed:",
      collectionKey,
      response.status,
      "| url:",
      url,
      "| body snippet:",
      body.slice(0, 200),
    );
    throw new ShopifyApiError(`Shopify ${collectionKey} fetch failed (${response.status})`, response.status, body);
  }

  const json = (await response.json()) as Record<string, unknown>;
  const items = Array.isArray(json[collectionKey]) ? (json[collectionKey] as T[]) : [];
  return {
    items,
    nextUrl: getNextLink(response.headers.get("link")),
  };
}

async function fetchShopifyCollection<T>(
  resource: "orders" | "products" | "customers",
  token: string,
  opts?: { updatedAtMin?: Date | null; extraParams?: Record<string, string> },
): Promise<T[]> {
  const baseUrl = new URL(`${getShopifyApiBase()}/${resource}.json`);
  baseUrl.searchParams.set("limit", "250");
  if (opts?.updatedAtMin) {
    baseUrl.searchParams.set("updated_at_min", opts.updatedAtMin.toISOString());
  }
  for (const [key, value] of Object.entries(opts?.extraParams ?? {})) {
    baseUrl.searchParams.set(key, value);
  }

  console.log(
    "[shopify] fetchShopifyCollection start:",
    resource,
    "| first URL:",
    baseUrl.toString(),
    "| store:",
    getStoreDomain(),
  );

  const all: T[] = [];
  let pageUrl: string | null = baseUrl.toString();
  let pageCount = 0;

  while (pageUrl && pageCount < 30) {
    const page: { items: T[]; nextUrl: string | null } = await fetchShopifyPage<T>(
      pageUrl,
      token,
      resource,
    );
    all.push(...page.items);
    pageUrl = page.nextUrl;
    pageCount += 1;
  }

  return all;
}

function normalizePhone(phone?: string | null) {
  if (!phone) return null;
  const trimmed = phone.trim();
  return trimmed.length ? trimmed : null;
}

function parseMoney(value?: string | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseIntSafe(value?: number | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function maxByDate(values: Array<string | undefined>, fallback: Date | null) {
  let maxDate = fallback;
  for (const value of values) {
    const parsed = parseIsoDate(value);
    if (!parsed) continue;
    if (!maxDate || parsed.getTime() > maxDate.getTime()) {
      maxDate = parsed;
    }
  }
  return maxDate;
}

async function recomputeCustomerAggregates(customerIds: string[]) {
  if (!customerIds.length) return;

  const customers = await prisma.customer.findMany({
    where: { id: { in: customerIds } },
    select: {
      id: true,
      orders: {
        select: { totalAmount: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  for (const customer of customers) {
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
}

async function upsertProduct(sp: ShopifyProductPayload) {
  const externalId = sp.id ? String(sp.id) : null;
  const sku =
    sp.variants?.find((variant) => variant.sku && variant.sku.trim())?.sku?.trim() ?? null;

  const price = parseMoney(sp.variants?.[0]?.price ?? "0");
  const data = {
    sku,
    name: sp.title?.trim() || "Untitled Shopify Product",
    category: sp.product_type || null,
    imageUrl: sp.image?.src || null,
    price,
  };

  if (externalId) {
    return prisma.product.upsert({
      where: { externalId },
      update: data,
      create: { ...data, externalId },
    });
  }

  // Rare: Shopify payloads without product id — avoid SKU as a unique key (duplicates / blanks).
  return prisma.product.create({
    data: {
      ...data,
      externalId: null,
    },
  });
}

async function upsertCustomer(sc: ShopifyCustomerPayload) {
  const externalId = sc.id ? String(sc.id) : null;
  const email = (sc.email || "").trim().toLowerCase();
  const fallbackEmail = externalId ? `shopify-${externalId}@placeholder.local` : "";
  const resolvedEmail = email || fallbackEmail;
  if (!resolvedEmail) return null;

  const data = {
    externalId,
    email: resolvedEmail,
    firstName: sc.first_name || null,
    lastName: sc.last_name || null,
    phone: normalizePhone(sc.phone),
    createdAt: parseIsoDate(sc.created_at) ?? undefined,
  };

  if (externalId) {
    return prisma.customer.upsert({
      where: { externalId },
      update: {
        email: resolvedEmail,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
      },
      create: data,
    });
  }

  return prisma.customer.upsert({
    where: { email: resolvedEmail },
    update: {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
    },
    create: data,
  });
}

async function resolveCustomerForOrder(order: ShopifyOrderPayload) {
  const externalCustomerId = order.customer?.id ? String(order.customer.id) : null;
  const orderEmail = (order.email || order.customer?.email || "").trim().toLowerCase();
  const fallbackEmail = externalCustomerId
    ? `shopify-${externalCustomerId}@placeholder.local`
    : order.id
      ? `shopify-order-${order.id}@placeholder.local`
      : "";
  const resolvedEmail = orderEmail || fallbackEmail;
  if (!resolvedEmail) return null;

  if (externalCustomerId) {
    const byExternal = await prisma.customer.findUnique({
      where: { externalId: externalCustomerId },
    });
    if (byExternal) {
      return prisma.customer.update({
        where: { id: byExternal.id },
        data: { email: resolvedEmail },
      });
    }
  }

  const byEmail = await prisma.customer.findUnique({ where: { email: resolvedEmail } });
  if (byEmail) {
    if (externalCustomerId && !byEmail.externalId) {
      return prisma.customer.update({
        where: { id: byEmail.id },
        data: { externalId: externalCustomerId },
      });
    }
    return byEmail;
  }

  return prisma.customer.create({
    data: {
      email: resolvedEmail,
      externalId: externalCustomerId,
    },
  });
}

async function upsertOrder(
  order: ShopifyOrderPayload,
  productByExternalId: Map<string, string>,
  touchedCustomerIds: Set<string>,
) {
  if (!order.id) return null;
  const customer = await resolveCustomerForOrder(order);
  if (!customer) return null;
  touchedCustomerIds.add(customer.id);

  const externalId = String(order.id);
  const orderNumber =
    order.name?.trim() || `SHOPIFY-${order.order_number ?? parseIntSafe(order.id)}`;
  const totalAmount = parseMoney(order.total_price);

  const persisted = await prisma.order.upsert({
    where: { externalId },
    update: {
      customerId: customer.id,
      orderNumber,
      totalAmount,
      status: order.financial_status || "paid",
      createdAt: parseIsoDate(order.created_at) ?? undefined,
      deliveredAt: parseIsoDate(order.processed_at),
    },
    create: {
      externalId,
      customerId: customer.id,
      orderNumber,
      totalAmount,
      status: order.financial_status || "paid",
      createdAt: parseIsoDate(order.created_at) ?? undefined,
      deliveredAt: parseIsoDate(order.processed_at),
    },
  });

  await prisma.orderItem.deleteMany({ where: { orderId: persisted.id } });
  for (const line of order.line_items ?? []) {
    const productExternalId = line.product_id ? String(line.product_id) : null;
    let productId = productExternalId ? productByExternalId.get(productExternalId) : null;
    if (!productId) {
      const lineSku = line.sku?.trim() ?? null;
      const stableExternalId =
        productExternalId ??
        (line.id != null
          ? `shopify-lineitem-${line.id}`
          : `shopify-line-fallback-${crypto.randomUUID()}`);
      const fallbackProduct = await prisma.product.upsert({
        where: { externalId: stableExternalId },
        update: {
          sku: lineSku,
          name: line.title || "Shopify Line Item",
          price: parseMoney(line.price),
        },
        create: {
          externalId: stableExternalId,
          sku: lineSku,
          name: line.title || "Shopify Line Item",
          price: parseMoney(line.price),
        },
      });
      productId = fallbackProduct.id;
      if (productExternalId) productByExternalId.set(productExternalId, productId);
      productByExternalId.set(stableExternalId, productId);
    }

    await prisma.orderItem.create({
      data: {
        orderId: persisted.id,
        productId,
        quantity: Math.max(1, parseIntSafe(line.quantity)),
        price: parseMoney(line.price),
      },
    });
  }

  return persisted;
}

async function persistShopifyData(input: {
  customers: ShopifyCustomerPayload[];
  orders: ShopifyOrderPayload[];
  products: ShopifyProductPayload[];
}) {
  let customersUpserted = 0;
  let ordersUpserted = 0;
  let productsUpserted = 0;

  const touchedCustomerIds = new Set<string>();
  const productByExternalId = new Map<string, string>();

  for (const product of input.products) {
    const persisted = await upsertProduct(product);
    if (persisted.externalId) {
      productByExternalId.set(persisted.externalId, persisted.id);
    }
    productsUpserted += 1;
  }

  for (const customer of input.customers) {
    const persisted = await upsertCustomer(customer);
    if (persisted) {
      customersUpserted += 1;
      touchedCustomerIds.add(persisted.id);
    }
  }

  for (const order of input.orders) {
    const persisted = await upsertOrder(order, productByExternalId, touchedCustomerIds);
    if (persisted) ordersUpserted += 1;
  }

  await recomputeCustomerAggregates(Array.from(touchedCustomerIds));

  return {
    customersUpserted,
    ordersUpserted,
    productsUpserted,
  };
}

export async function syncShopifyData(input: {
  token: string;
  mode: ShopifySyncMode;
  state: {
    ordersSinceAt: Date | null;
    productsSinceAt: Date | null;
    customersSinceAt: Date | null;
  };
}) {
  const tokenPrefix =
    input.token.length >= 8 ? input.token.substring(0, 8) : input.token;
  console.log(
    "[shopify] syncShopifyData start | mode:",
    input.mode,
    "| token prefix:",
    tokenPrefix,
    "| store:",
    getStoreDomain(),
    "| API:",
    SHOPIFY_API_VERSION,
  );

  const warnings: string[] = [];
  const [orders, products] = await Promise.all([
    fetchShopifyCollection<ShopifyOrderPayload>("orders", input.token, {
      updatedAtMin: input.mode === "incremental" ? input.state.ordersSinceAt : null,
      extraParams: { status: "any" },
    }),
    fetchShopifyCollection<ShopifyProductPayload>("products", input.token, {
      updatedAtMin: input.mode === "incremental" ? input.state.productsSinceAt : null,
    }),
  ]);

  let customers: ShopifyCustomerPayload[] = [];
  try {
    customers = await fetchShopifyCollection<ShopifyCustomerPayload>("customers", input.token, {
      updatedAtMin: input.mode === "incremental" ? input.state.customersSinceAt : null,
    });
  } catch (error) {
    const denied =
      error instanceof ShopifyApiError &&
      (error.status === 403 ||
        /ACCESS_DENIED|protected customer data|Customer object/i.test(error.bodySnippet));
    if (denied) {
      warnings.push("Customer API access denied; continuing with orders/products only.");
    } else {
      throw error;
    }
  }

  const persisted = await persistShopifyData({
    customers,
    orders,
    products,
  });

  return {
    mode: input.mode,
    customersFetched: customers.length,
    ordersFetched: orders.length,
    productsFetched: products.length,
    ...persisted,
    ordersSinceAt: maxByDate(
      orders.map((order) => order.updated_at || order.created_at || order.processed_at),
      input.state.ordersSinceAt,
    ),
    productsSinceAt: maxByDate(
      products.map((product) => product.updated_at),
      input.state.productsSinceAt,
    ),
    customersSinceAt: maxByDate(
      customers.map((customer) => customer.updated_at || customer.created_at),
      input.state.customersSinceAt,
    ),
    warnings,
  } satisfies ShopifySyncSummary;
}

export async function ingestShopifyOrderWebhook(order: ShopifyOrderPayload) {
  const persisted = await persistShopifyData({
    customers: [],
    orders: [order],
    products: [],
  });
  return {
    ok: true,
    ...persisted,
  };
}

export async function ingestShopifyProductWebhook(product: ShopifyProductPayload) {
  const persisted = await persistShopifyData({
    customers: [],
    orders: [],
    products: [product],
  });
  return {
    ok: true,
    ...persisted,
  };
}

export function verifyShopifyWebhookSignature(rawBody: string, hmacHeader: string | null) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!hmacHeader) return false;

  const digest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const expected = Buffer.from(digest);
  const actual = Buffer.from(hmacHeader);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function resolveShopifyBaseUrl(input: {
  requestProtocol: string;
  requestHost: string;
  configuredNextAuthUrl?: string;
}) {
  const normalizedRequestHost = input.requestHost.replace(/^0\.0\.0\.0(?=:\d+|$)/, "localhost");
  const requestOrigin = `${input.requestProtocol}//${normalizedRequestHost}`;
  const configured = input.configuredNextAuthUrl?.trim();
  if (!configured) {
    return {
      baseUrl: requestOrigin,
      requestOrigin,
      normalizedRequestHost,
      configuredNextAuthUrl: null as string | null,
      configuredOrigin: null as string | null,
      usingConfigured: false,
      hostMatches: true,
    };
  }

  try {
    const configuredUrl = new URL(configured);
    const configuredHost = configuredUrl.host.replace(/^0\.0\.0\.0(?=:\d+|$)/, "localhost");
    const hostMatches = configuredHost === normalizedRequestHost;
    return {
      baseUrl: hostMatches ? configuredUrl.origin : requestOrigin,
      requestOrigin,
      normalizedRequestHost,
      configuredNextAuthUrl: configured,
      configuredOrigin: configuredUrl.origin,
      usingConfigured: hostMatches,
      hostMatches,
    };
  } catch {
    return {
      baseUrl: requestOrigin,
      requestOrigin,
      normalizedRequestHost,
      configuredNextAuthUrl: configured,
      configuredOrigin: null as string | null,
      usingConfigured: false,
      hostMatches: false,
    };
  }
}

export function resolveShopifyBaseUrlFromRequest(request: NextRequest) {
  return resolveShopifyBaseUrl({
    requestProtocol: request.nextUrl.protocol,
    requestHost: request.nextUrl.host,
    configuredNextAuthUrl: process.env.NEXTAUTH_URL,
  }).baseUrl;
}

export function getShopifyBaseResolution(request: NextRequest) {
  const resolved = resolveShopifyBaseUrl({
    requestProtocol: request.nextUrl.protocol,
    requestHost: request.nextUrl.host,
    configuredNextAuthUrl: process.env.NEXTAUTH_URL,
  });
  return {
    baseUrl: resolved.baseUrl,
    requestOrigin: resolved.requestOrigin,
    requestHost: resolved.normalizedRequestHost,
    source: resolved.usingConfigured ? "NEXTAUTH_URL" : "request",
  };
}

export function getShopifyCallbackUrlWithBase(baseUrl: string) {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  return `${normalizedBase}${SHOPIFY_CALLBACK_PATH}`;
}

export function getShopifyAuthUrlWithBase(baseUrl: string, state?: string) {
  const shop = getStoreDomain();
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  if (!clientId) throw new Error("SHOPIFY_CLIENT_ID is not configured.");

  const scopes = ["read_customers", "read_orders", "read_products"].join(",");
  const redirectUri = getShopifyCallbackUrlWithBase(baseUrl);
  const nonce = state ?? crypto.randomUUID();

  return `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${encodeURIComponent(
    scopes,
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}&shop=${encodeURIComponent(shop)}`;
}

export async function exchangeShopifyCodeForToken(code: string) {
  const shop = getStoreDomain();
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Shopify OAuth credentials are missing.");

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
    throw new Error(`Failed to exchange Shopify code for token: ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as { access_token: string };
  return payload.access_token;
}

export type ShopifyTokenSource = "database" | "SHOPIFY_ACCESS_TOKEN" | "SHOPIFY_ADMIN_ACCESS_TOKEN";

export async function getShopifyTokenFromState(): Promise<{
  state: Awaited<ReturnType<typeof prisma.integrationState.findUnique>>;
  token: string | null;
  tokenSource: ShopifyTokenSource | null;
}> {
  const state = await prisma.integrationState.findUnique({
    where: { provider: "shopify" },
  });

  const envAccess = process.env.SHOPIFY_ACCESS_TOKEN?.trim();
  if (envAccess) {
    const prefix = envAccess.length >= 8 ? envAccess.substring(0, 8) : envAccess;
    console.log("[shopify] token source: SHOPIFY_ACCESS_TOKEN (env, first) | prefix:", prefix);
    return { state, token: envAccess, tokenSource: "SHOPIFY_ACCESS_TOKEN" };
  }

  const envAdmin = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim();
  if (envAdmin) {
    const prefix = envAdmin.length >= 8 ? envAdmin.substring(0, 8) : envAdmin;
    console.log("[shopify] token source: SHOPIFY_ADMIN_ACCESS_TOKEN (env, second) | prefix:", prefix);
    return { state, token: envAdmin, tokenSource: "SHOPIFY_ADMIN_ACCESS_TOKEN" };
  }

  if (state?.accessToken?.trim()) {
    const token = state.accessToken.trim();
    const prefix = token.length >= 8 ? token.substring(0, 8) : token;
    console.log("[shopify] token source: IntegrationState.accessToken (database, fallback) | prefix:", prefix);
    return { state, token, tokenSource: "database" };
  }

  console.warn("[shopify] no token: set SHOPIFY_ACCESS_TOKEN / SHOPIFY_ADMIN_ACCESS_TOKEN or IntegrationState.accessToken");
  return { state, token: null, tokenSource: null };
}

export function getSyncCursorFromState(
  state:
    | {
        shopifyLastOrdersSyncAt?: Date | null;
        shopifyLastProductsSyncAt?: Date | null;
        shopifyLastCustomersSyncAt?: Date | null;
        lastSyncAt?: Date | null;
      }
    | null
    | undefined,
  mode: ShopifySyncMode,
) {
  if (mode === "full") {
    return {
      ordersSinceAt: null,
      productsSinceAt: null,
      customersSinceAt: null,
    };
  }

  return {
    ordersSinceAt: state?.shopifyLastOrdersSyncAt ?? state?.lastSyncAt ?? null,
    productsSinceAt: state?.shopifyLastProductsSyncAt ?? state?.lastSyncAt ?? null,
    customersSinceAt: state?.shopifyLastCustomersSyncAt ?? state?.lastSyncAt ?? null,
  };
}

export function formatSyncSummaryMessage(summary: ShopifySyncSummary) {
  const base = `Synced ${summary.customersUpserted} customers, ${summary.ordersUpserted} orders, ${summary.productsUpserted} products`;
  if (!summary.warnings.length) return base;
  return `${base}. Warnings: ${summary.warnings.join(" | ")}`;
}

export function serializeWarnings(warnings: string[]) {
  return warnings.length ? warnings : [];
}

export function sanitizeShopifyErrorMessage(message: string) {
  return message
    .replace(/https?:\/\/[^/\s:@]+:[^@\s]+@/gi, "https://[REDACTED]@")
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [REDACTED]");
}

export function toSyncDebugPayload() {
  return {
    apiVersion: SHOPIFY_API_VERSION,
    hasStore: Boolean(process.env.SHOPIFY_STORE_NAME),
    hasClientId: Boolean(process.env.SHOPIFY_CLIENT_ID),
    hasClientSecret: Boolean(process.env.SHOPIFY_CLIENT_SECRET),
    hasAccessToken: Boolean(process.env.SHOPIFY_ACCESS_TOKEN),
    hasAdminAccessToken: Boolean(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
    storeDomain: process.env.SHOPIFY_STORE_NAME
      ? `${getStoreName()}.myshopify.com`
      : null,
  };
}

export function toCursorMeta(cursor: {
  ordersSinceAt: Date | null;
  productsSinceAt: Date | null;
  customersSinceAt: Date | null;
}) {
  return {
    ordersSinceAt: toIsoParam(cursor.ordersSinceAt),
    productsSinceAt: toIsoParam(cursor.productsSinceAt),
    customersSinceAt: toIsoParam(cursor.customersSinceAt),
  };
}
