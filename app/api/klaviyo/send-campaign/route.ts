import { NextResponse } from "next/server";
import { z } from "zod";
import { sendKlaviyoCampaignMessage, triggerKlaviyoFlow } from "@/lib/klaviyo";

const schema = z.object({
  channel: z.enum(["email", "sms"]),
  customerId: z.string().optional(),
  customerEmail: z.string().email().optional(),
  flowId: z.string().optional(),
  message: z
    .object({
      subject: z.string().optional(),
      preview: z.string().optional(),
      body: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
  recipients: z.array(z.string()).optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const payload = schema.parse(await request.json());
    const recipients =
      payload.recipients?.filter(Boolean) ??
      [payload.customerEmail].filter((value): value is string => Boolean(value));
    const body =
      payload.body ??
      payload.message?.body ??
      payload.message?.message ??
      payload.message?.preview ??
      "";
    const subject = payload.subject ?? payload.message?.subject;
    if (!recipients.length || !body) {
      return NextResponse.json(
        { error: "Missing recipients or message body for Klaviyo send" },
        { status: 400 },
      );
    }

    const result = await sendKlaviyoCampaignMessage({
      channel: payload.channel,
      recipients,
      subject,
      body,
    });
    let flowTriggerResult: unknown = null;
    if (payload.flowId && recipients[0]) {
      flowTriggerResult = await triggerKlaviyoFlow(payload.flowId, recipients[0]);
    }

    return NextResponse.json({ ...result, flowTriggerResult });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to send Klaviyo campaign", detail: (error as Error).message },
      { status: 500 },
    );
  }
}
