# AI Retention Marketer for E-Commerce

Full-stack retention marketing platform for DTC/e-commerce teams with:

- Analytics-first dashboard (overview metrics, cohorts, RFM segmentation, attribution, product insights)
- AI message composer for Email/SMS (Groq with fallback responses)
- Campaign and template management foundations
- Churn risk scoring and at-risk customer workflows
- Shopify incremental/full sync + background jobs + webhook ingestion
- Prisma/PostgreSQL-backed data model with rich seed data

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Prisma ORM + PostgreSQL
- SWR for client data fetching
- Recharts for analytics visualization
- Groq SDK (`llama-3.3-70b-versatile`)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

Required vars:

```env
DATABASE_URL="postgresql://..."
GROQ_API_KEY=""
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"
SHOPIFY_STORE_NAME=""
SHOPIFY_CLIENT_ID=""
SHOPIFY_CLIENT_SECRET=""
KLAVIYO_API_KEY=""
```

3. Generate Prisma client and sync schema:

```bash
npm run db:generate
npm run db:push
```

4. Seed data:

```bash
npm run db:seed
```

5. Start app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Seed profile

The seed script creates realistic e-commerce data:

- 200 customers with segment distribution targets
- 1,500+ orders across last 18 months with seasonality
- 50 products across skincare/apparel/accessories/bundles
- 10,000+ customer events
- 5 campaigns and metrics history
- message templates

## Routes

### Pages

- `/dashboard`
- `/customers`, `/customers/[id]`
- `/segments`
- `/campaigns`, `/campaigns/new`, `/campaigns/[id]`, `/campaigns/[id]/edit`
- `/composer`
- `/templates`
- `/settings`

### APIs

- `/api/analytics/*`
- `/api/customers/*`
- `/api/campaigns/*`
- `/api/ai/*`
- `/api/templates/*`
- `/api/webhooks/*`
- `/api/auth/shopify` and `/api/auth/shopify/callback` for Shopify OAuth
- `/api/auth/shopify/diagnostics` for runtime OAuth URL diagnostics
- `/api/shopify/sync` for incremental/full sync + background jobs + status
- `/api/shopify/sync/[runId]` for run polling
- `/api/webhooks/shopify/orders/create`
- `/api/webhooks/shopify/orders/updated`
- `/api/webhooks/shopify/products/update`

## Shopify env variables

Add these values to `.env`:

```env
SHOPIFY_STORE_NAME="your-store-name" # without .myshopify.com
SHOPIFY_CLIENT_ID=""
SHOPIFY_CLIENT_SECRET=""
SHOPIFY_ACCESS_TOKEN="" # optional if OAuth token stored in DB
SHOPIFY_ADMIN_ACCESS_TOKEN="" # optional fallback
SHOPIFY_WEBHOOK_SECRET="" # optional; enables HMAC verification on webhooks
```
