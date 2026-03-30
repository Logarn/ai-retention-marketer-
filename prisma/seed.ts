import { faker } from "@faker-js/faker";
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  max as dateMax,
  min as dateMin,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { PrismaClient, Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { CHURN_WEIGHTS, FLOW_TEMPLATES, SEGMENT_DEFINITIONS } from "../lib/constants";
import { calculateRfmScore, pickSegmentFromScores } from "../lib/segment";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run the seed script.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString })),
});

type SeedCustomerSegment =
  | "champions"
  | "loyal_customers"
  | "potential_loyalists"
  | "at_risk"
  | "cant_lose_them"
  | "hibernating"
  | "new_customers";

type ProductSpec = {
  name: string;
  sku: string;
  price: number;
  category: string;
  avgReplenishmentDays?: number | null;
};

const now = new Date();
const startDate = subMonths(now, 18);
const totalCustomers = 200;

const segmentTargets: Array<{ segment: SeedCustomerSegment; count: number }> = [
  { segment: "champions", count: 20 },
  { segment: "loyal_customers", count: 30 },
  { segment: "potential_loyalists", count: 40 },
  { segment: "at_risk", count: 30 },
  { segment: "cant_lose_them", count: 20 },
  { segment: "hibernating", count: 40 },
  { segment: "new_customers", count: 20 },
];

const seasonalFactor = (date: Date): number => {
  const month = date.getMonth();
  if (month === 10 || month === 11) return 1.6;
  if (month === 8 || month === 9) return 1.2;
  if (month === 0 || month === 1) return 0.85;
  return 1;
};

const baseProducts: ProductSpec[] = [
  // Skincare
  { name: "Hydrating Serum", sku: "SC-HS-001", price: 42, category: "Skincare", avgReplenishmentDays: 35 },
  { name: "Vitamin C Glow Serum", sku: "SC-VC-002", price: 48, category: "Skincare", avgReplenishmentDays: 30 },
  { name: "Daily Moisturizer", sku: "SC-DM-003", price: 36, category: "Skincare", avgReplenishmentDays: 40 },
  { name: "Retinol Night Cream", sku: "SC-RN-004", price: 54, category: "Skincare", avgReplenishmentDays: 45 },
  { name: "Gentle Cleanser", sku: "SC-GC-005", price: 24, category: "Skincare", avgReplenishmentDays: 30 },
  { name: "SPF 50 Day Shield", sku: "SC-SP-006", price: 29, category: "Skincare", avgReplenishmentDays: 30 },
  { name: "Peptide Eye Cream", sku: "SC-PE-007", price: 39, category: "Skincare", avgReplenishmentDays: 50 },
  { name: "Overnight Repair Mask", sku: "SC-OM-008", price: 45, category: "Skincare", avgReplenishmentDays: 60 },
  { name: "Niacinamide Toner", sku: "SC-NT-009", price: 27, category: "Skincare", avgReplenishmentDays: 45 },
  { name: "Exfoliating Pads", sku: "SC-EP-010", price: 34, category: "Skincare", avgReplenishmentDays: 40 },
  { name: "Hyaluronic Mist", sku: "SC-HM-011", price: 26, category: "Skincare", avgReplenishmentDays: 30 },
  { name: "Cleansing Balm", sku: "SC-CB-012", price: 31, category: "Skincare", avgReplenishmentDays: 35 },
  { name: "Barrier Recovery Cream", sku: "SC-BR-013", price: 44, category: "Skincare", avgReplenishmentDays: 50 },
  { name: "AHA Renewal Peel", sku: "SC-AR-014", price: 37, category: "Skincare", avgReplenishmentDays: 45 },
  { name: "Travel Essentials Set", sku: "SC-TS-015", price: 52, category: "Skincare", avgReplenishmentDays: 60 },

  // Apparel
  { name: "Core Tee", sku: "AP-CT-016", price: 28, category: "Apparel" },
  { name: "Relaxed Hoodie", sku: "AP-RH-017", price: 68, category: "Apparel" },
  { name: "Athletic Joggers", sku: "AP-AJ-018", price: 62, category: "Apparel" },
  { name: "Performance Shorts", sku: "AP-PS-019", price: 44, category: "Apparel" },
  { name: "Cloud Knit Sweater", sku: "AP-CS-020", price: 76, category: "Apparel" },
  { name: "Everyday Leggings", sku: "AP-EL-021", price: 58, category: "Apparel" },
  { name: "Structured Blazer", sku: "AP-SB-022", price: 110, category: "Apparel" },
  { name: "Weekend Dress", sku: "AP-WD-023", price: 89, category: "Apparel" },
  { name: "Denim Jacket", sku: "AP-DJ-024", price: 95, category: "Apparel" },
  { name: "Puffer Vest", sku: "AP-PV-025", price: 82, category: "Apparel" },
  { name: "Thermal Long Sleeve", sku: "AP-TL-026", price: 39, category: "Apparel" },
  { name: "Linen Shirt", sku: "AP-LS-027", price: 51, category: "Apparel" },
  { name: "Chino Pants", sku: "AP-CP-028", price: 64, category: "Apparel" },
  { name: "Merino Socks 3-Pack", sku: "AP-MS-029", price: 22, category: "Apparel" },
  { name: "Classic Trench", sku: "AP-TR-030", price: 139, category: "Apparel" },

  // Accessories
  { name: "Canvas Tote", sku: "AC-CT-031", price: 25, category: "Accessories" },
  { name: "Insulated Bottle", sku: "AC-IB-032", price: 32, category: "Accessories" },
  { name: "Leather Card Holder", sku: "AC-LC-033", price: 38, category: "Accessories" },
  { name: "Silk Scarf", sku: "AC-SS-034", price: 47, category: "Accessories" },
  { name: "Minimalist Watch", sku: "AC-MW-035", price: 120, category: "Accessories" },
  { name: "Crew Cap", sku: "AC-CC-036", price: 23, category: "Accessories" },
  { name: "Crossbody Bag", sku: "AC-CB-037", price: 88, category: "Accessories" },
  { name: "Travel Pouch Set", sku: "AC-TP-038", price: 34, category: "Accessories" },
  { name: "Yoga Mat Strap", sku: "AC-YS-039", price: 19, category: "Accessories" },
  { name: "Sunglasses", sku: "AC-SG-040", price: 64, category: "Accessories" },
  { name: "Phone Grip Stand", sku: "AC-PG-041", price: 16, category: "Accessories" },
  { name: "Laptop Sleeve", sku: "AC-LS-042", price: 42, category: "Accessories" },
  { name: "Weekend Duffel", sku: "AC-WD-043", price: 98, category: "Accessories" },
  { name: "Anklet Set", sku: "AC-AS-044", price: 21, category: "Accessories" },
  { name: "Charm Bracelet", sku: "AC-CB-045", price: 55, category: "Accessories" },

  // Bundles
  { name: "Glow Routine Bundle", sku: "BU-GR-046", price: 118, category: "Bundles", avgReplenishmentDays: 45 },
  { name: "Starter Skincare Kit", sku: "BU-SS-047", price: 96, category: "Bundles", avgReplenishmentDays: 50 },
  { name: "Travel Capsule Bundle", sku: "BU-TC-048", price: 132, category: "Bundles" },
  { name: "Winter Layering Pack", sku: "BU-WL-049", price: 168, category: "Bundles" },
  { name: "VIP Favorites Bundle", sku: "BU-VF-050", price: 189, category: "Bundles" },
];

function weightedRandom<T>(items: Array<{ item: T; weight: number }>): T {
  const total = items.reduce((acc, cur) => acc + cur.weight, 0);
  let threshold = Math.random() * total;
  for (const entry of items) {
    threshold -= entry.weight;
    if (threshold <= 0) return entry.item;
  }
  return items[items.length - 1].item;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getOrderCountForSegment(segment: SeedCustomerSegment): number {
  switch (segment) {
    case "champions":
      return faker.number.int({ min: 12, max: 28 });
    case "loyal_customers":
      return faker.number.int({ min: 8, max: 18 });
    case "potential_loyalists":
      return faker.number.int({ min: 4, max: 10 });
    case "at_risk":
      return faker.number.int({ min: 6, max: 14 });
    case "cant_lose_them":
      return faker.number.int({ min: 8, max: 16 });
    case "hibernating":
      return faker.number.int({ min: 1, max: 4 });
    case "new_customers":
      return faker.number.int({ min: 1, max: 3 });
    default:
      return faker.number.int({ min: 2, max: 6 });
  }
}

function getRecencyDaysForSegment(segment: SeedCustomerSegment): number {
  switch (segment) {
    case "champions":
      return faker.number.int({ min: 1, max: 15 });
    case "loyal_customers":
      return faker.number.int({ min: 5, max: 30 });
    case "potential_loyalists":
      return faker.number.int({ min: 12, max: 40 });
    case "at_risk":
      return faker.number.int({ min: 60, max: 120 });
    case "cant_lose_them":
      return faker.number.int({ min: 80, max: 180 });
    case "hibernating":
      return faker.number.int({ min: 140, max: 360 });
    case "new_customers":
      return faker.number.int({ min: 0, max: 10 });
    default:
      return faker.number.int({ min: 30, max: 90 });
  }
}

function getAovBaseForSegment(segment: SeedCustomerSegment): number {
  switch (segment) {
    case "champions":
      return faker.number.float({ min: 85, max: 150, fractionDigits: 2 });
    case "loyal_customers":
      return faker.number.float({ min: 70, max: 125, fractionDigits: 2 });
    case "potential_loyalists":
      return faker.number.float({ min: 55, max: 95, fractionDigits: 2 });
    case "at_risk":
      return faker.number.float({ min: 65, max: 110, fractionDigits: 2 });
    case "cant_lose_them":
      return faker.number.float({ min: 95, max: 180, fractionDigits: 2 });
    case "hibernating":
      return faker.number.float({ min: 35, max: 80, fractionDigits: 2 });
    case "new_customers":
      return faker.number.float({ min: 50, max: 100, fractionDigits: 2 });
    default:
      return faker.number.float({ min: 45, max: 110, fractionDigits: 2 });
  }
}

function randomOrderDate(targetRecentDays: number, orderIndex: number, totalOrders: number): Date {
  const recentAnchor = subDays(now, targetRecentDays);
  const spreadMonths = 18;
  const ratio = totalOrders <= 1 ? 1 : orderIndex / (totalOrders - 1);
  const baseline = addMonths(startDate, Math.floor(ratio * spreadMonths));
  const anchor = dateMin([recentAnchor, now]);
  const candidate = dateMax([baseline, startDate]);
  const from = dateMin([candidate, anchor]);
  const to = dateMax([candidate, anchor]);
  const randomDate = faker.date.between({ from, to });
  return randomDate;
}

function getFlowConfig(name: string): PrismaTypes.JsonObject {
  const template = FLOW_TEMPLATES.find((f) => f.name === name) ?? FLOW_TEMPLATES[0];
  return {
    nodes: template.nodes as unknown as PrismaTypes.JsonArray,
    edges: template.edges as unknown as PrismaTypes.JsonArray,
  };
}

async function main() {
  console.log("Seeding database...");
  await prisma.campaignReceipt.deleteMany();
  await prisma.campaignMetrics.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.customerEvent.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.messageTemplate.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.product.deleteMany();

  const products = await prisma.product.createManyAndReturn({
    data: baseProducts.map((p) => ({
      name: p.name,
      sku: p.sku,
      price: p.price,
      category: p.category,
      imageUrl: `https://picsum.photos/seed/${p.sku}/640/640`,
      avgReplenishmentDays: p.avgReplenishmentDays ?? null,
    })),
  });

  const productByCategory = {
    Skincare: products.filter((p) => p.category === "Skincare"),
    Apparel: products.filter((p) => p.category === "Apparel"),
    Accessories: products.filter((p) => p.category === "Accessories"),
    Bundles: products.filter((p) => p.category === "Bundles"),
  };

  const createdCustomerIds: string[] = [];
  let totalOrderCount = 0;
  let totalEventCount = 0;

  for (const segmentTarget of segmentTargets) {
    for (let i = 0; i < segmentTarget.count; i++) {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const email = `${firstName}.${lastName}.${faker.string.alphanumeric(4).toLowerCase()}@example.com`.toLowerCase();
      const phone = `+1${faker.string.numeric(10)}`;
      const createdAt = faker.date.between({ from: startDate, to: subDays(now, 5) });

      const customer = await prisma.customer.create({
        data: {
          email,
          phone,
          firstName,
          lastName,
          createdAt,
        },
      });
      createdCustomerIds.push(customer.id);

      const orderCount = getOrderCountForSegment(segmentTarget.segment);
      const targetRecency = getRecencyDaysForSegment(segmentTarget.segment);
      const aovBase = getAovBaseForSegment(segmentTarget.segment);
      const customerOrders: Array<{ id: string; totalAmount: number; createdAt: Date }> = [];

      for (let orderIndex = 0; orderIndex < orderCount; orderIndex++) {
        const orderDate = randomOrderDate(targetRecency, orderIndex, orderCount);
        const dateWithSeasonality = Math.random() < seasonalFactor(orderDate) / 2;
        const finalOrderDate = dateWithSeasonality
          ? faker.date.between({
              from: startOfMonth(orderDate),
              to: endOfMonth(orderDate),
            })
          : orderDate;

        const lineItems = faker.number.int({ min: 1, max: 4 });
        const preferredCategoryWeights =
          segmentTarget.segment === "champions" || segmentTarget.segment === "cant_lose_them"
            ? [
                { item: "Skincare", weight: 3 },
                { item: "Bundles", weight: 3 },
                { item: "Apparel", weight: 2 },
                { item: "Accessories", weight: 2 },
              ]
            : [
                { item: "Skincare", weight: 3 },
                { item: "Apparel", weight: 3 },
                { item: "Accessories", weight: 2 },
                { item: "Bundles", weight: 1.5 },
              ];

        const selectedProducts = Array.from({ length: lineItems }).map(() => {
          const category = weightedRandom(preferredCategoryWeights);
          const productPool = productByCategory[category as keyof typeof productByCategory];
          return faker.helpers.arrayElement(productPool);
        });

        let totalAmount = 0;
        const order = await prisma.order.create({
          data: {
            customerId: customer.id,
            orderNumber: `ORD-${format(finalOrderDate, "yyyyMMdd")}-${faker.string.numeric(5)}`,
            totalAmount: 0,
            status: "delivered",
            createdAt: finalOrderDate,
            deliveredAt: addDays(finalOrderDate, faker.number.int({ min: 1, max: 7 })),
          },
        });

        for (const product of selectedProducts) {
          const quantity = faker.number.int({ min: 1, max: 3 });
          const unitPrice = product.price * faker.number.float({ min: 0.9, max: 1.05, fractionDigits: 2 });
          totalAmount += unitPrice * quantity;

          await prisma.orderItem.create({
            data: {
              orderId: order.id,
              productId: product.id,
              quantity,
              price: unitPrice,
            },
          });
        }

        const adjustedAmount =
          segmentTarget.segment === "champions" || segmentTarget.segment === "cant_lose_them"
            ? totalAmount * faker.number.float({ min: 1.05, max: 1.25, fractionDigits: 2 })
            : totalAmount * (aovBase / Math.max(60, totalAmount));

        const normalizedTotal = Number(clampNumber(adjustedAmount, 22, 380).toFixed(2));

        await prisma.order.update({
          where: { id: order.id },
          data: { totalAmount: normalizedTotal },
        });

        customerOrders.push({
          id: order.id,
          totalAmount: normalizedTotal,
          createdAt: finalOrderDate,
        });
        totalOrderCount += 1;
      }

      customerOrders.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const firstOrderDate = customerOrders[0]?.createdAt ?? null;
      const lastOrderDate = customerOrders[customerOrders.length - 1]?.createdAt ?? null;
      const totalSpent = customerOrders.reduce((acc, o) => acc + o.totalAmount, 0);
      const avgOrderValue = customerOrders.length ? totalSpent / customerOrders.length : 0;

      const daysSinceLast = lastOrderDate ? Math.floor((now.getTime() - lastOrderDate.getTime()) / 86_400_000) : 999;
      const recencyScore = calculateRfmScore(daysSinceLast, [15, 30, 60, 90], true);
      const frequencyScore = calculateRfmScore(customerOrders.length, [2, 4, 8, 12], false);
      const monetaryScore = calculateRfmScore(avgOrderValue, [45, 70, 95, 125], false);
      const segment = pickSegmentFromScores(recencyScore, frequencyScore, monetaryScore);

      const purchaseTrendDecline = clampNumber((daysSinceLast - 30) / 120, 0, 1);
      const engagementBase =
        segmentTarget.segment === "champions"
          ? faker.number.float({ min: 0.65, max: 0.95 })
          : segmentTarget.segment === "hibernating"
            ? faker.number.float({ min: 0.05, max: 0.3 })
            : faker.number.float({ min: 0.2, max: 0.8 });
      const browseBase =
        segmentTarget.segment === "new_customers"
          ? faker.number.float({ min: 0.5, max: 0.9 })
          : segmentTarget.segment === "hibernating"
            ? faker.number.float({ min: 0.02, max: 0.25 })
            : faker.number.float({ min: 0.15, max: 0.75 });

      const churnRiskScore = Math.round(
        clampNumber(
          (daysSinceLast / 180) * CHURN_WEIGHTS.daysSinceLastPurchase * 100 +
            purchaseTrendDecline * CHURN_WEIGHTS.frequencyTrend * 100 +
            (1 - engagementBase) * CHURN_WEIGHTS.emailEngagement * 100 +
            (1 - browseBase) * CHURN_WEIGHTS.browseActivity * 100,
          0,
          100,
        ),
      );

      const acquisitionSource = faker.helpers.weightedArrayElement([
        { value: "meta_ads", weight: 28 },
        { value: "google_ads", weight: 24 },
        { value: "organic_search", weight: 18 },
        { value: "influencer", weight: 10 },
        { value: "email", weight: 12 },
        { value: "referral", weight: 8 },
      ]);

      for (const order of customerOrders) {
        const perOrderEvents = faker.number.int({ min: 4, max: 9 });
        const productViewCandidate = await prisma.orderItem.findFirst({
          where: { orderId: order.id },
          include: { product: true },
        });
        for (let j = 0; j < perOrderEvents; j++) {
          const eventType = weightedRandom([
            { item: "page_view", weight: 3.5 },
            { item: "product_view", weight: 2.8 },
            { item: "add_to_cart", weight: 1.4 },
            { item: "email_open", weight: 1.2 },
            { item: "email_click", weight: 0.8 },
            { item: "sms_click", weight: 0.45 },
          ]);

          await prisma.customerEvent.create({
            data: {
              customerId: customer.id,
              eventType,
              createdAt: faker.date.between({
                from: subDays(order.createdAt, 20),
                to: addDays(order.createdAt, 4),
              }),
              properties: {
                source: acquisitionSource,
                productId: productViewCandidate?.productId ?? null,
                productName: productViewCandidate?.product.name ?? null,
                orderId: order.id,
              },
            },
          });
          totalEventCount += 1;
        }
      }

      // Additional browsing and engagement events over timeline
      const extraEvents = faker.number.int({ min: 16, max: 42 });
      for (let k = 0; k < extraEvents; k++) {
        const sampleProduct = faker.helpers.arrayElement(products);
        await prisma.customerEvent.create({
          data: {
            customerId: customer.id,
            eventType: weightedRandom([
              { item: "page_view", weight: 5 },
              { item: "product_view", weight: 3.2 },
              { item: "add_to_cart", weight: 1.3 },
              { item: "email_open", weight: 1.8 },
              { item: "email_click", weight: 1.0 },
              { item: "sms_click", weight: 0.6 },
            ]),
            createdAt: faker.date.between({ from: startDate, to: now }),
            properties: {
              source: acquisitionSource,
              productId: sampleProduct.id,
              productName: sampleProduct.name,
            },
          },
        });
        totalEventCount += 1;
      }

      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          totalOrders: customerOrders.length,
          totalSpent: Number(totalSpent.toFixed(2)),
          avgOrderValue: Number(avgOrderValue.toFixed(2)),
          firstOrderDate,
          lastOrderDate,
          recencyScore,
          frequencyScore,
          monetaryScore,
          segment,
          churnRiskScore,
        },
      });
    }
  }

  const campaignDefinitions: Array<{
    name: string;
    type: "one_time" | "automated_flow";
    channel: "email" | "sms" | "multi";
    status: "draft" | "active" | "paused" | "completed";
    subject?: string;
    body?: string;
    flowTemplateName?: string;
  }> = [
    {
      name: "Holiday VIP Preview",
      type: "one_time",
      channel: "email",
      status: "completed",
      subject: "VIP early access starts now",
      body: "Shop 48 hours early and enjoy complimentary shipping.",
    },
    {
      name: "Q4 Win-Back Burst",
      type: "one_time",
      channel: "multi",
      status: "completed",
      subject: "We miss you - 12% off this week",
      body: "A limited-time incentive to reactivate high CLV customers.",
    },
    {
      name: "Post-Purchase Nurture",
      type: "automated_flow",
      channel: "multi",
      status: "active",
      flowTemplateName: "Post-Purchase Nurture Flow",
    },
    {
      name: "60-Day Win-Back",
      type: "automated_flow",
      channel: "multi",
      status: "active",
      flowTemplateName: "Win-Back Flow",
    },
    {
      name: "Smart Replenishment",
      type: "automated_flow",
      channel: "email",
      status: "active",
      flowTemplateName: "Replenishment Flow",
    },
  ];

  const campaigns = [];
  for (const definition of campaignDefinitions) {
    const createdCampaign = await prisma.campaign.create({
      data: {
        name: definition.name,
        type: definition.type,
        channel: definition.channel,
        status: definition.status,
        subject: definition.subject,
        body: definition.body,
        flowConfig: definition.flowTemplateName
          ? (getFlowConfig(definition.flowTemplateName) as PrismaTypes.InputJsonValue)
          : Prisma.JsonNull,
        scheduledAt: faker.date.recent({ days: 90 }),
        sentAt: definition.status === "completed" ? faker.date.recent({ days: 60 }) : null,
      },
    });
    campaigns.push(createdCampaign);
  }

  const allCustomers = await prisma.customer.findMany({
    select: { id: true, totalSpent: true, churnRiskScore: true, segment: true },
  });

  for (const campaign of campaigns) {
    const recipients = faker.helpers.arrayElements(
      allCustomers,
      faker.number.int({ min: 70, max: 130 }),
    );

    let sent = 0;
    let delivered = 0;
    let opened = 0;
    let clicked = 0;
    let converted = 0;
    let revenue = 0;
    let unsubscribed = 0;

    for (const customer of recipients) {
      const sentAt = faker.date.recent({ days: 45 });
      const channel =
        campaign.channel === "multi"
          ? faker.helpers.arrayElement(["email", "sms"])
          : campaign.channel;
      const deliverProbability = channel === "sms" ? 0.98 : 0.95;
      const openProbability = channel === "sms" ? 0.58 : 0.33;
      const clickProbability = channel === "sms" ? 0.16 : 0.11;
      const conversionBoost =
        customer.segment === "champions" || customer.segment === "loyal_customers" ? 1.35 : 1;
      const conversionProbability = (channel === "sms" ? 0.07 : 0.045) * conversionBoost;

      sent += 1;
      const deliveredHit = Math.random() < deliverProbability;
      if (deliveredHit) delivered += 1;
      const openedHit = deliveredHit && Math.random() < openProbability;
      if (openedHit) opened += 1;
      const clickedHit = openedHit && Math.random() < clickProbability;
      if (clickedHit) clicked += 1;
      const convertedHit = clickedHit && Math.random() < conversionProbability;
      if (convertedHit) {
        converted += 1;
        const rev = Number(
          faker.number
            .float({
              min: 38,
              max: 180,
              fractionDigits: 2,
            })
            .toFixed(2),
        );
        revenue += rev;
      }
      const unsubscribedHit = deliveredHit && Math.random() < 0.007;
      if (unsubscribedHit) unsubscribed += 1;

      await prisma.campaignReceipt.create({
        data: {
          campaignId: campaign.id,
          customerId: customer.id,
          channel,
          status: convertedHit
            ? "converted"
            : clickedHit
              ? "clicked"
              : openedHit
                ? "opened"
                : deliveredHit
                  ? "delivered"
                  : "bounced",
          sentAt,
          openedAt: openedHit ? addDays(sentAt, 1) : null,
          clickedAt: clickedHit ? addDays(sentAt, 1) : null,
          convertedAt: convertedHit ? addDays(sentAt, 2) : null,
          revenue: convertedHit ? Number((revenue / converted).toFixed(2)) : null,
        },
      });
    }

    await prisma.campaignMetrics.create({
      data: {
        campaignId: campaign.id,
        sent,
        delivered,
        opened,
        clicked,
        converted,
        revenue: Number(revenue.toFixed(2)),
        unsubscribed,
      },
    });
  }

  const templateSeed = [
    {
      name: "Warm Win-Back Email",
      channel: "email",
      type: "win_back",
      subject: "A little something to welcome you back",
      body: "Hi {{first_name}}, we noticed it has been a while. Here is 10% off your next order.",
    },
    {
      name: "Urgent SMS Reminder",
      channel: "sms",
      type: "win_back",
      body: "{{first_name}}, your 10% offer expires tomorrow. Shop now: {{link}}",
    },
    {
      name: "Post-Purchase Education",
      channel: "email",
      type: "post_purchase",
      subject: "Get the most from your new purchase",
      body: "Thanks for your order! Here are tips to get even better results.",
    },
    {
      name: "VIP Early Access",
      channel: "email",
      type: "vip",
      subject: "VIP-only early access starts now",
      body: "You are one of our top customers. Enjoy 48-hour priority access.",
    },
  ];

  await prisma.messageTemplate.createMany({ data: templateSeed });

  const segmentSummary = await prisma.customer.groupBy({
    by: ["segment"],
    _count: { segment: true },
    orderBy: { segment: "asc" },
  });

  const definitionMap = new Map<string, string>(SEGMENT_DEFINITIONS.map((d) => [d.key, d.label]));
  console.log("Seed complete.");
  console.log(`Customers: ${totalCustomers}`);
  console.log(`Orders: ${totalOrderCount}`);
  console.log(`Events: ${totalEventCount}`);
  console.log(
    "Segments:",
    segmentSummary
      .map((row) => `${definitionMap.get(row.segment ?? "") ?? row.segment}:${row._count.segment}`)
      .join(", "),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
